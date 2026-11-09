-- noqa: insert-into
-- DPS planning: special events of one or several days, moving a plan to
-- another date and deleting one (odd/tasks/dps-asistencia-pco.md, T11b; S9,
-- L44). Builds on 20261108200000..205000.
--
-- The user chose (L44): several days = "Un plan por día, agrupados — Cada día
-- tiene su propio equipo, asistencia y orden; en la hoja se ven juntos con el
-- nombre del evento («Conferencia · Día 1 de 3»)"; moving = "Se mueve todo,
-- salvo si ya pasó — Convocados, orden y datos van a la fecha nueva. Si la
-- fecha ya pasó o tiene asistencia marcada, no se puede mover."
--
-- What:
--   1. dps_planes.evento_id (uuid, NULL): the days of one event share it. No
--      table of events: the título, tipo and horarios live in each day's plan
--      (each day is a plan like any other), and «Día N de M» is derived, so it
--      never goes stale: M = the plans with that evento_id, N = this plan's
--      place among them by fecha (then id). Moving or deleting a day
--      renumbers the rest; with one day left the plan reads as a plain one.
--   2. dps_plan_json (internal, re-created) adds two keys, nothing else
--      changes: `evento` {id, dia, dias} or null, and `con_asistencia` (the
--      plan has a row in dps_asistencias), so the sheet can say why a plan
--      cannot be moved. dps_planes_rango, dps_plan_leer and dps_plan_campo
--      return it as before.
--   3. For authenticated, dps_exigir_planificador first:
--        dps_evento_crear(tipo, titulo, desde, hasta = NULL) -> jsonb
--            {evento_id, planes: [plan JSON by fecha]}: one plan per day from
--            desde to hasta (NULL = desde), at most 14 days, all with the
--            same evento_id, tipo and título and the horarios and llegada of
--            dps_config. tipo is especial, cena_del_senor or noche_adoracion
--            (a Sunday belongs to the year's Sundays and a free Sunday is not
--            an event); the título is required (it names the event). A day
--            that clashes with dps_planes_fecha_tipo_titulo_uidx refuses the
--            whole event with 'plan_duplicado' (DETAIL the date); nothing is
--            created.
--        dps_plan_mover(plan, fecha) -> jsonb (the plan JSON)
--            Any plan but a regular Sunday (tipo 'domingo'): its convocados,
--            campos, horarios and título go with it because they hang from
--            plan_id; the same date is a no-op. Refused when the plan is dated before
--            ninos_hoy() ('plan_pasado'), when the new date is
--            ('fecha_pasada'), when it has attendance ('plan_con_asistencia')
--            or on a clash ('plan_duplicado'). Moving one day of a multi-day
--            event moves only that day. Nothing else is keyed by the date:
--            dps_directores_sincronizar reads the plan's fecha when the plan
--            is read, so a plan moved to today or later keeps syncing its
--            automatic directors, and dps_plan_anterior, dps_candidatos_puesto
--            and the attendance window read the fecha live.
--        dps_plan_eliminar(plan, todo_el_evento = false) -> integer (plans deleted)
--            Any plan but a regular Sunday; todo_el_evento deletes every day
--            of its event. Refused when any of those plans has attendance
--            ('plan_con_asistencia'): attendance is never lost. Their
--            convocados go with them (ON DELETE CASCADE).
--      The plan rows are locked FOR UPDATE before the attendance check, so a
--      concurrent mark (whose foreign key check takes a KEY SHARE lock on the
--      plan) either commits first and is seen, or waits.
--
-- Errors: 'sin_autoridad' (42501); 22023 for tipo_invalido, titulo_invalido,
-- fecha_invalida, rango_invalido, plan_duplicado, plan_invalido,
-- plan_domingo, plan_pasado, fecha_pasada, plan_con_asistencia.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_plan_eliminar(uuid, boolean),
--     public.dps_plan_mover(uuid, date), public.dps_evento_crear(text, text, date, date);
--   re-run the dps_plan_json block of 20261108201000_dps_planificacion_rpcs.sql;
--   DROP INDEX IF EXISTS public.dps_planes_evento_idx;
--   then drop the column dps_planes.evento_id (the event days stay as
--   ordinary plans).

-- ── 1. column ────────────────────────────────────────────────────────

ALTER TABLE public.dps_planes ADD COLUMN IF NOT EXISTS evento_id uuid;
CREATE INDEX IF NOT EXISTS dps_planes_evento_idx ON public.dps_planes (evento_id, fecha) WHERE evento_id IS NOT NULL;
COMMENT ON COLUMN public.dps_planes.evento_id IS
  'The days of one special event share it (dps_evento_crear); «Día N de M» is derived by fecha. NULL for any other plan.';

