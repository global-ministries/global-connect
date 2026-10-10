-- Niños attendance reports: monthly view, distinct children per service and
-- area, and whether new families came back (odd/tasks/ninos-checkin.md, N16).
--
-- Rollback: re-apply section 2 (public.ninos_reporte_asistencia) of
-- 20261009120000_ninos_reportes.sql. The signature and grants are the same,
-- so that CREATE OR REPLACE restores the N7 body and drops the new keys.
--
-- What: CREATE OR REPLACE of public.ninos_reporte_asistencia(desde, hasta,
-- campus, turno) → jsonb with the same signature, authority ('sin_autoridad'
-- 42501), range ('rango_invalido' 22023, at most 366 days) and room rule
-- (only rooms where ninos_puede_configurar(room equipo) is true) as N7. Every
-- existing key keeps its meaning. Every "children" number is now a DISTINCT
-- count computed here, so the page never adds rows up to get children
-- (check-ins may be summed and are labelled as check-ins):
--   salones  per fecha + turno + room: `ninos` counts distinct children; new
--            `checkins`.
--   dias     per fecha: `ninos`, `checkins` and new `turnos` / `areas`
--            (distinct children and check-ins per service and per area).
--   meses    NEW. One row per calendar month that touches the range, months
--            without check-ins included: `mes` (first day), `desde`/`hasta`
--            (the part inside the range), `parcial` (the range does not
--            cover the whole month), distinct `ninos`, `checkins`, `dias`
--            (service days: fechas with check-ins), `promedio` (average of
--            the distinct children per service day, null without service
--            days), `nuevos` and `familias_nuevas` (first check-in ever in
--            that month, same rule as `nuevos`), `turnos` and `areas`.
--   totales  NEW. The same figures over the whole range.
--   nuevos   each new child also gets `estado`: 'volvio' when the child has a
--            check-in on a later fecha (any room, no upper date bound),
--            'pendiente' when no room of the campus of the child's first
--            visit has a check-in by anyone after that fecha (that campus has
--            held no service since), else 'no_volvio'; `visitas` (distinct
--            fechas so far, any room), `ultima_fecha`, and `estado_familia`:
--            the family (visita_id of the first check-in) returned when any
--            of its new children returned.
--   ausentes unchanged.
-- Definer rights and search_path '' as before, EXECUTE only for authenticated.

