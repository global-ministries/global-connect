-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: pre-check-in from the car (odd/tasks/ninos-precheck.md, task P1).
--
-- A parent with an account tells the check-in table "we are on our way" from
-- Mi Perfil → Mis hijos. The table sees a "Llegando" list for its service and
-- checks the family in with one tap through the existing ninos_checkin, which
-- issues the code as today. Nothing here counts as attendance and the phone
-- never gets a code.
--
-- Service window. dream_team_turnos stores the start (dia_semana, hora) but no
-- end, so the window assumes a service of 2 hours: a turno is open for
-- pre-check-in on its weekday (Caracas time), from 2 hours before its start
-- until 2 hours after it. Both offsets live in ninos_precheck_en_ventana only.
-- Rows are never swept: a pending row outside its window reads as 'expirado'
-- and is never listed as arriving (past services are not pending).
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_prechecks (nino_id, turno_id, fecha, solicitado_por, estado
--      pendiente | ingresado | cancelado | expirado, avisos, timestamps),
--      unique (nino_id, turno_id, fecha). RLS on, no client privileges.
--   2. ninos_precheck_en_ventana(uuid) → boolean. Internal.
--   3. ninos_precheck_avisar(p_turno_id uuid, p_nino_ids uuid[]) → jsonb
--      {turno_id, fecha, avisados: [nino_id]}. The parent comes from the
--      session; each child must be theirs (ninos_es_mi_hijo) and have a
--      ficha; at most 10 children per call; the turno must be in its window
--      on a campus with active rooms. A child already pending is idempotent;
--      a cancelled row is reopened; a child already checked in is refused.
--      Daily cap: 30 notices per parent per day (reopenings count).
--      Errors: sin_autoridad (42501) for no session or a minor account
--      (G8); datos_invalidos, limite_hijos, nino_no_encontrado, sin_ficha,
--      fuera_de_horario, ya_ingresado, limite_diario (22023).
--   4. ninos_precheck_cancelar(p_turno_id uuid) → jsonb {cancelados}: the
--      caller's children's pending rows of that turno today.
--   5. ninos_mis_prechecks() → jsonb {servicios, avisos}: today's turnos in
--      their window (campuses of the parent or the children with active
--      rooms; every campus with rooms when none is linked) and today's
--      notices of the caller's children. A minor gets empty lists.
--   6. ninos_prechecks_pendientes(p_turno_id uuid, p_fecha date) → jsonb: the
--      families arriving for that service, for staff that may operate an
--      active room of the turno's campus ('[]' for anyone else). Only today's
--      pending rows inside the window. Each family: the requester and the
--      pending children in the ninos_familia_hijos shape (room, alerts).
--   7. Trigger ninos_checkins_precheck (AFTER INSERT on ninos_checkins): the
--      check-in marks the child's pending row of that service 'ingresado'.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS ninos_checkins_precheck ON public.ninos_checkins;
--   DROP FUNCTION IF EXISTS public.ninos_checkins_marcar_precheck(),
--     public.ninos_prechecks_pendientes(uuid, date), public.ninos_mis_prechecks(),
--     public.ninos_precheck_cancelar(uuid), public.ninos_precheck_avisar(uuid, uuid[]),
--     public.ninos_precheck_en_ventana(uuid);
--   DROP TABLE IF EXISTS public.ninos_prechecks;

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_prechecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  solicitado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ingresado', 'cancelado', 'expirado')),
  avisos integer NOT NULL DEFAULT 1 CHECK (avisos > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ninos_prechecks_un_servicio UNIQUE (nino_id, turno_id, fecha)
);
CREATE INDEX IF NOT EXISTS ninos_prechecks_servicio_idx
  ON public.ninos_prechecks (turno_id, fecha) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS ninos_prechecks_solicitante_idx ON public.ninos_prechecks (solicitado_por, fecha);

ALTER TABLE public.ninos_prechecks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ninos_prechecks FROM PUBLIC, anon, authenticated;

-- ── 2. service window ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_precheck_en_ventana(p_turno_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dream_team_turnos t
     WHERE t.id = p_turno_id AND t.activo
       AND t.dia_semana = extract(dow FROM public.ninos_hoy())::smallint
       -- 2 h before the start until the assumed end (start + 2 h), Caracas time.
       AND (now() AT TIME ZONE 'America/Caracas')
           BETWEEN public.ninos_hoy() + t.hora - interval '2 hours'
               AND public.ninos_hoy() + t.hora + interval '2 hours');
