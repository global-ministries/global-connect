-- Niños volunteer attendance (odd/tasks/ninos-asistencia-voluntarios.md, V1).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_planilla(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_turnos();
--   DROP FUNCTION IF EXISTS public.ninos_puede_marcar_voluntarios_algun_area();
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_del_turno(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_marcables(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_equipos(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_puede_marcar_voluntarios(uuid);
--   DROP TABLE IF EXISTS public.dream_team_asistencias;
--
-- What:
--   1. dream_team_asistencias: one mark per servicio, turno and fecha:
--      presente, justificado ("Avisó") or ausente ("Faltó"). `esperado` keeps
--      whether the volunteer was due that day (false = substitute, extra or no
--      turno), computed by the server when the mark is written. A volunteer
--      nobody marked has no row ("sin marcar"); nothing turns into ausente on
--      its own. RLS is on with no policies and anon/authenticated hold no
--      privilege: every read and write goes through the functions below.
--   2. Internal helpers (no EXECUTE for PUBLIC, anon or authenticated):
--        ninos_puede_marcar_voluntarios(equipo)
--            ninos_puede_configurar(equipo): admin/pastor, or org.manage,
--            direct or coordinate granted on the equipo or an ancestor
--            (Directora de Niños, area coordinators, and a sub-area
--            coordinator for their own team), OR
--            dream_team_puede_registrar_persona(equipo): the Atención al
--            Voluntario coordinator, for every equipo under the area.
--        ninos_voluntarios_equipos(campus)
--            the active equipos in the subtree of each Niños area (the
--            equipos of the active rooms), per campus; NULL = every campus.
--        ninos_voluntarios_marcables(campus)
--            those equipos the caller may mark: the same rule, evaluated for
--            many equipos at once (the registrables set is computed once).
--        ninos_voluntarios_del_turno(turno, fecha)
--            the roster: the active servicios in those equipos for the
--            turno's campus (the person's principal campus is that campus or
--            unknown), with `esperado` (assigned to the turno, due that date
--            per dream_team_turno_sirve_en, started on or before it in
--            Caracas) and `sin_turno` (no turno assignment at all).
--   3. For authenticated:
--        ninos_puede_marcar_voluntarios_algun_area()  menu and page flag.
--        ninos_voluntarios_turnos()  the active turnos those areas serve in
--            the campuses where the caller may mark someone. The page needs
--            it: a sub-area coordinator cannot read ninos_salones.
--        ninos_voluntarios_planilla(turno, fecha)  the roster of the
--            servicios the caller may mark, with the current marks.
--        ninos_voluntarios_marcar(turno, fecha, servicio_ids, estado,
--            solo_sin_marcar)  upsert of the marks (estado NULL deletes
--            them); solo_sin_marcar leaves existing marks untouched, for
--            "Marcar el resto como Faltó".
--
-- Errors: 'sin_autoridad' (42501) when the caller may mark nobody in that
-- campus or a servicio outside their scope; 22023 for 'turno_invalido'
-- (unknown or inactive), 'fecha_invalida' (NULL, not the turno's weekday;
-- marking also refuses future dates and dates more than 14 days before
-- ninos_hoy()), 'estado_invalido', 'servicio_invalido' (not in the roster:
-- inactive, another campus or outside the Niños areas) and
-- 'demasiados_servicios' (more than 300 ids).
--
-- Every function runs with definer rights and search_path ''.

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dream_team_asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.dream_team_servicios(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id),
  fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('presente', 'justificado', 'ausente')),
  esperado boolean NOT NULL,
  marcado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  marcado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dream_team_asistencias_unica UNIQUE (servicio_id, turno_id, fecha)
);
CREATE INDEX IF NOT EXISTS dream_team_asistencias_turno_fecha_idx
  ON public.dream_team_asistencias (turno_id, fecha);

COMMENT ON TABLE public.dream_team_asistencias IS
  'Attendance marks of Dream Team volunteers per servicio, turno and fecha. Read and written only through the ninos_voluntarios_* functions.';

ALTER TABLE public.dream_team_asistencias ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dream_team_asistencias FROM PUBLIC, anon, authenticated;

-- ── 2. internal helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_puede_marcar_voluntarios(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_equipo_id IS NOT NULL
     AND public.ninos_usuario_actual() IS NOT NULL
     AND (public.ninos_puede_configurar(p_equipo_id)
          OR public.dream_team_puede_registrar_persona(p_equipo_id));
$$;
REVOKE ALL ON FUNCTION public.ninos_puede_marcar_voluntarios(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_equipos(p_campus_id uuid)
RETURNS TABLE (campus_id uuid, area_id uuid, equipo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE areas AS (
    SELECT DISTINCT s.campus_id, s.equipo_id AS area_id
      FROM public.ninos_salones s
     WHERE s.activo AND (p_campus_id IS NULL OR s.campus_id = p_campus_id)
  ), arbol AS (
    SELECT a.campus_id, a.area_id, e.id AS equipo_id, 0 AS profundidad
      FROM areas a
      JOIN public.dream_team_equipos e ON e.id = a.area_id AND e.activo
    UNION ALL
    SELECT ar.campus_id, ar.area_id, h.id, ar.profundidad + 1
      FROM public.dream_team_equipos h
      JOIN arbol ar ON h.parent_equipo_id = ar.equipo_id
     WHERE h.activo AND ar.profundidad < 16
  )
  -- An equipo under two areas (nested areas) belongs to the nearest one.
  SELECT DISTINCT ON (ar.campus_id, ar.equipo_id) ar.campus_id, ar.area_id, ar.equipo_id
    FROM arbol ar
   ORDER BY ar.campus_id, ar.equipo_id, ar.profundidad;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_equipos(uuid) FROM PUBLIC, anon, authenticated;

-- Same rule as ninos_puede_marcar_voluntarios, for every equipo of
-- ninos_voluntarios_equipos(campus) in one pass.
CREATE OR REPLACE FUNCTION public.ninos_voluntarios_marcables(p_campus_id uuid)
RETURNS TABLE (campus_id uuid, area_id uuid, equipo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT q.campus_id, q.area_id, q.equipo_id
    FROM public.ninos_voluntarios_equipos(p_campus_id) q
   WHERE (SELECT public.ninos_usuario_actual()) IS NOT NULL
     AND (q.equipo_id IN (SELECT r.equipo_id FROM public.dream_team_equipos_registrables() r)
          OR public.ninos_puede_configurar(q.equipo_id));
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_marcables(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_del_turno(p_turno_id uuid, p_fecha date)
RETURNS TABLE (servicio_id uuid, area_id uuid, equipo_id uuid, esperado boolean, sin_turno boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT sv.id, q.area_id, q.equipo_id,
         EXISTS (SELECT 1 FROM public.dream_team_servicio_turnos st
                  WHERE st.servicio_id = sv.id AND st.turno_id = t.id
                    AND public.dream_team_turno_sirve_en(st.frecuencia, st.fecha_ancla, p_fecha))
           AND (sv.fecha_inicio AT TIME ZONE 'America/Caracas')::date <= p_fecha,
         NOT EXISTS (SELECT 1 FROM public.dream_team_servicio_turnos st WHERE st.servicio_id = sv.id)
    FROM public.dream_team_turnos t
    CROSS JOIN LATERAL public.ninos_voluntarios_equipos(t.campus_id) q
    JOIN public.dream_team_servicios sv ON sv.equipo_id = q.equipo_id AND sv.estado = 'activo'
   WHERE t.id = p_turno_id
     AND NOT EXISTS (SELECT 1 FROM public.usuario_campus uc
                      WHERE uc.usuario_id = sv.persona_id AND uc.es_campus_principal
                        AND uc.campus_id <> t.campus_id);
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_del_turno(uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 3. menu flag and service picker ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_puede_marcar_voluntarios_algun_area()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ninos_voluntarios_marcables(NULL));
$$;
REVOKE ALL ON FUNCTION public.ninos_puede_marcar_voluntarios_algun_area() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_puede_marcar_voluntarios_algun_area() TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_turnos()
RETURNS TABLE (id uuid, nombre text, hora time, orden integer, dia_semana smallint, campus_id uuid, campus text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH servidos AS (
    SELECT DISTINCT x.turno_id
      FROM public.ninos_voluntarios_marcables(NULL) m
      CROSS JOIN LATERAL public.dream_team_turnos_del_equipo(m.equipo_id, m.campus_id) AS x(turno_id)
  )
  SELECT t.id, t.nombre, t.hora, t.orden, t.dia_semana, t.campus_id, c.nombre
    FROM servidos s
    JOIN public.dream_team_turnos t ON t.id = s.turno_id
    JOIN public.campus c ON c.id = t.campus_id
   ORDER BY c.nombre, t.orden, t.hora;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_turnos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_turnos() TO authenticated;

-- ── 4. roster ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_planilla(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_turno public.dream_team_turnos%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_equipos uuid[];
  v_areas uuid[];
  v_areas_json jsonb;
  v_voluntarios jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR extract(dow FROM p_fecha)::int <> v_turno.dia_semana THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(m.equipo_id), ARRAY[]::uuid[]), coalesce(array_agg(DISTINCT m.area_id), ARRAY[]::uuid[])
    INTO v_equipos, v_areas
    FROM public.ninos_voluntarios_marcables(v_turno.campus_id) m;
  IF cardinality(v_equipos) = 0 THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.label) ORDER BY a.label), '[]'::jsonb)
    INTO v_areas_json
    FROM public.dream_team_equipos a
   WHERE a.id = ANY (v_areas);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'servicio_id', r.servicio_id, 'nombre', u.nombre, 'apellido', u.apellido,
           'area_id', r.area_id, 'area', ea.label, 'equipo_id', r.equipo_id, 'equipo', e.label,
           'rol', ro.label, 'esperado', r.esperado, 'sin_turno', r.sin_turno, 'estado', a.estado)
         ORDER BY ea.label, e.label, u.nombre, u.apellido), '[]'::jsonb)
    INTO v_voluntarios
    FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
    JOIN public.dream_team_servicios sv ON sv.id = r.servicio_id
    JOIN public.usuarios u ON u.id = sv.persona_id
    JOIN public.dream_team_equipos e ON e.id = r.equipo_id
    JOIN public.dream_team_equipos ea ON ea.id = r.area_id
    JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
    LEFT JOIN public.dream_team_asistencias a
      ON a.servicio_id = r.servicio_id AND a.turno_id = p_turno_id AND a.fecha = p_fecha
   WHERE r.equipo_id = ANY (v_equipos);

  RETURN jsonb_build_object(
    'turno_id', v_turno.id, 'turno', v_turno.nombre, 'dia_semana', v_turno.dia_semana,
    'fecha', p_fecha, 'hoy', v_hoy, 'editable', p_fecha BETWEEN v_hoy - 14 AND v_hoy,
    'areas', v_areas_json, 'voluntarios', v_voluntarios);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_planilla(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_planilla(uuid, date) TO authenticated;

-- ── 5. marking ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_marcar(
  p_turno_id uuid,
  p_fecha date,
  p_servicio_ids uuid[],
  p_estado text,
  p_solo_sin_marcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_turno public.dream_team_turnos%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_ids uuid[];
  v_servicios uuid[];
  v_equipos uuid[];
  v_esperados boolean[];
  v_cambiados integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('presente', 'justificado', 'ausente') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_servicio_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) > 300 THEN
    RAISE EXCEPTION 'demasiados_servicios' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 14
     OR extract(dow FROM p_fecha)::int <> v_turno.dia_semana THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('estado', p_estado, 'servicios', 0, 'cambiados', 0);
  END IF;

  -- The roster rows of the ids, read once: every id must be in the roster of
  -- this turno, in an equipo the caller may mark.
  SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
         coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
    INTO v_servicios, v_equipos, v_esperados
    FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
   WHERE r.servicio_id = ANY (v_ids);
  IF cardinality(v_servicios) < cardinality(v_ids) THEN
    RAISE EXCEPTION 'servicio_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT DISTINCT e FROM unnest(v_equipos) AS e) d
              WHERE NOT public.ninos_puede_marcar_voluntarios(d.e)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  IF p_estado IS NULL THEN
    DELETE FROM public.dream_team_asistencias a
     WHERE a.turno_id = p_turno_id AND a.fecha = p_fecha AND a.servicio_id = ANY (v_servicios);
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSIF p_solo_sin_marcar THEN
    INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_por) -- noqa: insert-into
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO NOTHING;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSE
    -- Re-marking the same estado is a no-op: the first marker and time stay.
    INSERT INTO public.dream_team_asistencias AS a (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO UPDATE
       SET estado = excluded.estado, esperado = excluded.esperado,
           marcado_por = excluded.marcado_por, marcado_at = now()
     WHERE a.estado IS DISTINCT FROM excluded.estado OR a.esperado IS DISTINCT FROM excluded.esperado;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('estado', p_estado, 'servicios', cardinality(v_ids), 'cambiados', v_cambiados);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) TO authenticated;