-- ── 2. plan JSON ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_plan_json(p_plan_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'id', p.id, 'fecha', p.fecha, 'tipo', p.tipo, 'titulo', p.titulo, 'semana', p.semana,
           'serie', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
                      'id', s.id, 'nombre', s.nombre, 'color', s.color, 'imagen_path', s.imagen_path,
                      'semanas', s.semanas, 'primer_domingo', s.primer_domingo,
                      'sinopsis', s.sinopsis, 'enlace_recurso', s.enlace_recurso) END,
           'horarios', p.horarios, 'llegada', to_char(p.llegada, 'HH24:MI'),
           'productor', public.dps_persona_json(p.productor_persona_id, p.productor_texto),
           'host', public.dps_persona_json(p.host_persona_id, p.host_texto),
           'comunicador', public.dps_persona_json(p.comunicador_persona_id, p.comunicador_texto),
           'campos', p.campos, 'updated_at', p.updated_at,
           'evento', CASE WHEN p.evento_id IS NOT NULL THEN (
                       SELECT jsonb_build_object(
                                'id', p.evento_id,
                                'dia', count(*) FILTER (WHERE e.fecha < p.fecha OR (e.fecha = p.fecha AND e.id <= p.id)),
                                'dias', count(*))
                         FROM public.dps_planes e WHERE e.evento_id = p.evento_id) END,
           'con_asistencia', EXISTS (SELECT 1 FROM public.dps_asistencias a WHERE a.plan_id = p.id))
    FROM public.dps_planes p
    LEFT JOIN public.dps_series s ON s.id = p.serie_id
   WHERE p.id = p_plan_id;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_json(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. RPCs ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_evento_crear(p_tipo text, p_titulo text, p_desde date, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_titulo text := nullif(btrim(p_titulo), '');
  v_hasta date := coalesce(p_hasta, p_desde);
  v_evento uuid := gen_random_uuid();
  v_cfg public.dps_config%ROWTYPE;
  v_fecha date;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('especial', 'cena_del_senor', 'noche_adoracion') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_titulo IS NULL OR char_length(v_titulo) > 120 THEN
    RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF v_hasta < p_desde OR v_hasta - p_desde > 13 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;

  -- Serializes plan creation (as dps_plan_crear and dps_serie_semanas).
  PERFORM pg_advisory_xact_lock(hashtext('dps_planes_domingo'));
  SELECT c.* INTO v_cfg FROM public.dps_config c WHERE c.id;
  v_fecha := p_desde;
  WHILE v_fecha <= v_hasta LOOP
    BEGIN
      INSERT INTO public.dps_planes (fecha, tipo, titulo, horarios, llegada, evento_id, updated_by) -- noqa: insert-into
      VALUES (v_fecha, p_tipo, v_titulo, coalesce(v_cfg.horarios, '["09:15", "11:15"]'::jsonb),
              coalesce(v_cfg.llegada, '07:00'::time), v_evento, v_actor);
    EXCEPTION
      -- The whole call fails, so the days already inserted are rolled back.
      WHEN unique_violation THEN
        RAISE EXCEPTION 'plan_duplicado' USING ERRCODE = '22023', DETAIL = v_fecha::text;
    END;
    v_fecha := v_fecha + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'evento_id', v_evento,
    'planes', (SELECT jsonb_agg(public.dps_plan_json(p.id) ORDER BY p.fecha, p.id)
                 FROM public.dps_planes p WHERE p.evento_id = v_evento));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_evento_crear(text, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_evento_crear(text, text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_mover(p_plan_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_hoy date := public.ninos_hoy();
  v_plan public.dps_planes%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dps_planes_domingo'));
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_plan.tipo = 'domingo' THEN
    RAISE EXCEPTION 'plan_domingo' USING ERRCODE = '22023';
  END IF;
  IF v_plan.fecha < v_hoy THEN
    RAISE EXCEPTION 'plan_pasado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_asistencias a WHERE a.plan_id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_con_asistencia' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_fecha < v_hoy THEN
    RAISE EXCEPTION 'fecha_pasada' USING ERRCODE = '22023';
  END IF;

  IF p_fecha <> v_plan.fecha THEN
    UPDATE public.dps_planes SET fecha = p_fecha, updated_at = now(), updated_by = v_actor WHERE id = p_plan_id;
  END IF;
  RETURN public.dps_plan_json(p_plan_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'plan_duplicado' USING ERRCODE = '22023', DETAIL = p_fecha::text;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_mover(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_mover(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_plan_eliminar(p_plan_id uuid, p_todo_el_evento boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan public.dps_planes%ROWTYPE;
  v_ids uuid[];
  v_eliminados integer;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_plan.tipo = 'domingo' THEN
    RAISE EXCEPTION 'plan_domingo' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(p.id ORDER BY p.id) INTO v_ids
    FROM public.dps_planes p
   WHERE p.id = p_plan_id
      OR (coalesce(p_todo_el_evento, false) AND v_plan.evento_id IS NOT NULL AND p.evento_id = v_plan.evento_id);
  PERFORM 1 FROM public.dps_planes p WHERE p.id = ANY (v_ids) ORDER BY p.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.dps_asistencias a WHERE a.plan_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'plan_con_asistencia' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.dps_planes p WHERE p.id = ANY (v_ids) AND p.tipo <> 'domingo';
  GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  RETURN v_eliminados;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_eliminar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_eliminar(uuid, boolean) TO authenticated;
