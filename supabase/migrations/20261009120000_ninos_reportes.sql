-- Niños attendance reports (odd/tasks/ninos-checkin.md, task N7).
--
-- What:
--   1. ninos_puede_configurar_algun_area(): menu/page flag. True when the
--      caller may configure (direct or coordinate) some area that owns a room:
--      admin/pastor, Directora de Niños, area coordinators. Anfitriones and
--      Líderes are NOT included.
--   2. ninos_reporte_asistencia(desde, hasta, campus, turno) → jsonb with every
--      aggregate the /ninos/reportes page needs, computed here (never on raw
--      rows in the client):
--        salones   per fecha + turno + room: children checked in and the peak
--                  of children present at the same time, plus capacity;
--        dias      per fecha: distinct children and check-ins;
--        nuevos    children whose FIRST check-in ever falls in the range, with
--                  their parents' names; a family = one visita_id of that
--                  first check-in;
--        ausentes  children who attended >= 2 of the 4 Sundays before the last
--                  two Sundays (up to `hasta`) and none of the last two.
--      Only rooms where ninos_puede_configurar(room equipo) is true are read;
--      without any such room it raises 'sin_autoridad' (42501). The range is
--      at most 366 days ('rango_invalido', 22023).
--
-- Both run with definer rights and search_path '', EXECUTE only for
-- authenticated.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_reporte_asistencia(date, date, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.ninos_puede_configurar_algun_area();

-- ── 1. menu flag ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_puede_configurar_algun_area()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_usuario_actual() IS NOT NULL AND EXISTS (
    SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s WHERE s.activo) a
    WHERE public.ninos_puede_configurar(a.equipo_id)
  );
$$;
REVOKE ALL ON FUNCTION public.ninos_puede_configurar_algun_area() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_puede_configurar_algun_area() TO authenticated;

-- ── 2. report ────────────────────────────────────────────────────────

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

  -- Per room: check-ins and the peak of children present at once (running
  -- sum of +1 at entrada_at and -1 at salida_at; exits first on ties).
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
    SELECT c.fecha, c.turno_id, c.salon_id, count(*)::int AS ninos FROM c GROUP BY 1, 2, 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'fecha', f.fecha, 'turno_id', f.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
           'salon_id', f.salon_id, 'salon', s.nombre, 'salon_orden', s.orden, 'area', s.area,
           'capacidad', s.capacidad, 'ninos', f.ninos, 'pico', coalesce(p.pico, 0))
         ORDER BY f.fecha, t.orden, s.orden, s.nombre), '[]'::jsonb)
    INTO v_salones_json
    FROM filas f
    JOIN public.ninos_salones s ON s.id = f.salon_id
    JOIN public.dream_team_turnos t ON t.id = f.turno_id
    LEFT JOIN pico p USING (fecha, turno_id, salon_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'ninos', d.ninos, 'checkins', d.checkins)
                            ORDER BY d.fecha), '[]'::jsonb)
    INTO v_dias
    FROM (SELECT c.fecha, count(DISTINCT c.nino_id)::int AS ninos, count(*)::int AS checkins
            FROM public.ninos_checkins c
           WHERE c.salon_id = ANY (v_salones) AND c.fecha BETWEEN p_desde AND p_hasta
             AND (p_turno_id IS NULL OR c.turno_id = p_turno_id)
           GROUP BY c.fecha) d;

  -- New children: first check-in ever (any room) inside the range, and that
  -- first check-in is in a room the caller may read.
  WITH primera AS (
    SELECT DISTINCT ON (c.nino_id) c.nino_id, c.fecha, c.salon_id, c.turno_id, c.visita_id
      FROM public.ninos_checkins c
     WHERE c.nino_id IN (SELECT r.nino_id FROM public.ninos_checkins r
                          WHERE r.salon_id = ANY (v_salones) AND r.fecha BETWEEN p_desde AND p_hasta)
     ORDER BY c.nino_id, c.fecha, c.entrada_at
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
           'padres', coalesce((SELECT jsonb_agg(btrim(pu.nombre || ' ' || coalesce(pu.apellido, '')) ORDER BY pu.nombre)
                                 FROM padres pa JOIN public.usuarios pu ON pu.id = pa.padre_id
                                WHERE pa.nino_id = p.nino_id), '[]'::jsonb))
         ORDER BY p.fecha, u.apellido, u.nombre), '[]'::jsonb)
    INTO v_nuevos
    FROM primera p
    JOIN public.usuarios u ON u.id = p.nino_id
    JOIN public.ninos_salones s ON s.id = p.salon_id
   WHERE p.salon_id = ANY (v_salones) AND p.fecha BETWEEN p_desde AND p_hasta
     AND (p_turno_id IS NULL OR p.turno_id = p_turno_id);

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
    'salones', v_salones_json, 'dias', v_dias, 'nuevos', v_nuevos, 'ausentes', v_ausentes);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_reporte_asistencia(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_reporte_asistencia(date, date, uuid, uuid) TO authenticated;
