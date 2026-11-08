-- DPS planning, phase 1a-2: convocados and attendance (odd/tasks/dps-asistencia-pco.md,
-- T8b; S6.1, S6.2, S7.4, S2, S5). Builds on 20261108100000_dps_planificacion_base.sql
-- and 20261108101000_dps_planificacion_rpcs.sql.
--
-- What:
--   1. Tables (RLS on, no policies, no privilege for anon or authenticated;
--      every read and write goes through the definer functions):
--        dps_convocados   who is called to a puesto of a plan, through one of
--                         their servicios. persona_id is copied from the
--                         servicio (written only by the functions below) so a
--                         person is unique per plan and puesto, but may hold
--                         two puestos of the same plan (S7.4). The servicio
--                         must be activo and its equipo in the subtree of the
--                         puesto's equipo (a puesto of Producción Técnica
--                         takes anyone of Cámaras or Sonido; a puesto of
--                         Cámaras, only Cámaras and below).
--        dps_asistencias  ONE mark per person per plan, whatever their puestos
--                         and for every horario of the day (S6.1): 'llego' or
--                         'aviso_no_viene'. "No vino" is derived (convocado
--                         without a row), never stored, so nothing turns into
--                         a fault on its own. `convocado` keeps whether the
--                         person was convocado in the plan; 'llego' with
--                         convocado false is "vino sin estar convocado" and
--                         needs an active servicio in a DPS equipo. Convocar,
--                         desconvocar and copiar keep `convocado` in step; an
--                         'aviso_no_viene' of someone no longer convocado is
--                         dropped. This is the attendance the refreshment
--                         module will validate against (S2); the volunteer's
--                         own confirmation, when it exists, is another datum
--                         and never overwrites this one (S5).
--   2. Internal helpers (no EXECUTE for PUBLIC, anon or authenticated):
--        dps_subarbol(equipo)             the equipo and its DPS descendants.
--        dps_en_subarbol(ancestro, equipo)
--        dps_equipos_asistibles()         the DPS equipos where the caller
--                                         passes attendance (evaluated once).
--        dps_asistencia_resincronizar(plan, personas)  convocado back in step.
--        dps_asistencia_escribir(plan, actor, personas, convocados, estado, solo)
--        dps_iniciales(nombre, apellido)
--   3. For authenticated:
--        dps_convocar(plan, puesto, servicio) -> uuid        planners; idempotent.
--        dps_desconvocar(plan, puesto, persona) -> boolean   planners.
--        dps_copiar_plan(origen, destino, reemplazar = false) -> {copiados, omitidos}
--            planners. Copies the convocados of origen into destino, skipping
--            (omitidos) inactive puestos, servicios no longer activo and
--            servicios no longer under the puesto's equipo. A destino that
--            already has convocados is 'destino_con_convocados' unless
--            reemplazar, which first removes them. Serialized per destino with
--            an advisory lock (also taken by dps_convocar).
--        dps_plan_anterior(plan) -> uuid   the previous plan of the same tipo
--            (by fecha), NULL when none; dps_puede_ver.
--        dps_candidatos_puesto(puesto, plan, busqueda) -> rows   planners. The
--            active servicios in the puesto's subtree (at most 200, name
--            filter), with ya_convocado_en_plan, en_este_puesto and the
--            puestos the person already holds on that fecha (this plan or
--            another plan of the same day).
--        dps_plan_equipos(plan) -> jsonb   the Equipos tab; dps_puede_ver. The
--            DPS equipos with puestos (active ones, plus inactive ones that
--            still have convocados in the plan) -> puestos with cantidad,
--            convocados (name and initials) and falta = cantidad - convocados
--            (never below 0), per-equipo counts and totals, puede_editar.
--        dps_asistencia_planilla(plan, equipo = NULL) -> jsonb
--            the attendance sheet, only for the equipos where the caller
--            dps_puede_pasar_asistencia (planners: all of DPS); equipo narrows
--            it to that equipo's subtree. Per equipo: the people convocados in
--            its puestos (one row per person with all their puestos there and
--            the ones held elsewhere), the people marked "vino sin convocar"
--            with an active servicio there, `otros` (active servicios there
--            neither convocados nor marked, for "agregar a alguien que vino")
--            and the counts llegaron / por_llegar / aviso; totals count each
--            person once. `editable` follows ninos_voluntarios_planilla: the
--            plan's fecha is between ninos_hoy() - 14 and ninos_hoy().
--        dps_asistencia_marcar(plan, persona_ids, estado, solo_sin_marcar = false) -> jsonb
--            {estado, personas, cambiados}. estado 'llego', 'aviso_no_viene'
--            or NULL (clears). At most 300 ids. Each person is convocado in a
--            puesto of an equipo the caller passes, or has an active servicio
--            in one ("vino sin convocar", 'llego' only). solo_sin_marcar leaves
--            existing marks untouched; re-marking the same estado keeps the
--            first marker and time.
--        dps_asistencia_marcar_equipo(plan, equipo, estado) -> integer
--            "Marcar todo el equipo": every person convocado in that equipo's
--            own puestos, only those without a mark (an 'aviso_no_viene' is
--            not overwritten); NULL clears them. Returns the rows changed.
--        dps_historial_persona(persona, desde, hasta) -> jsonb
--            per plan of the range (at most 400 days) where the person was
--            convocado or marked: puestos and estado 'llego', 'aviso_no_viene',
--            'no_vino' (convocado, unmarked, fecha before ninos_hoy()),
--            'pendiente' (the same, fecha today or later) or
--            'vino_sin_convocar'; plus a resumen. Planners, and the person
--            themself.
--
-- Errors: 'sin_autoridad' (42501) without a session or authority; 22023 for
-- plan_invalido, puesto_invalido, servicio_invalido, equipo_invalido,
-- persona_invalida, estado_invalido, fecha_invalida (outside the 14-day
-- window), demasiados (more than 300 ids), destino_con_convocados,
-- busqueda_invalida, rango_invalido.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_historial_persona(uuid, date, date),
--     public.dps_asistencia_marcar_equipo(uuid, uuid, text),
--     public.dps_asistencia_marcar(uuid, uuid[], text, boolean),
--     public.dps_asistencia_planilla(uuid, uuid), public.dps_plan_equipos(uuid),
--     public.dps_candidatos_puesto(uuid, uuid, text), public.dps_plan_anterior(uuid),
--     public.dps_copiar_plan(uuid, uuid, boolean), public.dps_desconvocar(uuid, uuid, uuid),
--     public.dps_convocar(uuid, uuid, uuid), public.dps_iniciales(text, text),
--     public.dps_asistencia_escribir(uuid, uuid, uuid[], boolean[], text, boolean),
--     public.dps_asistencia_resincronizar(uuid, uuid[]), public.dps_equipos_asistibles(),
--     public.dps_en_subarbol(uuid, uuid), public.dps_subarbol(uuid);
--   DROP TABLE IF EXISTS public.dps_asistencias, public.dps_convocados;

