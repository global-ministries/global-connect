-- Niños volunteer attendance report (odd/tasks/ninos-asistencia-voluntarios.md, V4).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_reporte_voluntarios(date, date, uuid, uuid);
--
-- What:
--   ninos_reporte_voluntarios(desde, hasta, campus, turno) → jsonb for the
--   "Voluntarios" tab of /ninos/reportes. Same gate and range errors as
--   ninos_reporte_asistencia: the caller must configure some Niños area
--   (ninos_puede_configurar_algun_area), else 'sin_autoridad' (42501); the
--   range is at most 366 days, else 'rango_invalido' (22023). Only the equipos
--   of the Niños areas (ninos_voluntarios_equipos) the caller may configure
--   are read.
--
--   A service is a turno and one of its dates in the range, up to ninos_hoy()
--   (no future dates). Per service and volunteer:
--     - marked: the mark decides; its `esperado` was stored when it was made;
--     - not marked: counted only when the current roster expects the
--       volunteer that day (ninos_voluntarios_del_turno: assigned, due per A/B
--       frequency, started on or before it) and then it is "sin marcar".
--   Volunteers without a turno and nobody marked are never counted (P3).
--
--   Keys:
--     servicios   per fecha + turno + area + equipo: esperados, presentes,
--                 avisos, faltas, sin_marcar, extras (presente while not
--                 expected).
--     voluntarios per volunteer: the same totals plus faltas_seguidas, the
--                 consecutive Faltó on their latest expected services (an
--                 Avisó, a Presente or an unmarked service ends the streak).
--
-- Runs with definer rights and search_path '', EXECUTE only for authenticated.

CREATE OR REPLACE FUNCTION public.ninos_reporte_voluntarios(
  p_desde date,
  p_hasta date,
  p_campus_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  IF NOT public.ninos_puede_configurar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  v_hasta := least(p_hasta, public.ninos_hoy());

  RETURN (
    WITH eq AS (
      SELECT q.campus_id, q.area_id, q.equipo_id
        FROM public.ninos_voluntarios_equipos(p_campus_id) q
       WHERE public.ninos_puede_configurar(q.equipo_id)
    ), fechas AS (
      SELECT t.id AS turno_id, d::date AS fecha
        FROM public.dream_team_turnos t
        CROSS JOIN generate_series(p_desde, v_hasta, interval '1 day') AS d
       WHERE t.campus_id IN (SELECT eq.campus_id FROM eq)
         AND (p_turno_id IS NULL OR t.id = p_turno_id)
         AND extract(dow FROM d)::int = t.dia_semana
    ), roster AS (
      -- Unmarked expected volunteers only exist on active turnos.
      SELECT f.turno_id, f.fecha, r.servicio_id
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
             coalesce(m.esperado, true) AS esperado, m.estado
        FROM marcas m
        FULL JOIN roster r ON r.turno_id = m.turno_id AND r.fecha = m.fecha AND r.servicio_id = m.servicio_id
    ), filas AS (
      SELECT u.turno_id, u.fecha, u.servicio_id, eq.area_id, eq.equipo_id, u.esperado, u.estado, t.orden AS turno_orden
        FROM unidas u
        JOIN public.dream_team_turnos t ON t.id = u.turno_id
        JOIN public.dream_team_servicios sv ON sv.id = u.servicio_id
        JOIN eq ON eq.campus_id = t.campus_id AND eq.equipo_id = sv.equipo_id
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
