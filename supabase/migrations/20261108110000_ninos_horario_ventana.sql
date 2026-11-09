-- Niños reads the horario window and serves dated turnos of its events
-- (odd/tasks/ninos-checkin-pco.md, T1b, S5, S8.1, S8.2).
--
-- What:
--   1. ninos_turno_ocurre_en(turno, fecha): a weekly turno happens on its
--      weekday; a dated turno ('fechas') happens on its planned dates, and
--      only counts for Niños when a Niños horario links it. Dated turnos of
--      other ministries (no horario) stay invisible to Niños, as before.
--      It does not look at turno.activo: callers keep the activo filter they
--      had, so reports still show the history of a deactivated turno.
--   2. ninos_turno_hora_en(turno, fecha): the planned date's hora when set,
--      else the turno's (S8.2: the hour lives only in Dream Team).
--   3. ninos_precheck_en_ventana: the window is the horario's abre_min_antes
--      / cierra_min_despues around that hour (ninos_horario_de_turno, 120/120
--      for a turno without horario = today's ±2 h). The seeded Domingo
--      semanal horarios are 120/120, so the Sunday window does not move.
--   4. ninos_checkin accepts a weekly turno as before (any date) and a dated
--      turno only on one of its planned dates with an active horario of an
--      active event.
--   5. Volunteers (S8.1, "la planilla funciona igual que el domingo"):
--      ninos_voluntarios_turnos lists the linked dated turnos too and gains
--      two trailing columns, tipo and fechas (planned dates, NULL for a weekly
--      turno), so the client stops deriving dates from dia_semana for them;
--      planilla, marcar, congelar, congelar_pendientes (cron) and
--      ninos_reporte_voluntarios use ninos_turno_ocurre_en instead of the
--      weekday. The planilla JSON gains tipo and fechas.
--   6. ninos_voluntarios_del_turno_vivo: on a dated turno the expected
--      volunteers are the ones set for that date
--      (dream_team_turno_fecha_servidores), as Estudiantes does; weekly turnos
--      keep the frequency rule.
--   7. ninos_preregistro_servicios_hoy shows the date's hour.
--
-- Every other line of each body is the latest one (20261026140000 for the
-- volunteers RPCs and the check-in, 20261012180100 for the cron, 20261012180000
-- for del_turno_vivo, 20261026120000 for servicios_hoy); grants restated as
-- they were. Weekly turnos behave exactly as before.
--
-- Rollback: re-run the bodies of the migrations named above, then
--   DROP FUNCTION IF EXISTS public.ninos_turno_hora_en(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_turno_ocurre_en(uuid, date);
-- ninos_voluntarios_turnos changed its result type: DROP it before restoring
-- the 20261026140000 body.

-- ── 1. helpers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_turno_ocurre_en(p_turno_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dream_team_turnos t
     WHERE t.id = p_turno_id
       AND p_fecha IS NOT NULL
       AND CASE t.tipo
             WHEN 'semanal' THEN extract(dow FROM p_fecha)::int = t.dia_semana
             ELSE EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = t.id)
                  AND EXISTS (SELECT 1 FROM public.dream_team_turno_fechas f
                               WHERE f.turno_id = t.id AND f.fecha = p_fecha)
           END);
$$;
REVOKE ALL ON FUNCTION public.ninos_turno_ocurre_en(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_turno_hora_en(p_turno_id uuid, p_fecha date)
RETURNS time
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (SELECT f.hora FROM public.dream_team_turno_fechas f WHERE f.turno_id = t.id AND f.fecha = p_fecha),
    t.hora)
    FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id;
$$;
REVOKE ALL ON FUNCTION public.ninos_turno_hora_en(uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 2. pre-check window ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_precheck_en_ventana(p_turno_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dream_team_turnos t
     CROSS JOIN LATERAL (SELECT v.abre_min_antes, v.cierra_min_despues
                           FROM public.ninos_horario_de_turno(t.id) v LIMIT 1) w
     WHERE t.id = p_turno_id AND t.activo
       AND public.ninos_turno_ocurre_en(t.id, public.ninos_hoy())
       -- The horario's minutes before / after the start, Caracas time.
       AND (now() AT TIME ZONE 'America/Caracas')
           BETWEEN public.ninos_hoy() + public.ninos_turno_hora_en(t.id, public.ninos_hoy())
                   - make_interval(mins => w.abre_min_antes)
               AND public.ninos_hoy() + public.ninos_turno_hora_en(t.id, public.ninos_hoy())
                   + make_interval(mins => w.cierra_min_despues));
$$;
REVOKE ALL ON FUNCTION public.ninos_precheck_en_ventana(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_preregistro_servicios_hoy(p_campus_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('turno_id', x.id, 'nombre', x.nombre, 'hora', x.hora)
                            ORDER BY x.hora, x.orden), '[]'::jsonb)
    FROM (SELECT t.id, t.nombre, t.orden, public.ninos_turno_hora_en(t.id, public.ninos_hoy()) AS hora
            FROM public.dream_team_turnos t
           WHERE t.campus_id = p_campus_id
             AND public.ninos_precheck_en_ventana(t.id)
             AND EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = t.campus_id AND s.activo)) x;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_servicios_hoy(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. volunteers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_del_turno_vivo(p_turno_id uuid, p_fecha date)
RETURNS TABLE (servicio_id uuid, area_id uuid, equipo_id uuid, esperado boolean, sin_turno boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT sv.id, q.area_id, q.equipo_id,
         (CASE t.tipo
            WHEN 'fechas' THEN EXISTS (
              SELECT 1
                FROM public.dream_team_turno_fecha_servidores fs
                JOIN public.dream_team_turno_fechas f ON f.id = fs.turno_fecha_id
               WHERE f.turno_id = t.id AND f.fecha = p_fecha AND fs.servicio_id = sv.id)
            ELSE EXISTS (SELECT 1 FROM public.dream_team_servicio_turnos st
                          WHERE st.servicio_id = sv.id AND st.turno_id = t.id
                            AND public.dream_team_turno_sirve_en(st.frecuencia, st.fecha_ancla, p_fecha))
          END)
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

-- The result type gains tipo and fechas: CREATE OR REPLACE cannot change it.
DROP FUNCTION IF EXISTS public.ninos_voluntarios_turnos();
CREATE FUNCTION public.ninos_voluntarios_turnos()
RETURNS TABLE (id uuid, nombre text, hora time, orden integer, dia_semana smallint, campus_id uuid, campus text,
               tipo text, fechas date[])
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
  SELECT t.id, t.nombre, t.hora, t.orden, t.dia_semana, t.campus_id, c.nombre, t.tipo,
         CASE WHEN t.tipo = 'fechas' THEN
           (SELECT coalesce(array_agg(f.fecha ORDER BY f.fecha), ARRAY[]::date[])
              FROM public.dream_team_turno_fechas f WHERE f.turno_id = t.id)
         END
    FROM servidos s
    JOIN public.dream_team_turnos t ON t.id = s.turno_id
    JOIN public.campus c ON c.id = t.campus_id
   WHERE t.tipo = 'semanal'
      OR EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = t.id)
   ORDER BY c.nombre, t.orden, t.hora;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_turnos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_turnos() TO authenticated;

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
                     WHERE t.id = p_turno_id AND t.activo
                       AND public.ninos_turno_ocurre_en(t.id, p_fecha)) THEN
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

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_congelar_pendientes()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hoy date := public.ninos_hoy();
  v_congeladas integer;
BEGIN
  SELECT count(*) FILTER (WHERE public.ninos_voluntarios_congelar(t.id, d::date))::int
    INTO v_congeladas
    FROM public.dream_team_turnos t
    CROSS JOIN generate_series(greatest(v_hoy - 14, public.ninos_voluntarios_congelado_desde()), v_hoy - 1,
                               interval '1 day') AS d
   WHERE t.activo
     AND public.ninos_turno_ocurre_en(t.id, d::date)
     AND NOT EXISTS (SELECT 1 FROM public.ninos_voluntarios_rosters c
                      WHERE c.turno_id = t.id AND c.fecha = d::date);
  RETURN v_congeladas;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_congelar_pendientes() FROM PUBLIC, anon, authenticated;

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
  v_fechas date[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id AND t.activo
     AND (t.tipo = 'semanal' OR EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = t.id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ninos_turno_ocurre_en(p_turno_id, p_fecha) THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF v_turno.tipo = 'fechas' THEN
    SELECT coalesce(array_agg(f.fecha ORDER BY f.fecha), ARRAY[]::date[]) INTO v_fechas
      FROM public.dream_team_turno_fechas f WHERE f.turno_id = p_turno_id;
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
    'tipo', v_turno.tipo, 'fechas', to_jsonb(v_fechas),
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
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id AND t.activo
     AND (t.tipo = 'semanal' OR EXISTS (SELECT 1 FROM public.ninos_evento_horarios h WHERE h.turno_id = t.id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 14
     OR NOT public.ninos_turno_ocurre_en(p_turno_id, p_fecha) THEN
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
  -- Only an authorized caller freezes a past date; the frozen roster then
  -- decides `esperado` (a snapshot is a subset of the live roster read above).
  IF public.ninos_voluntarios_congelar(p_turno_id, p_fecha) THEN
    SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
           coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
      INTO v_servicios, v_equipos, v_esperados
      FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
     WHERE r.servicio_id = ANY (v_ids);
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
      AND public.ninos_turno_ocurre_en(t.id, d::date)
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
         AND public.ninos_turno_ocurre_en(t.id, d::date)
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

-- ── 4. check-in ──────────────────────────────────────────────────────

-- Checks in the children of one family visit. p_salon_ids is aligned with
-- p_nino_ids. Every child shares one code. Returns one row per child with the
-- room occupancy after the check-in and whether it went over capacity.
CREATE OR REPLACE FUNCTION public.ninos_checkin(
  p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_salon_ids uuid[]
)
RETURNS TABLE (nino_id uuid, salon_id uuid, codigo text, ocupacion integer, capacidad integer,
               sobre_capacidad boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_campus uuid;
  v_actor uuid := public.ninos_usuario_actual();
  v_visita uuid := gen_random_uuid();
  v_codigo text;
  v_intentos integer := 0;
  i integer;
  v_salon public.ninos_salones%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR p_salon_ids IS NULL OR cardinality(p_nino_ids) = 0
     OR cardinality(p_nino_ids) <> cardinality(p_salon_ids) THEN
    RAISE EXCEPTION 'p_nino_ids and p_salon_ids must be non-empty and aligned' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'p_fecha is required' USING ERRCODE = '22023';
  END IF;

  SELECT t.campus_id INTO v_campus FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id AND t.activo
     AND (t.tipo = 'semanal'
          -- A dated turno only on a planned date, with an active horario of an active event.
          OR (public.ninos_turno_ocurre_en(t.id, p_fecha)
              AND EXISTS (SELECT 1 FROM public.ninos_evento_horarios h
                            JOIN public.ninos_eventos e ON e.id = h.evento_id
                           WHERE h.turno_id = t.id AND h.activo AND e.activo)));
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive turno' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1 .. cardinality(p_nino_ids) LOOP
    SELECT * INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_ids[i];
    IF NOT FOUND OR NOT v_salon.activo OR v_salon.campus_id <> v_campus THEN
      RAISE EXCEPTION 'room % is not an active room of the turno campus', p_salon_ids[i] USING ERRCODE = '22023';
    END IF;
    IF NOT public.ninos_puede_operar(v_salon.equipo_id) THEN
      RAISE EXCEPTION 'not allowed to check in to room %', v_salon.nombre USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_ids[i]) THEN
      RAISE EXCEPTION 'child % has no ficha', p_nino_ids[i] USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Serialize code issuance for this campus + fecha + turno.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_checkin:' || v_campus || ':' || p_fecha || ':' || p_turno_id, 0));

  LOOP
    v_codigo := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ninos_checkins c
      WHERE c.campus_id = v_campus AND c.fecha = p_fecha AND c.turno_id = p_turno_id
        AND c.codigo = v_codigo AND c.salida_at IS NULL);
    v_intentos := v_intentos + 1;
    IF v_intentos > 200 THEN
      RAISE EXCEPTION 'no free code for this turno' USING ERRCODE = '53000';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
    SELECT n.nino, n.salon, p_turno_id, v_campus, p_fecha, v_visita, v_codigo, v_actor
    FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a child is already checked in for this turno' USING ERRCODE = '23505';
  END;

  RETURN QUERY
  SELECT n.nino, n.salon, v_codigo,
         (SELECT count(*)::int FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL),
         s.capacidad,
         (SELECT count(*) FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL) > s.capacidad
  FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon)
  JOIN public.ninos_salones s ON s.id = n.salon;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) TO authenticated;
