-- Frozen expected roster of Niños volunteers per turno and fecha
-- (odd/tasks/ninos-asistencia-voluntarios.md, V7).
--
-- Rollback:
--   re-apply 20261010130000_ninos_voluntarios_asistencia.sql (del_turno,
--   planilla, marcar) and 20261012170000_ninos_voluntarios_reporte_coordinador.sql
--   (report), then
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_congelar(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_del_turno_vivo(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_congelado_desde();
--   DROP TABLE IF EXISTS public.ninos_voluntarios_roster_servicios;
--   DROP TABLE IF EXISTS public.ninos_voluntarios_rosters;
--
-- Why: the expected roster of a past date was derived from today's turno
-- assignments, so moving or removing a volunteer changed past Sundays'
-- "esperados / sin marcar / faltó". Each past date is now frozen as it was.
--
-- What:
--   1. ninos_voluntarios_rosters (turno, fecha): the date is frozen;
--      ninos_voluntarios_roster_servicios: who was expected that day and in
--      which area/equipo. RLS on, no policies, no privileges for anon or
--      authenticated: only the definer functions below read or write them.
--   2. ninos_voluntarios_del_turno_vivo(turno, fecha): the previous live
--      derivation, unchanged. ninos_voluntarios_del_turno(turno, fecha) keeps
--      its signature: on a frozen date `esperado` = in the snapshot (with the
--      snapshot's area/equipo), and snapshot servicios no longer in the live
--      roster are still listed as expected; otherwise it is the live roster.
--   3. ninos_voluntarios_congelar(turno, fecha): freezes an active turno's
--      past date (fecha < ninos_hoy(), the turno's weekday, not before
--      ninos_voluntarios_congelado_desde() = 2026-10-11) once; an existing
--      snapshot is never overwritten (ON CONFLICT DO NOTHING). Internal.
--   4. Freezing happens when the roster is loaded (planilla) or marked
--      (marcar), and in ninos_reporte_voluntarios for every past date in its
--      range nobody froze yet: pg_cron is not installed on this database, so
--      there is no scheduled job. The three become VOLATILE; signatures,
--      outputs, gates and the V6 scope (ninos_voluntarios_marcables) stay.
--      Today and future dates are never frozen; dates before 2026-10-11 keep
--      the derived roster. Marks are untouched: a volunteer marked but not in
--      the snapshot still counts as an extra.
--
-- Every function runs with definer rights and search_path ''.

-- ── 1. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_voluntarios_rosters (
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  congelado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (turno_id, fecha)
);

CREATE TABLE IF NOT EXISTS public.ninos_voluntarios_roster_servicios (
  turno_id uuid NOT NULL,
  fecha date NOT NULL,
  servicio_id uuid NOT NULL REFERENCES public.dream_team_servicios(id) ON DELETE CASCADE,
  area_id uuid NOT NULL,
  equipo_id uuid NOT NULL,
  PRIMARY KEY (turno_id, fecha, servicio_id),
  FOREIGN KEY (turno_id, fecha) REFERENCES public.ninos_voluntarios_rosters (turno_id, fecha) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ninos_voluntarios_roster_servicios_servicio_idx
  ON public.ninos_voluntarios_roster_servicios (servicio_id);

COMMENT ON TABLE public.ninos_voluntarios_rosters IS
  'Turno and fecha whose expected Niños volunteer roster is frozen. Written only by ninos_voluntarios_congelar.';
COMMENT ON TABLE public.ninos_voluntarios_roster_servicios IS
  'Frozen expected Niños volunteers per turno and fecha, with their area and equipo that day.';

ALTER TABLE public.ninos_voluntarios_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_voluntarios_roster_servicios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ninos_voluntarios_rosters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ninos_voluntarios_roster_servicios FROM PUBLIC, anon, authenticated;

-- ── 2. live roster, freeze and frozen-aware roster ───────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_congelado_desde()
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT DATE '2026-10-11';
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_congelado_desde() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_del_turno_vivo(p_turno_id uuid, p_fecha date)
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
REVOKE ALL ON FUNCTION public.ninos_voluntarios_del_turno_vivo(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_congelar(p_turno_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nuevos integer;
BEGIN
  IF p_fecha IS NULL OR p_fecha >= public.ninos_hoy() OR p_fecha < public.ninos_voluntarios_congelado_desde()
     OR NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t
                     WHERE t.id = p_turno_id AND t.activo AND t.dia_semana = extract(dow FROM p_fecha)::int) THEN
    RETURN false;
  END IF;
  -- The header row claims the date: a concurrent caller waits and then skips.
  INSERT INTO public.ninos_voluntarios_rosters (turno_id, fecha) VALUES (p_turno_id, p_fecha) -- noqa: insert-into
  ON CONFLICT (turno_id, fecha) DO NOTHING;
  GET DIAGNOSTICS v_nuevos = ROW_COUNT;
  IF v_nuevos = 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.ninos_voluntarios_roster_servicios (turno_id, fecha, servicio_id, area_id, equipo_id) -- noqa: insert-into
  SELECT p_turno_id, p_fecha, r.servicio_id, r.area_id, r.equipo_id
    FROM public.ninos_voluntarios_del_turno_vivo(p_turno_id, p_fecha) r
   WHERE r.esperado
  ON CONFLICT (turno_id, fecha, servicio_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_congelar(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_del_turno(p_turno_id uuid, p_fecha date)
RETURNS TABLE (servicio_id uuid, area_id uuid, equipo_id uuid, esperado boolean, sin_turno boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH vivo AS (
    SELECT v.* FROM public.ninos_voluntarios_del_turno_vivo(p_turno_id, p_fecha) v
  ), congelado AS (
    SELECT z.servicio_id, z.area_id, z.equipo_id
      FROM public.ninos_voluntarios_roster_servicios z
     WHERE z.turno_id = p_turno_id AND z.fecha = p_fecha
  ), hay AS (
    SELECT EXISTS (SELECT 1 FROM public.ninos_voluntarios_rosters c
                    WHERE c.turno_id = p_turno_id AND c.fecha = p_fecha) AS congelada
  )
  SELECT v.servicio_id, coalesce(z.area_id, v.area_id), coalesce(z.equipo_id, v.equipo_id),
         CASE WHEN h.congelada THEN z.servicio_id IS NOT NULL ELSE v.esperado END, v.sin_turno
    FROM vivo v
    CROSS JOIN hay h
    LEFT JOIN congelado z ON z.servicio_id = v.servicio_id
  UNION ALL
  -- Expected that day but no longer in the live roster (moved or inactive).
  SELECT z.servicio_id, z.area_id, z.equipo_id, true, false
    FROM congelado z
   WHERE NOT EXISTS (SELECT 1 FROM vivo v WHERE v.servicio_id = z.servicio_id);
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_del_turno(uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 3. roster and marking freeze past dates ──────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_planilla(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
  PERFORM public.ninos_voluntarios_congelar(p_turno_id, p_fecha);

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
  -- A past date is frozen before its roster decides `esperado`.
  PERFORM public.ninos_voluntarios_congelar(p_turno_id, p_fecha);

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

-- ── 4. report ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_reporte_voluntarios(
  p_desde date,
  p_hasta date,
  p_campus_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hasta date;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta OR p_hasta - p_desde > 366 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ninos_puede_marcar_voluntarios_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  v_hasta := least(p_hasta, public.ninos_hoy());

  -- No scheduler on this database: past dates nobody opened are frozen here.
  PERFORM public.ninos_voluntarios_congelar(t.id, d::date)
     FROM public.dream_team_turnos t
     CROSS JOIN generate_series(p_desde, v_hasta - 1, interval '1 day') AS d
    WHERE t.activo
      AND t.campus_id IN (SELECT m.campus_id FROM public.ninos_voluntarios_marcables(p_campus_id) m)
      AND (p_turno_id IS NULL OR t.id = p_turno_id)
      AND extract(dow FROM d)::int = t.dia_semana
      AND d::date >= public.ninos_voluntarios_congelado_desde()
      AND NOT EXISTS (SELECT 1 FROM public.ninos_voluntarios_rosters c
                       WHERE c.turno_id = t.id AND c.fecha = d::date);

  RETURN (
    WITH eq AS (
      SELECT m.campus_id, m.area_id, m.equipo_id
        FROM public.ninos_voluntarios_marcables(p_campus_id) m
    ), fechas AS (
      SELECT t.id AS turno_id, d::date AS fecha
        FROM public.dream_team_turnos t
        CROSS JOIN generate_series(p_desde, v_hasta, interval '1 day') AS d
       WHERE t.campus_id IN (SELECT eq.campus_id FROM eq)
         AND (p_turno_id IS NULL OR t.id = p_turno_id)
         AND extract(dow FROM d)::int = t.dia_semana
    ), roster AS (
      -- Unmarked expected volunteers only exist on active turnos.
      SELECT f.turno_id, f.fecha, r.servicio_id, r.equipo_id
        FROM fechas f
        JOIN public.dream_team_turnos t ON t.id = f.turno_id AND t.activo
        CROSS JOIN LATERAL public.ninos_voluntarios_del_turno(f.turno_id, f.fecha) r
       WHERE r.esperado AND r.equipo_id IN (SELECT eq.equipo_id FROM eq)
    ), marcas AS (
      SELECT a.turno_id, a.fecha, a.servicio_id, a.esperado, a.estado
        FROM public.dream_team_asistencias a
        JOIN fechas f ON f.turno_id = a.turno_id AND f.fecha = a.fecha
    ), unidas AS (
      SELECT coalesce(m.turno_id, r.turno_id) AS turno_id, coalesce(m.fecha, r.fecha) AS fecha,
             coalesce(m.servicio_id, r.servicio_id) AS servicio_id,
             coalesce(m.esperado, true) AS esperado, m.estado, r.equipo_id
        FROM marcas m
        FULL JOIN roster r ON r.turno_id = m.turno_id AND r.fecha = m.fecha AND r.servicio_id = m.servicio_id
    ), filas AS (
      SELECT u.turno_id, u.fecha, u.servicio_id, eq.area_id, eq.equipo_id, u.esperado, u.estado, t.orden AS turno_orden
        FROM unidas u
        JOIN public.dream_team_turnos t ON t.id = u.turno_id
        JOIN public.dream_team_servicios sv ON sv.id = u.servicio_id
        -- A frozen volunteer stays in the equipo they had that day.
        JOIN eq ON eq.campus_id = t.campus_id AND eq.equipo_id = coalesce(u.equipo_id, sv.equipo_id)
    ), por_servicio AS (
      SELECT x.fecha, x.turno_id, x.area_id, x.equipo_id,
             count(*) FILTER (WHERE x.esperado)::int AS esperados,
             count(*) FILTER (WHERE x.estado = 'presente')::int AS presentes,
             count(*) FILTER (WHERE x.estado = 'justificado')::int AS avisos,
             count(*) FILTER (WHERE x.estado = 'ausente')::int AS faltas,
             count(*) FILTER (WHERE x.estado IS NULL)::int AS sin_marcar,
             count(*) FILTER (WHERE x.estado = 'presente' AND NOT x.esperado)::int AS extras
        FROM filas x
       GROUP BY x.fecha, x.turno_id, x.area_id, x.equipo_id
    ), esperadas AS (
      -- Expected services per volunteer, newest first; the streak is the run
      -- of Faltó from the newest one.
      SELECT x.servicio_id, x.estado,
             row_number() OVER (PARTITION BY x.servicio_id ORDER BY x.fecha DESC, x.turno_orden DESC) AS n
        FROM filas x
       WHERE x.esperado
    ), racha AS (
      SELECT e.servicio_id,
             coalesce(min(e.n) FILTER (WHERE e.estado IS DISTINCT FROM 'ausente'), max(e.n) + 1) - 1 AS seguidas
        FROM esperadas e
       GROUP BY e.servicio_id
    ), por_voluntario AS (
      SELECT x.servicio_id, x.area_id, x.equipo_id,
             count(*) FILTER (WHERE x.esperado)::int AS esperados,
             count(*) FILTER (WHERE x.estado = 'presente')::int AS presentes,
             count(*) FILTER (WHERE x.estado = 'justificado')::int AS avisos,
             count(*) FILTER (WHERE x.estado = 'ausente')::int AS faltas,
             count(*) FILTER (WHERE x.estado IS NULL)::int AS sin_marcar,
             count(*) FILTER (WHERE x.estado = 'presente' AND NOT x.esperado)::int AS extras
        FROM filas x
       GROUP BY x.servicio_id, x.area_id, x.equipo_id
    )
    SELECT jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta,
      'servicios', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'fecha', s.fecha, 'turno_id', s.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
                 'area_id', s.area_id, 'area', ea.label, 'equipo_id', s.equipo_id, 'equipo', e.label,
                 'esperados', s.esperados, 'presentes', s.presentes, 'avisos', s.avisos, 'faltas', s.faltas,
                 'sin_marcar', s.sin_marcar, 'extras', s.extras)
               ORDER BY s.fecha, t.orden, ea.label, e.label), '[]'::jsonb)
          FROM por_servicio s
          JOIN public.dream_team_turnos t ON t.id = s.turno_id
          JOIN public.dream_team_equipos ea ON ea.id = s.area_id
          JOIN public.dream_team_equipos e ON e.id = s.equipo_id),
      'voluntarios', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'servicio_id', k.servicio_id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
                 'area', ea.label, 'equipo', e.label, 'rol', ro.label,
                 'esperados', k.esperados, 'presentes', k.presentes, 'avisos', k.avisos, 'faltas', k.faltas,
                 'sin_marcar', k.sin_marcar, 'extras', k.extras, 'faltas_seguidas', coalesce(r.seguidas, 0)::int)
               ORDER BY coalesce(r.seguidas, 0) DESC, k.faltas DESC, u.nombre, u.apellido), '[]'::jsonb)
          FROM por_voluntario k
          LEFT JOIN racha r ON r.servicio_id = k.servicio_id
          JOIN public.dream_team_servicios sv ON sv.id = k.servicio_id
          JOIN public.usuarios u ON u.id = sv.persona_id
          JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
          JOIN public.dream_team_equipos e ON e.id = k.equipo_id
          JOIN public.dream_team_equipos ea ON ea.id = k.area_id))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_reporte_voluntarios(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_reporte_voluntarios(date, date, uuid, uuid) TO authenticated;