$$;
REVOKE ALL ON FUNCTION public.ninos_precheck_en_ventana(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. "Voy en camino" ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_precheck_avisar(p_turno_id uuid, p_nino_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo     uuid := public.ninos_usuario_actual();
  v_hoy    date := public.ninos_hoy();
  v_ninos  uuid[];
  v_nino   uuid;
  v_estado text;
  v_nuevos integer := 0;
BEGIN
  -- An account whose birth date says under 18 has no Mis hijos (G8).
  IF v_yo IS NULL OR NOT public.ninos_es_mayor_de_edad(v_yo) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ninos FROM unnest(p_nino_ids) AS t(x) WHERE x IS NOT NULL;
  IF p_turno_id IS NULL OR v_ninos IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ninos) > 10 THEN
    RAISE EXCEPTION 'limite_hijos' USING ERRCODE = '22023';
  END IF;
  FOREACH v_nino IN ARRAY v_ninos LOOP
    IF NOT public.ninos_es_mi_hijo(v_nino) THEN
      RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = v_nino) THEN
      RAISE EXCEPTION 'sin_ficha' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT public.ninos_precheck_en_ventana(p_turno_id)
     OR NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t JOIN public.ninos_salones s ON s.campus_id = t.campus_id
                     WHERE t.id = p_turno_id AND s.activo) THEN
    RAISE EXCEPTION 'fuera_de_horario' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ninos_checkins c
              WHERE c.nino_id = ANY (v_ninos) AND c.turno_id = p_turno_id AND c.fecha = v_hoy) THEN
    RAISE EXCEPTION 'ya_ingresado' USING ERRCODE = '22023';
  END IF;

  -- One notice per parent at a time, so the daily cap cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_precheck_avisar:' || v_yo::text, 0));

  FOREACH v_nino IN ARRAY v_ninos LOOP
    SELECT p.estado INTO v_estado FROM public.ninos_prechecks p
     WHERE p.nino_id = v_nino AND p.turno_id = p_turno_id AND p.fecha = v_hoy FOR UPDATE;
    IF v_estado = 'ingresado' THEN
      RAISE EXCEPTION 'ya_ingresado' USING ERRCODE = '22023';
    ELSIF v_estado = 'pendiente' THEN
      CONTINUE;  -- already on its way: idempotent
    ELSIF v_estado IS NOT NULL THEN
      UPDATE public.ninos_prechecks
         SET estado = 'pendiente', solicitado_por = v_yo, avisos = avisos + 1, updated_at = now()
       WHERE nino_id = v_nino AND turno_id = p_turno_id AND fecha = v_hoy;
    ELSE
      INSERT INTO public.ninos_prechecks (nino_id, turno_id, fecha, solicitado_por)
      VALUES (v_nino, p_turno_id, v_hoy, v_yo);
    END IF;
    v_nuevos := v_nuevos + 1;
  END LOOP;

  IF (SELECT coalesce(sum(p.avisos), 0) FROM public.ninos_prechecks p
       WHERE p.solicitado_por = v_yo AND p.fecha = v_hoy) > 30 THEN
    RAISE EXCEPTION 'limite_diario' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('turno_id', p_turno_id, 'fecha', v_hoy, 'avisados', to_jsonb(v_ninos),
                            'nuevos', v_nuevos);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_precheck_avisar(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_precheck_avisar(uuid, uuid[]) TO authenticated;

-- ── 4. cancel ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_precheck_cancelar(p_turno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo uuid := public.ninos_usuario_actual();
  v_n  integer;
BEGIN
  IF v_yo IS NULL OR NOT public.ninos_es_mayor_de_edad(v_yo) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ninos_prechecks p
     SET estado = 'cancelado', updated_at = now()
   WHERE p.turno_id = p_turno_id AND p.fecha = public.ninos_hoy() AND p.estado = 'pendiente'
     AND public.ninos_es_mi_hijo(p.nino_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('cancelados', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_precheck_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_precheck_cancelar(uuid) TO authenticated;

-- ── 5. the parent's view ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mis_prechecks()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo     uuid := public.ninos_usuario_actual();
  v_hijos  uuid[];
  v_campus uuid[];
BEGIN
  IF v_yo IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF NOT public.ninos_es_mayor_de_edad(v_yo) THEN
    RETURN jsonb_build_object('servicios', '[]'::jsonb, 'avisos', '[]'::jsonb);
  END IF;
  SELECT coalesce(array_agg((e.h ->> 'id')::uuid), '{}') INTO v_hijos
    FROM jsonb_array_elements(public.ninos_familia_hijos(v_yo)) e(h);
  SELECT coalesce(array_agg(DISTINCT uc.campus_id), '{}') INTO v_campus
    FROM public.usuario_campus uc
   WHERE (uc.usuario_id = v_yo OR uc.usuario_id = ANY (v_hijos))
     AND EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = uc.campus_id AND s.activo);

  RETURN jsonb_build_object(
    'servicios', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('turno_id', t.id, 'nombre', t.nombre, 'hora', t.hora,
                                                   'campus_id', t.campus_id, 'campus', c.nombre)
                                ORDER BY c.nombre, t.orden, t.hora), '[]'::jsonb)
        FROM public.dream_team_turnos t
        JOIN public.campus c ON c.id = t.campus_id
       WHERE public.ninos_precheck_en_ventana(t.id)
         AND EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = t.campus_id AND s.activo)
         AND (cardinality(v_campus) = 0 OR t.campus_id = ANY (v_campus))),
    'avisos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'nino_id', p.nino_id, 'turno_id', p.turno_id,
                        'estado', CASE WHEN p.estado = 'pendiente' AND NOT public.ninos_precheck_en_ventana(p.turno_id)
                                       THEN 'expirado' ELSE p.estado END)
                      ORDER BY p.created_at), '[]'::jsonb)
        FROM public.ninos_prechecks p
       WHERE p.fecha = public.ninos_hoy() AND p.nino_id = ANY (v_hijos) AND p.estado IN ('pendiente', 'ingresado')));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_prechecks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_prechecks() TO authenticated;