-- ── 1. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dps_convocados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.dps_planes(id) ON DELETE CASCADE,
  puesto_id uuid NOT NULL REFERENCES public.dps_puestos(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.dream_team_servicios(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dps_convocados_unico UNIQUE (plan_id, puesto_id, persona_id)
);
CREATE INDEX IF NOT EXISTS dps_convocados_plan_persona_idx ON public.dps_convocados (plan_id, persona_id);
CREATE INDEX IF NOT EXISTS dps_convocados_persona_idx ON public.dps_convocados (persona_id);
CREATE INDEX IF NOT EXISTS dps_convocados_puesto_idx ON public.dps_convocados (puesto_id);
CREATE INDEX IF NOT EXISTS dps_convocados_servicio_idx ON public.dps_convocados (servicio_id);

CREATE TABLE IF NOT EXISTS public.dps_asistencias (
  plan_id uuid NOT NULL REFERENCES public.dps_planes(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (estado IN ('llego', 'aviso_no_viene')),
  convocado boolean NOT NULL,
  marcado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  marcado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, persona_id),
  -- Only someone convocado can warn they will not come.
  CONSTRAINT dps_asistencias_aviso_convocado CHECK (estado = 'llego' OR convocado)
);
CREATE INDEX IF NOT EXISTS dps_asistencias_persona_idx ON public.dps_asistencias (persona_id);

COMMENT ON TABLE public.dps_convocados IS 'DPS convocados per plan and puesto (a person may hold two puestos). Only through the dps_* functions.';
COMMENT ON TABLE public.dps_asistencias IS 'DPS attendance: one mark per person per plan (llego / aviso_no_viene); no row = not marked. Only through the dps_* functions.';

ALTER TABLE public.dps_convocados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_asistencias ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dps_convocados, public.dps_asistencias FROM PUBLIC, anon, authenticated;

-- ── 2. internal helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_subarbol(p_equipo_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE arbol AS MATERIALIZED (
    SELECT d.equipo_id AS eq, d.parent_equipo_id AS padre FROM public.dps_equipos() d
  ), sub AS (
    SELECT a.eq, 0 AS profundidad FROM arbol a WHERE a.eq = p_equipo_id
    UNION ALL
    SELECT a.eq, s.profundidad + 1 FROM arbol a JOIN sub s ON a.padre = s.eq WHERE s.profundidad < 16
  )
  SELECT s.eq FROM sub s;
$$;
REVOKE ALL ON FUNCTION public.dps_subarbol(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_en_subarbol(p_ancestro uuid, p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_ancestro IS NOT NULL AND p_equipo_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.dps_subarbol(p_ancestro) s WHERE s = p_equipo_id);
$$;
REVOKE ALL ON FUNCTION public.dps_en_subarbol(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipos_asistibles()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT d.equipo_id
    FROM public.dps_equipos() d
   WHERE (SELECT public.ninos_usuario_actual()) IS NOT NULL
     AND ((SELECT public.dps_puede_planificar())
          OR ((public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', d.equipo_id)
               OR public.auth_has_dream_team_capability_in_tree('dream_team.direct', d.equipo_id))
              AND public.dps_asistencia_habilitada(d.equipo_id)));
$$;
REVOKE ALL ON FUNCTION public.dps_equipos_asistibles() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_iniciales(p_nombre text, p_apellido text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT upper(left(coalesce(btrim(p_nombre), ''), 1) || left(coalesce(btrim(p_apellido), ''), 1));
$$;
REVOKE ALL ON FUNCTION public.dps_iniciales(text, text) FROM PUBLIC, anon, authenticated;

-- After the convocados of a plan change: an 'aviso_no_viene' of someone no
-- longer convocado goes away, and `convocado` follows the convocados.
-- p_personas NULL = everyone in the plan.
CREATE OR REPLACE FUNCTION public.dps_asistencia_resincronizar(p_plan_id uuid, p_personas uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.dps_asistencias a
   WHERE a.plan_id = p_plan_id AND a.estado = 'aviso_no_viene'
     AND (p_personas IS NULL OR a.persona_id = ANY (p_personas))
     AND NOT EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = a.plan_id AND c.persona_id = a.persona_id);
  UPDATE public.dps_asistencias a
     SET convocado = EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = a.plan_id AND c.persona_id = a.persona_id)
   WHERE a.plan_id = p_plan_id
     AND (p_personas IS NULL OR a.persona_id = ANY (p_personas))
     AND a.convocado IS DISTINCT FROM EXISTS (SELECT 1 FROM public.dps_convocados c
                                               WHERE c.plan_id = a.plan_id AND c.persona_id = a.persona_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_resincronizar(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- Writes already validated marks; returns the rows changed.
CREATE OR REPLACE FUNCTION public.dps_asistencia_escribir(
  p_plan_id uuid,
  p_actor uuid,
  p_personas uuid[],
  p_convocados boolean[],
  p_estado text,
  p_solo_sin_marcar boolean
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cambiados integer := 0;
BEGIN
  IF p_estado IS NULL THEN
    DELETE FROM public.dps_asistencias a WHERE a.plan_id = p_plan_id AND a.persona_id = ANY (p_personas);
  ELSIF p_solo_sin_marcar THEN
    INSERT INTO public.dps_asistencias (plan_id, persona_id, estado, convocado, marcado_por) -- noqa: insert-into
    SELECT p_plan_id, x.persona_id, p_estado, x.convocado, p_actor
      FROM unnest(p_personas, p_convocados) AS x(persona_id, convocado)
    ON CONFLICT (plan_id, persona_id) DO NOTHING;
  ELSE
    -- Re-marking the same estado is a no-op: the first marker and time stay.
    INSERT INTO public.dps_asistencias AS a (plan_id, persona_id, estado, convocado, marcado_por) -- noqa: insert-into
    SELECT p_plan_id, x.persona_id, p_estado, x.convocado, p_actor
      FROM unnest(p_personas, p_convocados) AS x(persona_id, convocado)
    ON CONFLICT (plan_id, persona_id) DO UPDATE
       SET estado = excluded.estado, convocado = excluded.convocado,
           marcado_por = excluded.marcado_por, marcado_at = now()
     WHERE a.estado IS DISTINCT FROM excluded.estado OR a.convocado IS DISTINCT FROM excluded.convocado;
  END IF;
  GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  RETURN v_cambiados;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_escribir(uuid, uuid, uuid[], boolean[], text, boolean) FROM PUBLIC, anon, authenticated;

-- ── 3. convocados ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_convocar(p_plan_id uuid, p_puesto_id uuid, p_servicio_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_puesto public.dps_puestos%ROWTYPE;
  v_servicio public.dream_team_servicios%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT pu.* INTO v_puesto FROM public.dps_puestos pu WHERE pu.id = p_puesto_id AND pu.activo;
  IF NOT FOUND OR NOT public.dps_equipo_valido(v_puesto.equipo_id) THEN
    RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT s.* INTO v_servicio FROM public.dream_team_servicios s WHERE s.id = p_servicio_id AND s.estado = 'activo';
  IF NOT FOUND OR NOT public.dps_en_subarbol(v_puesto.equipo_id, v_servicio.equipo_id) THEN
    RAISE EXCEPTION 'servicio_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_plan_id::text));
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, created_by) -- noqa: insert-into
  VALUES (p_plan_id, p_puesto_id, p_servicio_id, v_servicio.persona_id, v_actor)
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.dps_convocados c
     WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = v_servicio.persona_id;
  END IF;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, ARRAY[v_servicio.persona_id]);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_convocar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_convocar(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_desconvocar(p_plan_id uuid, p_puesto_id uuid, p_persona_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_quitados integer;
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.dps_convocados c
   WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = p_persona_id;
  GET DIAGNOSTICS v_quitados = ROW_COUNT;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, ARRAY[p_persona_id]);
  RETURN v_quitados > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_desconvocar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_desconvocar(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_copiar_plan(p_origen_id uuid, p_destino_id uuid, p_reemplazar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_total integer;
  v_copiados integer;
BEGIN
  IF p_origen_id IS NULL OR p_destino_id IS NULL OR p_origen_id = p_destino_id
     OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_origen_id)
     OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_destino_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_destino_id::text));
  IF EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p_destino_id) THEN
    IF NOT coalesce(p_reemplazar, false) THEN
      RAISE EXCEPTION 'destino_con_convocados' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.dps_convocados c WHERE c.plan_id = p_destino_id;
  END IF;

  SELECT count(*) INTO v_total FROM public.dps_convocados c WHERE c.plan_id = p_origen_id;
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, created_by) -- noqa: insert-into
  SELECT p_destino_id, c.puesto_id, c.servicio_id, s.persona_id, v_actor
    FROM public.dps_convocados c
    JOIN public.dps_puestos pu ON pu.id = c.puesto_id AND pu.activo
    JOIN public.dream_team_servicios s ON s.id = c.servicio_id AND s.estado = 'activo'
   WHERE c.plan_id = p_origen_id
     AND public.dps_equipo_valido(pu.equipo_id)
     AND public.dps_en_subarbol(pu.equipo_id, s.equipo_id)
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING;
  GET DIAGNOSTICS v_copiados = ROW_COUNT;

  PERFORM public.dps_asistencia_resincronizar(p_destino_id, NULL);
  RETURN jsonb_build_object('copiados', v_copiados, 'omitidos', v_total - v_copiados);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_anterior(p_plan_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan public.dps_planes%ROWTYPE;
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN (SELECT x.id FROM public.dps_planes x
           WHERE x.tipo = v_plan.tipo AND x.fecha < v_plan.fecha
           ORDER BY x.fecha DESC, x.created_at DESC, x.id
           LIMIT 1);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_anterior(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_anterior(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_candidatos_puesto(p_puesto_id uuid, p_plan_id uuid, p_busqueda text DEFAULT NULL)
RETURNS TABLE (
  servicio_id uuid,
  persona_id uuid,
  nombre text,
  apellido text,
  iniciales text,
  equipo_id uuid,
  equipo text,
  rol text,
  ya_convocado_en_plan boolean,
  en_este_puesto boolean,
  puestos_del_dia jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_puesto public.dps_puestos%ROWTYPE;
  v_plan public.dps_planes%ROWTYPE;
  v_busqueda text := nullif(btrim(p_busqueda), '');
  v_patron text;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT pu.* INTO v_puesto FROM public.dps_puestos pu WHERE pu.id = p_puesto_id AND pu.activo;
  IF NOT FOUND OR NOT public.dps_equipo_valido(v_puesto.equipo_id) THEN
    RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_busqueda) > 100 THEN
    RAISE EXCEPTION 'busqueda_invalida' USING ERRCODE = '22023';
  END IF;
  v_patron := '%' || replace(replace(replace(coalesce(v_busqueda, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT sv.id, sv.persona_id, u.nombre, u.apellido, public.dps_iniciales(u.nombre, u.apellido),
         sv.equipo_id, e.label, ro.label,
         EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p_plan_id AND c.persona_id = sv.persona_id),
         EXISTS (SELECT 1 FROM public.dps_convocados c
                  WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = sv.persona_id),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'plan_id', c.plan_id, 'mismo_plan', c.plan_id = p_plan_id, 'tipo', pl.tipo, 'titulo', pl.titulo,
                   'puesto_id', c.puesto_id, 'puesto', pu.nombre, 'equipo', pe.label)
                   ORDER BY c.plan_id = p_plan_id DESC, pl.tipo, pe.label, pu.nombre), '[]'::jsonb)
            FROM public.dps_convocados c
            JOIN public.dps_planes pl ON pl.id = c.plan_id
            JOIN public.dps_puestos pu ON pu.id = c.puesto_id
            JOIN public.dream_team_equipos pe ON pe.id = pu.equipo_id
           WHERE c.persona_id = sv.persona_id AND pl.fecha = v_plan.fecha)
    FROM public.dream_team_servicios sv
    JOIN public.usuarios u ON u.id = sv.persona_id
    JOIN public.dream_team_equipos e ON e.id = sv.equipo_id
    JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
   WHERE sv.estado = 'activo'
     AND sv.equipo_id IN (SELECT s FROM public.dps_subarbol(v_puesto.equipo_id) s)
     AND (v_busqueda IS NULL OR concat_ws(' ', u.nombre, u.apellido) ILIKE v_patron)
   ORDER BY 9, u.nombre, u.apellido, e.label, sv.id
   LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_candidatos_puesto(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_candidatos_puesto(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_equipos(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH arbol AS MATERIALIZED (
      SELECT d.equipo_id, d.label, d.ruta, d.profundidad FROM public.dps_equipos() d
    ), conv AS MATERIALIZED (
      SELECT c.id, c.puesto_id, c.persona_id, c.servicio_id, u.nombre, u.apellido
        FROM public.dps_convocados c
        JOIN public.usuarios u ON u.id = c.persona_id
       WHERE c.plan_id = p_plan_id
    ), puestos AS (
      SELECT pu.id, pu.equipo_id, pu.nombre, pu.cantidad, pu.orden, pu.activo,
             (SELECT count(*)::int FROM conv c WHERE c.puesto_id = pu.id) AS n,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'convocado_id', c.id, 'persona_id', c.persona_id, 'servicio_id', c.servicio_id,
                       'nombre', concat_ws(' ', c.nombre, c.apellido), 'iniciales', public.dps_iniciales(c.nombre, c.apellido))
                       ORDER BY c.nombre, c.apellido, c.id), '[]'::jsonb)
                FROM conv c WHERE c.puesto_id = pu.id) AS convocados
        FROM public.dps_puestos pu
        JOIN arbol a ON a.equipo_id = pu.equipo_id
       WHERE pu.activo OR EXISTS (SELECT 1 FROM conv c WHERE c.puesto_id = pu.id)
    ), equipos AS (
      SELECT a.equipo_id, a.label, a.ruta, a.profundidad,
             jsonb_agg(jsonb_build_object(
               'puesto_id', p.id, 'nombre', p.nombre, 'cantidad', p.cantidad, 'orden', p.orden, 'activo', p.activo,
               'convocados', p.convocados, 'falta', greatest(p.cantidad - p.n, 0))
               ORDER BY p.orden, lower(p.nombre), p.id) AS puestos,
             sum(greatest(p.cantidad - p.n, 0))::int AS falta,
             (SELECT count(DISTINCT c.persona_id)::int FROM conv c
                JOIN public.dps_puestos x ON x.id = c.puesto_id WHERE x.equipo_id = a.equipo_id) AS convocados
        FROM puestos p
        JOIN arbol a ON a.equipo_id = p.equipo_id
       GROUP BY a.equipo_id, a.label, a.ruta, a.profundidad
    )
    SELECT jsonb_build_object(
             'plan_id', p_plan_id,
             'puede_editar', public.dps_puede_planificar(),
             'equipos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'equipo_id', e.equipo_id, 'equipo', e.label, 'ruta', e.ruta, 'profundidad', e.profundidad,
                           'convocados', e.convocados, 'falta', e.falta, 'puestos', e.puestos) ORDER BY e.ruta)
                                   FROM equipos e), '[]'::jsonb),
             'convocados', (SELECT count(DISTINCT c.persona_id)::int FROM conv c
                              JOIN public.dps_puestos x ON x.id = c.puesto_id
                              JOIN arbol a ON a.equipo_id = x.equipo_id),
             'falta', coalesce((SELECT sum(e.falta)::int FROM equipos e), 0))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_equipos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_equipos(uuid) TO authenticated;

-- ── 4. attendance ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_asistencia_planilla(p_plan_id uuid, p_equipo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan public.dps_planes%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_equipos uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_equipo_id IS NOT NULL AND NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_equipos
    FROM public.dps_equipos_asistibles() x
   WHERE p_equipo_id IS NULL OR x IN (SELECT s FROM public.dps_subarbol(p_equipo_id) s);
  IF cardinality(v_equipos) = 0 THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH arbol AS MATERIALIZED (
      SELECT d.equipo_id, d.label, d.ruta FROM public.dps_equipos() d WHERE d.equipo_id = ANY (v_equipos)
    ), conv AS MATERIALIZED (
      SELECT c.persona_id, pu.equipo_id, pu.id AS puesto_id, pu.nombre AS puesto, pu.orden
        FROM public.dps_convocados c
        JOIN public.dps_puestos pu ON pu.id = c.puesto_id
       WHERE c.plan_id = p_plan_id
    ), marcas AS MATERIALIZED (
      SELECT a.persona_id, a.estado, a.convocado FROM public.dps_asistencias a WHERE a.plan_id = p_plan_id
    ), activos AS MATERIALIZED (
      SELECT DISTINCT s.equipo_id, s.persona_id
        FROM public.dream_team_servicios s
        JOIN arbol a ON a.equipo_id = s.equipo_id
       WHERE s.estado = 'activo'
    ), miembros AS (
      SELECT DISTINCT c.equipo_id, c.persona_id, true AS convocado
        FROM conv c JOIN arbol a ON a.equipo_id = c.equipo_id
      UNION
      -- "Vino sin convocar": under each equipo of their active servicios.
      SELECT ac.equipo_id, ac.persona_id, false
        FROM activos ac
        JOIN marcas m ON m.persona_id = ac.persona_id AND NOT m.convocado
    ), filas AS (
      SELECT mi.equipo_id, mi.persona_id, mi.convocado, m.estado, u.nombre, u.apellido,
             (SELECT coalesce(jsonb_agg(jsonb_build_object('puesto_id', c.puesto_id, 'nombre', c.puesto)
                                        ORDER BY c.orden, c.puesto), '[]'::jsonb)
                FROM conv c WHERE c.persona_id = mi.persona_id AND c.equipo_id = mi.equipo_id) AS puestos,
             (SELECT coalesce(jsonb_agg(c.puesto ORDER BY c.puesto), '[]'::jsonb)
                FROM conv c WHERE c.persona_id = mi.persona_id AND c.equipo_id <> mi.equipo_id) AS otros_puestos
        FROM miembros mi
        JOIN public.usuarios u ON u.id = mi.persona_id
        LEFT JOIN marcas m ON m.persona_id = mi.persona_id
    ), otros AS (
      SELECT ac.equipo_id, ac.persona_id, u.nombre, u.apellido
        FROM activos ac
        JOIN public.usuarios u ON u.id = ac.persona_id
       WHERE NOT EXISTS (SELECT 1 FROM conv c WHERE c.persona_id = ac.persona_id)
         AND NOT EXISTS (SELECT 1 FROM marcas m WHERE m.persona_id = ac.persona_id)
    ), equipos AS (
      SELECT a.equipo_id, a.label, a.ruta,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'persona_id', f.persona_id, 'nombre', f.nombre, 'apellido', f.apellido,
                       'iniciales', public.dps_iniciales(f.nombre, f.apellido), 'convocado', f.convocado,
                       'estado', f.estado, 'puestos', f.puestos, 'otros_puestos', f.otros_puestos)
                       ORDER BY f.nombre, f.apellido, f.persona_id), '[]'::jsonb)
                FROM filas f WHERE f.equipo_id = a.equipo_id) AS personas,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'persona_id', o.persona_id, 'nombre', o.nombre, 'apellido', o.apellido,
                       'iniciales', public.dps_iniciales(o.nombre, o.apellido))
                       ORDER BY o.nombre, o.apellido, o.persona_id), '[]'::jsonb)
                FROM otros o WHERE o.equipo_id = a.equipo_id) AS otros,
             (SELECT count(*) FILTER (WHERE f.estado = 'llego')::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS llegaron,
             (SELECT count(*) FILTER (WHERE f.convocado AND f.estado IS NULL)::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS por_llegar,
             (SELECT count(*) FILTER (WHERE f.estado = 'aviso_no_viene')::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS aviso
        FROM arbol a
       WHERE EXISTS (SELECT 1 FROM filas f WHERE f.equipo_id = a.equipo_id)
          OR EXISTS (SELECT 1 FROM otros o WHERE o.equipo_id = a.equipo_id)
    ), personas AS (
      SELECT f.persona_id, bool_or(f.convocado) AS convocado, max(f.estado) AS estado FROM filas f GROUP BY f.persona_id
    )
    SELECT jsonb_build_object(
             'plan_id', v_plan.id, 'fecha', v_plan.fecha, 'tipo', v_plan.tipo, 'titulo', v_plan.titulo,
             'hoy', v_hoy, 'editable', v_plan.fecha BETWEEN v_hoy - 14 AND v_hoy,
             'equipos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'equipo_id', e.equipo_id, 'equipo', e.label, 'ruta', e.ruta,
                           'llegaron', e.llegaron, 'por_llegar', e.por_llegar, 'aviso', e.aviso,
                           'personas', e.personas, 'otros', e.otros) ORDER BY e.ruta)
                                   FROM equipos e), '[]'::jsonb),
             'totales', (SELECT jsonb_build_object(
                           'convocados', count(*) FILTER (WHERE p.convocado),
                           'llegaron', count(*) FILTER (WHERE p.estado = 'llego'),
                           'por_llegar', count(*) FILTER (WHERE p.convocado AND p.estado IS NULL),
                           'aviso', count(*) FILTER (WHERE p.estado = 'aviso_no_viene'),
                           'sin_convocar', count(*) FILTER (WHERE NOT p.convocado))
                           FROM personas p))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_planilla(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_asistencia_planilla(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_asistencia_marcar(
  p_plan_id uuid,
  p_persona_ids uuid[],
  p_estado text,
  p_solo_sin_marcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_plan public.dps_planes%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_ids uuid[];
  v_asistibles uuid[];
  v_personas uuid[];
  v_convocados boolean[];
  v_invalida boolean;
  v_sin_autoridad boolean;
  v_cambiados integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('llego', 'aviso_no_viene') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_persona_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) > 300 THEN
    RAISE EXCEPTION 'demasiados' USING ERRCODE = '22023';
  END IF;
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_plan.fecha > v_hoy OR v_plan.fecha < v_hoy - 14 THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('estado', p_estado, 'personas', 0, 'cambiados', 0);
  END IF;

  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_asistibles FROM public.dps_equipos_asistibles() x;

  -- Per id: convocado at all / in an equipo the caller passes; an active
  -- servicio in DPS at all / in an equipo the caller passes.
  WITH dps AS MATERIALIZED (
    SELECT d.equipo_id FROM public.dps_equipos() d
  ), t AS (
    SELECT i.persona_id,
           EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p_plan_id AND c.persona_id = i.persona_id) AS conv_alguno,
           EXISTS (SELECT 1 FROM public.dps_convocados c JOIN public.dps_puestos pu ON pu.id = c.puesto_id
                    WHERE c.plan_id = p_plan_id AND c.persona_id = i.persona_id
                      AND pu.equipo_id = ANY (v_asistibles)) AS conv_mio,
           EXISTS (SELECT 1 FROM public.dream_team_servicios s JOIN dps d ON d.equipo_id = s.equipo_id
                    WHERE s.persona_id = i.persona_id AND s.estado = 'activo') AS serv_alguno,
           EXISTS (SELECT 1 FROM public.dream_team_servicios s
                    WHERE s.persona_id = i.persona_id AND s.estado = 'activo'
                      AND s.equipo_id = ANY (v_asistibles)) AS serv_mio
      FROM unnest(v_ids) AS i(persona_id)
  )
  SELECT bool_or(NOT (t.conv_alguno OR t.serv_alguno) OR (p_estado = 'aviso_no_viene' AND NOT t.conv_alguno)),
         bool_or(NOT (t.conv_mio OR t.serv_mio) OR (p_estado = 'aviso_no_viene' AND NOT t.conv_mio)),
         array_agg(t.persona_id), array_agg(t.conv_alguno)
    INTO v_invalida, v_sin_autoridad, v_personas, v_convocados
    FROM t;
  IF v_invalida THEN
    RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
  END IF;
  IF v_sin_autoridad THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  v_cambiados := public.dps_asistencia_escribir(p_plan_id, v_actor, v_personas, v_convocados, p_estado,
                                                coalesce(p_solo_sin_marcar, false));
  RETURN jsonb_build_object('estado', p_estado, 'personas', cardinality(v_ids), 'cambiados', v_cambiados);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_marcar(uuid, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_asistencia_marcar(uuid, uuid[], text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_asistencia_marcar_equipo(p_plan_id uuid, p_equipo_id uuid, p_estado text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_plan public.dps_planes%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_personas uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('llego', 'aviso_no_viene') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_plan.fecha > v_hoy OR v_plan.fecha < v_hoy - 14 THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT public.dps_puede_pasar_asistencia(p_equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT c.persona_id), ARRAY[]::uuid[]) INTO v_personas
    FROM public.dps_convocados c
    JOIN public.dps_puestos pu ON pu.id = c.puesto_id
   WHERE c.plan_id = p_plan_id AND pu.equipo_id = p_equipo_id;
  IF cardinality(v_personas) = 0 THEN
    RETURN 0;
  END IF;
  RETURN public.dps_asistencia_escribir(p_plan_id, v_actor, v_personas,
                                        array_fill(true, ARRAY[cardinality(v_personas)]), p_estado, true);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_marcar_equipo(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_asistencia_marcar_equipo(uuid, uuid, text) TO authenticated;

-- ── 5. history ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_historial_persona(p_persona_id uuid, p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_hoy date := public.ninos_hoy();
BEGIN
  IF v_actor IS NULL OR NOT (p_persona_id = v_actor OR public.dps_puede_planificar()) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_persona_id) THEN
    RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 400 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH planes AS (
      SELECT p.id, p.fecha, p.tipo, p.titulo, p.semana, s.nombre AS serie, a.estado AS marca,
             (SELECT coalesce(jsonb_agg(jsonb_build_object('puesto_id', pu.id, 'puesto', pu.nombre, 'equipo', e.label)
                                        ORDER BY e.label, pu.nombre), '[]'::jsonb)
                FROM public.dps_convocados c
                JOIN public.dps_puestos pu ON pu.id = c.puesto_id
                JOIN public.dream_team_equipos e ON e.id = pu.equipo_id
               WHERE c.plan_id = p.id AND c.persona_id = p_persona_id) AS puestos,
             EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p.id AND c.persona_id = p_persona_id) AS convocado
        FROM public.dps_planes p
        LEFT JOIN public.dps_series s ON s.id = p.serie_id
        LEFT JOIN public.dps_asistencias a ON a.plan_id = p.id AND a.persona_id = p_persona_id
       WHERE p.fecha BETWEEN p_desde AND p_hasta
         AND (a.plan_id IS NOT NULL
              OR EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p.id AND c.persona_id = p_persona_id))
    ), estados AS (
      SELECT pl.*,
             CASE WHEN pl.marca = 'llego' AND NOT pl.convocado THEN 'vino_sin_convocar'
                  WHEN pl.marca IS NOT NULL THEN pl.marca
                  WHEN pl.fecha >= v_hoy THEN 'pendiente'
                  ELSE 'no_vino' END AS estado
        FROM planes pl
    )
    SELECT jsonb_build_object(
             'persona_id', p_persona_id,
             'nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios u WHERE u.id = p_persona_id),
             'desde', p_desde, 'hasta', p_hasta, 'hoy', v_hoy,
             'resumen', (SELECT jsonb_build_object(
                           'llego', count(*) FILTER (WHERE e.estado = 'llego'),
                           'aviso_no_viene', count(*) FILTER (WHERE e.estado = 'aviso_no_viene'),
                           'no_vino', count(*) FILTER (WHERE e.estado = 'no_vino'),
                           'vino_sin_convocar', count(*) FILTER (WHERE e.estado = 'vino_sin_convocar'),
                           'pendiente', count(*) FILTER (WHERE e.estado = 'pendiente'))
                           FROM estados e),
             'planes', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'plan_id', e.id, 'fecha', e.fecha, 'tipo', e.tipo, 'titulo', e.titulo,
                           'serie', e.serie, 'semana', e.semana, 'puestos', e.puestos, 'estado', e.estado)
                           ORDER BY e.fecha DESC, e.tipo, e.id)
                                   FROM estados e), '[]'::jsonb))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_historial_persona(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_historial_persona(uuid, date, date) TO authenticated;