CREATE OR REPLACE FUNCTION public.ninos_reporte_asistencia(
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
  v_salones uuid[];
  v_ref date;
  v_salones_json jsonb;
  v_dias jsonb;
  v_meses jsonb;
  v_totales jsonb;
  v_nuevos jsonb;
  v_ausentes jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta OR p_hasta - p_desde > 366 THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE = '22023';
  END IF;

  -- Rooms the caller may configure (active or not: history still counts).
  SELECT coalesce(array_agg(s.id), ARRAY[]::uuid[]) INTO v_salones
    FROM public.ninos_salones s
   WHERE public.ninos_puede_configurar(s.equipo_id)
     AND (p_campus_id IS NULL OR s.campus_id = p_campus_id);
  IF cardinality(v_salones) = 0 AND NOT public.ninos_puede_configurar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  -- Per room: distinct children, check-ins and the peak of children present
  -- at once (running sum of +1 at entrada_at and -1 at salida_at; exits
  -- first on ties).
  WITH c AS (
    SELECT c.* FROM public.ninos_checkins c
     WHERE c.salon_id = ANY (v_salones) AND c.fecha BETWEEN p_desde AND p_hasta
       AND (p_turno_id IS NULL OR c.turno_id = p_turno_id)
  ), ev AS (
    SELECT c.fecha, c.turno_id, c.salon_id, c.entrada_at AS t, 1 AS d FROM c
    UNION ALL
    SELECT c.fecha, c.turno_id, c.salon_id, c.salida_at, -1 FROM c WHERE c.salida_at IS NOT NULL
  ), corrida AS (
    SELECT ev.fecha, ev.turno_id, ev.salon_id,
           sum(ev.d) OVER (PARTITION BY ev.fecha, ev.turno_id, ev.salon_id ORDER BY ev.t, ev.d
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS presentes
      FROM ev
  ), pico AS (
    SELECT fecha, turno_id, salon_id, max(presentes)::int AS pico FROM corrida GROUP BY 1, 2, 3
  ), filas AS (
    SELECT c.fecha, c.turno_id, c.salon_id, count(DISTINCT c.nino_id)::int AS ninos, count(*)::int AS checkins
      FROM c GROUP BY 1, 2, 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'fecha', f.fecha, 'turno_id', f.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
           'salon_id', f.salon_id, 'salon', s.nombre, 'salon_orden', s.orden, 'area', s.area,
           'capacidad', s.capacidad, 'ninos', f.ninos, 'checkins', f.checkins, 'pico', coalesce(p.pico, 0))
         ORDER BY f.fecha, t.orden, s.orden, s.nombre), '[]'::jsonb)
    INTO v_salones_json
    FROM filas f
    JOIN public.ninos_salones s ON s.id = f.salon_id
    JOIN public.dream_team_turnos t ON t.id = f.turno_id
    LEFT JOIN pico p USING (fecha, turno_id, salon_id);

  -- New children: first check-in ever (any room) inside the range, and that
  -- first check-in is in a room the caller may read. Whether they came back
  -- looks at every room with no upper date bound; a later service on the
  -- same fecha is not a return. 'pendiente' only looks at the campus of the
  -- first visit: no check-in by anyone in any of its rooms since that fecha.
  WITH primera AS (
    SELECT DISTINCT ON (c.nino_id) c.nino_id, c.fecha, c.salon_id, c.turno_id, c.visita_id
      FROM public.ninos_checkins c
     WHERE c.nino_id IN (SELECT r.nino_id FROM public.ninos_checkins r
                          WHERE r.salon_id = ANY (v_salones) AND r.fecha BETWEEN p_desde AND p_hasta)
     ORDER BY c.nino_id, c.fecha, c.entrada_at
  ), nuevo AS (
    SELECT p.nino_id, p.fecha, p.salon_id, p.visita_id, h.visitas, h.ultima_fecha,
           CASE WHEN h.ultima_fecha > p.fecha THEN 'volvio'
                WHEN NOT EXISTS (SELECT 1 FROM public.ninos_checkins x
                                   JOIN public.ninos_salones xs ON xs.id = x.salon_id
                                  WHERE xs.campus_id = ps.campus_id AND x.fecha > p.fecha) THEN 'pendiente'
                ELSE 'no_volvio' END AS estado
      FROM primera p
      JOIN public.ninos_salones ps ON ps.id = p.salon_id
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT x.fecha)::int AS visitas, max(x.fecha) AS ultima_fecha
          FROM public.ninos_checkins x WHERE x.nino_id = p.nino_id
      ) h
     WHERE p.salon_id = ANY (v_salones) AND p.fecha BETWEEN p_desde AND p_hasta
       AND (p_turno_id IS NULL OR p.turno_id = p_turno_id)
  ), familia AS (
    SELECT n.*,
           CASE WHEN bool_or(n.estado = 'volvio') OVER w THEN 'volvio'
                WHEN bool_or(n.estado = 'pendiente') OVER w THEN 'pendiente'
                ELSE 'no_volvio' END AS estado_familia
      FROM nuevo n
    WINDOW w AS (PARTITION BY n.visita_id)
  ), padres AS (
    SELECT r.usuario1_id AS nino_id, r.usuario2_id AS padre_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion::text IN ('padre', 'madre', 'tutor')
    UNION
    SELECT r.usuario2_id, r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion::text = 'hijo'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nino_id', p.nino_id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
           'fecha', p.fecha, 'salon', s.nombre, 'visita_id', p.visita_id,
           'estado', p.estado, 'estado_familia', p.estado_familia,
           'visitas', p.visitas, 'ultima_fecha', p.ultima_fecha,
           'padres', coalesce((SELECT jsonb_agg(btrim(pu.nombre || ' ' || coalesce(pu.apellido, '')) ORDER BY pu.nombre)
                                 FROM padres pa JOIN public.usuarios pu ON pu.id = pa.padre_id
                                WHERE pa.nino_id = p.nino_id), '[]'::jsonb))
         ORDER BY p.fecha, u.apellido, u.nombre), '[]'::jsonb)
    INTO v_nuevos
    FROM familia p
    JOIN public.usuarios u ON u.id = p.nino_id
    JOIN public.ninos_salones s ON s.id = p.salon_id;

  -- Attendance per fecha ('dia'), per calendar month ('mes') and over the
  -- whole range ('rango'). Each check-in is repeated once per period it
  -- belongs to, and every `ninos` is count(DISTINCT child) of its period
  -- (and service or area): a child seen in both services, in two rooms or on
  -- several Sundays counts once. New children and families per period come
  -- from v_nuevos, so they always match that list.
  WITH c AS (
    SELECT c.nino_id, c.fecha, c.turno_id, s.area
      FROM public.ninos_checkins c
      JOIN public.ninos_salones s ON s.id = c.salon_id
     WHERE c.salon_id = ANY (v_salones) AND c.fecha BETWEEN p_desde AND p_hasta
       AND (p_turno_id IS NULL OR c.turno_id = p_turno_id)
  ), p AS (
    SELECT 'dia'::text AS tipo, c.fecha AS clave, c.nino_id, c.fecha, c.turno_id, c.area FROM c
    UNION ALL
    SELECT 'mes', date_trunc('month', c.fecha::timestamp)::date, c.nino_id, c.fecha, c.turno_id, c.area FROM c
    UNION ALL
    SELECT 'rango', p_desde, c.nino_id, c.fecha, c.turno_id, c.area FROM c
  ), tot AS (
    SELECT p.tipo, p.clave, count(DISTINCT p.nino_id)::int AS ninos, count(*)::int AS checkins,
           count(DISTINCT p.fecha)::int AS dias
      FROM p GROUP BY p.tipo, p.clave
  ), por_turno AS (
    SELECT x.tipo, x.clave,
           jsonb_agg(jsonb_build_object('turno_id', x.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
                                        'ninos', x.ninos, 'checkins', x.checkins)
                     ORDER BY t.orden, t.nombre) AS turnos
      FROM (SELECT p.tipo, p.clave, p.turno_id, count(DISTINCT p.nino_id)::int AS ninos, count(*)::int AS checkins
              FROM p GROUP BY p.tipo, p.clave, p.turno_id) x
      JOIN public.dream_team_turnos t ON t.id = x.turno_id
     GROUP BY x.tipo, x.clave
  ), por_area AS (
    SELECT x.tipo, x.clave,
           jsonb_agg(jsonb_build_object('area', x.area, 'ninos', x.ninos, 'checkins', x.checkins) ORDER BY x.area) AS areas
      FROM (SELECT p.tipo, p.clave, p.area, count(DISTINCT p.nino_id)::int AS ninos, count(*)::int AS checkins
              FROM p GROUP BY p.tipo, p.clave, p.area) x
     GROUP BY x.tipo, x.clave
  ), promedio AS (
    -- Average of the distinct children per service day.
    SELECT 'mes'::text AS tipo, date_trunc('month', d.clave::timestamp)::date AS clave, round(avg(d.ninos), 1) AS promedio
      FROM tot d WHERE d.tipo = 'dia' GROUP BY 2
    UNION ALL
    SELECT 'rango', p_desde, round(avg(d.ninos), 1) FROM tot d WHERE d.tipo = 'dia'
  ), periodo AS (
    SELECT t.tipo, t.clave, t.ninos, t.checkins, t.dias, pr.promedio,
           coalesce(pt.turnos, '[]'::jsonb) AS turnos, coalesce(pa.areas, '[]'::jsonb) AS areas
      FROM tot t
      LEFT JOIN promedio pr ON pr.tipo = t.tipo AND pr.clave = t.clave
      LEFT JOIN por_turno pt ON pt.tipo = t.tipo AND pt.clave = t.clave
      LEFT JOIN por_area pa ON pa.tipo = t.tipo AND pa.clave = t.clave
  ), nv AS (
    SELECT (e ->> 'fecha')::date AS fecha, e ->> 'visita_id' AS visita_id FROM jsonb_array_elements(v_nuevos) e
  ), nv_mes AS (
    SELECT date_trunc('month', nv.fecha::timestamp)::date AS mes, count(*)::int AS nuevos,
           count(DISTINCT nv.visita_id)::int AS familias
      FROM nv GROUP BY 1
  ), mes AS (
    SELECT m::date AS mes, greatest(m::date, p_desde) AS desde,
           least((m + interval '1 month - 1 day')::date, p_hasta) AS hasta,
           m::date < p_desde OR (m + interval '1 month - 1 day')::date > p_hasta AS parcial
      FROM generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp),
                           interval '1 month') AS m
  )
  SELECT
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'fecha', d.clave, 'ninos', d.ninos, 'checkins', d.checkins, 'turnos', d.turnos, 'areas', d.areas)
            ORDER BY d.clave), '[]'::jsonb)
       FROM periodo d WHERE d.tipo = 'dia'),
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'mes', m.mes, 'desde', m.desde, 'hasta', m.hasta, 'parcial', m.parcial,
              'ninos', coalesce(r.ninos, 0), 'checkins', coalesce(r.checkins, 0), 'dias', coalesce(r.dias, 0),
              'promedio', r.promedio, 'nuevos', coalesce(n.nuevos, 0), 'familias_nuevas', coalesce(n.familias, 0),
              'turnos', coalesce(r.turnos, '[]'::jsonb), 'areas', coalesce(r.areas, '[]'::jsonb))
            ORDER BY m.mes), '[]'::jsonb)
       FROM mes m
       LEFT JOIN periodo r ON r.tipo = 'mes' AND r.clave = m.mes
       LEFT JOIN nv_mes n ON n.mes = m.mes),
    (SELECT jsonb_build_object(
              'ninos', coalesce(r.ninos, 0), 'checkins', coalesce(r.checkins, 0), 'dias', coalesce(r.dias, 0),
              'promedio', r.promedio,
              'nuevos', (SELECT count(*)::int FROM nv),
              'familias_nuevas', (SELECT count(DISTINCT nv.visita_id)::int FROM nv),
              'turnos', coalesce(r.turnos, '[]'::jsonb), 'areas', coalesce(r.areas, '[]'::jsonb))
       FROM (SELECT 1) uno
       LEFT JOIN periodo r ON r.tipo = 'rango')
    INTO v_dias, v_meses, v_totales;

  -- Stopped coming, measured on the last Sunday up to `hasta`.
  v_ref := p_hasta - extract(dow FROM p_hasta)::int;
  WITH a AS (
    SELECT c.nino_id, c.fecha, c.salon_id, c.entrada_at FROM public.ninos_checkins c
     WHERE c.salon_id = ANY (v_salones) AND c.fecha BETWEEN v_ref - 35 AND v_ref
       AND (p_turno_id IS NULL OR c.turno_id = p_turno_id)
  ), cuenta AS (
    SELECT a.nino_id,
           count(DISTINCT a.fecha) FILTER (WHERE a.fecha <= v_ref - 14) AS antes,
           count(DISTINCT a.fecha) FILTER (WHERE a.fecha > v_ref - 14) AS recientes
      FROM a GROUP BY a.nino_id
  ), ultima AS (
    SELECT DISTINCT ON (a.nino_id) a.nino_id, a.fecha, a.salon_id FROM a ORDER BY a.nino_id, a.fecha DESC, a.entrada_at DESC
  ), padres AS (
    SELECT r.usuario1_id AS nino_id, r.usuario2_id AS padre_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion::text IN ('padre', 'madre', 'tutor')
    UNION
    SELECT r.usuario2_id, r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion::text = 'hijo'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nino_id', k.nino_id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
           'ultima_fecha', l.fecha, 'salon', s.nombre, 'veces', k.antes,
           'padres', coalesce((SELECT jsonb_agg(btrim(pu.nombre || ' ' || coalesce(pu.apellido, '')) ORDER BY pu.nombre)
                                 FROM padres pa JOIN public.usuarios pu ON pu.id = pa.padre_id
                                WHERE pa.nino_id = k.nino_id), '[]'::jsonb))
         ORDER BY l.fecha DESC, u.apellido, u.nombre), '[]'::jsonb)
    INTO v_ausentes
    FROM cuenta k
    JOIN ultima l ON l.nino_id = k.nino_id
    JOIN public.usuarios u ON u.id = k.nino_id
    JOIN public.ninos_salones s ON s.id = l.salon_id
   WHERE k.antes >= 2 AND k.recientes = 0;

  RETURN jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'domingo_referencia', v_ref,
    'salones', v_salones_json, 'dias', v_dias, 'meses', v_meses, 'totales', v_totales,
    'nuevos', v_nuevos, 'ausentes', v_ausentes);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_reporte_asistencia(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_reporte_asistencia(date, date, uuid, uuid) TO authenticated;