-- ── 6. the table's "Llegando" list ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_prechecks_pendientes(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH turno AS (
    SELECT t.id, t.campus_id FROM public.dream_team_turnos t
     WHERE t.id = p_turno_id AND p_fecha = public.ninos_hoy()
       AND public.ninos_precheck_en_ventana(t.id)
       AND EXISTS (SELECT 1 FROM public.ninos_salones s
                    WHERE s.campus_id = t.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
  ), pendientes AS (
    SELECT p.solicitado_por, p.nino_id, p.created_at
      FROM public.ninos_prechecks p JOIN turno ON turno.id = p.turno_id
     WHERE p.fecha = p_fecha AND p.estado = 'pendiente'
       AND NOT EXISTS (SELECT 1 FROM public.ninos_checkins c
                        WHERE c.nino_id = p.nino_id AND c.turno_id = p.turno_id AND c.fecha = p.fecha)
  )
  SELECT coalesce(jsonb_agg(f.familia ORDER BY f.avisado_at), '[]'::jsonb)
    FROM (
      SELECT min(pe.created_at) AS avisado_at,
             jsonb_build_object(
               'padre', jsonb_build_object('id', u.id, 'nombre', u.nombre, 'apellido', u.apellido),
               'avisado_at', min(pe.created_at),
               'hijos', (SELECT coalesce(jsonb_agg(e.h), '[]'::jsonb)
                           FROM jsonb_array_elements(public.ninos_familia_hijos(u.id)) e(h)
                          WHERE (e.h ->> 'id')::uuid = ANY (array_agg(pe.nino_id)))) AS familia
        FROM pendientes pe
        JOIN public.usuarios u ON u.id = pe.solicitado_por
       GROUP BY u.id, u.nombre, u.apellido
    ) f;
$$;
REVOKE ALL ON FUNCTION public.ninos_prechecks_pendientes(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_prechecks_pendientes(uuid, date) TO authenticated;

-- ── 7. the check-in marks the notice ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_checkins_marcar_precheck()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.ninos_prechecks p
     SET estado = 'ingresado', updated_at = now()
   WHERE p.nino_id = NEW.nino_id AND p.turno_id = NEW.turno_id AND p.fecha = NEW.fecha
     AND p.estado = 'pendiente';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkins_marcar_precheck() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER ninos_checkins_precheck
  AFTER INSERT ON public.ninos_checkins
  FOR EACH ROW EXECUTE FUNCTION public.ninos_checkins_marcar_precheck();
