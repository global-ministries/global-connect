-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: «Mover a otro salón» only to a salón that corresponds to the child
-- (odd/tasks/ninos-checkin-pco.md, T2f, S9.5, L34).
--
-- Why: L34 "el ingreso al salon es por la edad y grado y por lo tanto no es
-- equitativo no se puede colocar a alguien de maternal en un salon que no
-- corresponda y viceversa". ninos_mover_salon (20261108140000) accepted any
-- active salón of the campus the caller operates, and ninos_salon_estado
-- offered all of them.
--
-- What:
--   1. ninos_salon_corresponde(niño, salón, fecha) → boolean, internal: the
--      salón admits the child by the rules of ninos_salon_esperado
--      (20261108140000), evaluated against that salón instead of picking one.
--      Any rule that admits the child is enough:
--        - Waumba age salón (not special needs, with an age range): the age in
--          months on the date is inside the range (bounds included);
--        - UpStreet grade salón (with a grade range): the grade is inside;
--        - Waumba special-needs salón (Plus): the child has special needs and
--          its age fits a Waumba age salón of the salón's campus.
--      An inactive or unknown salón never corresponds. A child with neither
--      birth date nor grade cannot be checked, so every active salón
--      corresponds (S9.5). The preferred salón of the ficha is not a rule
--      here (L34: it no longer overrides the rules).
--   2. ninos_mover_salon: as in 20261108140000 plus, after the destination
--      checks, 22023 salon_no_corresponde when (1) is false. Nothing is
--      written on a refusal.
--   3. ninos_salon_estado: as in 20261108140000 plus destinos_por_nino, an
--      object { nino_id: [salón id] } with, for each child inside this salón
--      (open check-ins of the turno and fecha), the destinos that correspond
--      to them in the order of destinos. destinos stays the salón's list.
--      Empty when the caller does not operate the salón.
--   4. ninos_salon_esperado: as in 20261108140000, but the preferred salón of
--      the ficha counts only when it corresponds to the child (1); otherwise
--      the rules decide (L34), so Esperados and «Llegó» follow the desk.
--
-- Errors: the message is a short code and the HINT a Spanish sentence the
-- screens show as is.
--
-- Every function runs with definer rights and search_path ''.
--
-- Rollback: re-run sections 3, 4 and 5 of 20261108140000_ninos_salon_estados.sql
-- (ninos_salon_esperado, ninos_salon_estado, ninos_mover_salon), then
--   DROP FUNCTION IF EXISTS public.ninos_salon_corresponde(uuid, uuid, date);

-- ── 1. the salón corresponds to the child ────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_corresponde(p_nino_id uuid, p_salon_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH nino AS (
    SELECT f.grado,
           coalesce(btrim(f.necesidades_especiales), '') <> '' AS necesidades,
           CASE WHEN u.fecha_nacimiento IS NULL OR u.fecha_nacimiento::date > p_fecha THEN NULL
                ELSE (extract(year FROM age(p_fecha, u.fecha_nacimiento::date)) * 12
                      + extract(month FROM age(p_fecha, u.fecha_nacimiento::date)))::int END AS meses
      FROM public.usuarios u
      LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
     WHERE u.id = p_nino_id
  ), salon AS (
    SELECT s.* FROM public.ninos_salones s WHERE s.id = p_salon_id AND s.activo
  )
  SELECT coalesce((
    SELECT CASE
             WHEN n.meses IS NULL AND n.grado IS NULL THEN true
             ELSE (s.area = 'waumba' AND NOT s.es_necesidades_especiales
                   AND (s.edad_min_meses IS NOT NULL OR s.edad_max_meses IS NOT NULL)
                   AND n.meses IS NOT NULL
                   AND n.meses BETWEEN coalesce(s.edad_min_meses, 0) AND coalesce(s.edad_max_meses, 2147483647))
               OR (s.area = 'upstreet' AND (s.grado_min IS NOT NULL OR s.grado_max IS NOT NULL)
                   AND n.grado IS NOT NULL
                   AND n.grado BETWEEN coalesce(s.grado_min, 0) AND coalesce(s.grado_max, 12))
               OR (s.area = 'waumba' AND s.es_necesidades_especiales AND n.necesidades AND n.meses IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.ninos_salones a
                                WHERE a.campus_id = s.campus_id AND a.activo
                                  AND a.area = 'waumba' AND NOT a.es_necesidades_especiales
                                  AND (a.edad_min_meses IS NOT NULL OR a.edad_max_meses IS NOT NULL)
                                  AND n.meses BETWEEN coalesce(a.edad_min_meses, 0) AND coalesce(a.edad_max_meses, 2147483647)))
           END
      FROM salon s
      LEFT JOIN nino n ON true), false);
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_corresponde(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 2. the salón's lists, with the destinos of each child ────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_estado(p_salon_id uuid, p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_salon public.ninos_salones%ROWTYPE;
  v_operar boolean;
  v_llegar boolean;
  v_abierto boolean;
  v_esperados jsonb;
  v_retirados jsonb;
  v_movimientos jsonb;
  v_destinos jsonb := '[]'::jsonb;
  v_destinos_por_nino jsonb := '{}'::jsonb;
BEGIN
  SELECT s.* INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_id;
  IF NOT FOUND OR NOT public.ninos_puede_ver_salon(v_salon.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para ver este salón.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t
                  WHERE t.id = p_turno_id AND t.campus_id = v_salon.campus_id) THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
      HINT = 'El horario no es de este campus.';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023',
      HINT = 'Indica la fecha del servicio.';
  END IF;

  v_operar := public.ninos_puede_operar(v_salon.equipo_id);
  -- L32: whoever sees the salón may check in from it.
  v_llegar := true;
  -- Pre-checks are for today inside the window, as the desk's «Llegando».
  v_abierto := p_fecha = public.ninos_hoy() AND public.ninos_precheck_en_ventana(p_turno_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nino_id', p.nino_id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento::date, 'grado', f.grado,
           'avisado_at', p.updated_at,
           'avisado_por', jsonb_build_object('nombre', pa.nombre, 'apellido', pa.apellido),
           'alergias', f.alergias, 'necesidades_especiales', f.necesidades_especiales, 'habitos', f.habitos,
           'puede_comer', f.puede_comer, 'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen)
           ORDER BY u.apellido, u.nombre, p.nino_id), '[]'::jsonb)
    INTO v_esperados
    FROM public.ninos_prechecks p
    JOIN public.usuarios u ON u.id = p.nino_id
    JOIN public.ninos_fichas f ON f.usuario_id = p.nino_id
    JOIN public.usuarios pa ON pa.id = p.solicitado_por
   WHERE v_abierto
     AND p.turno_id = p_turno_id AND p.fecha = p_fecha AND p.estado = 'pendiente'
     AND NOT EXISTS (SELECT 1 FROM public.ninos_checkins c
                      WHERE c.nino_id = p.nino_id AND c.turno_id = p.turno_id AND c.fecha = p.fecha)
     AND public.ninos_salon_esperado(p.nino_id, v_salon.campus_id, p_fecha) = p_salon_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'checkin_id', c.id, 'nino_id', c.nino_id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento::date, 'grado', f.grado, 'codigo', c.codigo,
           'entrada_at', c.entrada_at, 'salida_at', c.salida_at, 'retirado_por_nombre', c.retirado_por_nombre)
           ORDER BY c.salida_at DESC, u.apellido, u.nombre), '[]'::jsonb)
    INTO v_retirados
    FROM public.ninos_checkins c
    JOIN public.usuarios u ON u.id = c.nino_id
    LEFT JOIN public.ninos_fichas f ON f.usuario_id = c.nino_id
   WHERE c.salon_id = p_salon_id AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NOT NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nino_id', c.nino_id, 'nombre', u.nombre, 'apellido', u.apellido,
           'desde_id', m.salon_origen_id, 'desde', so.nombre, 'hacia_id', m.salon_destino_id, 'hacia', sd.nombre,
           'movido_at', m.movido_at, 'motivo', m.motivo)
           ORDER BY m.movido_at, m.id), '[]'::jsonb)
    INTO v_movimientos
    FROM public.ninos_checkin_movimientos m
    JOIN public.ninos_checkins c ON c.id = m.checkin_id
    JOIN public.usuarios u ON u.id = c.nino_id
    JOIN public.ninos_salones so ON so.id = m.salon_origen_id
    JOIN public.ninos_salones sd ON sd.id = m.salon_destino_id
   WHERE c.turno_id = p_turno_id AND c.fecha = p_fecha
     AND p_salon_id IN (m.salon_origen_id, m.salon_destino_id);

  IF v_operar THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'nombre', s.nombre, 'capacidad', s.capacidad, 'abierto', s.abierto,
             'edad_min_meses', s.edad_min_meses, 'edad_max_meses', s.edad_max_meses,
             'grado_min', s.grado_min, 'grado_max', s.grado_max,
             'ocupados', (SELECT count(*) FROM public.ninos_checkins c
                           WHERE c.salon_id = s.id AND c.turno_id = p_turno_id AND c.fecha = p_fecha
                             AND c.salida_at IS NULL))
             ORDER BY s.orden, s.nombre), '[]'::jsonb)
      INTO v_destinos
      FROM public.ninos_salones s
     WHERE s.campus_id = v_salon.campus_id AND s.activo AND s.id <> p_salon_id
       AND public.ninos_puede_operar(s.equipo_id);

    -- S9.5: per child inside, the destinos that correspond to their age or grade.
    SELECT coalesce(jsonb_object_agg(c.nino_id, (
             SELECT coalesce(jsonb_agg(s.id ORDER BY s.orden, s.nombre), '[]'::jsonb)
               FROM public.ninos_salones s
              WHERE s.campus_id = v_salon.campus_id AND s.activo AND s.id <> p_salon_id
                AND public.ninos_puede_operar(s.equipo_id)
                AND public.ninos_salon_corresponde(c.nino_id, s.id, p_fecha))), '{}'::jsonb)
      INTO v_destinos_por_nino
      FROM public.ninos_checkins c
     WHERE c.salon_id = p_salon_id AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'salon_id', v_salon.id, 'puede_operar', v_operar, 'puede_llegar', v_llegar,
    'esperados', v_esperados, 'retirados', v_retirados, 'movimientos', v_movimientos, 'destinos', v_destinos,
    'destinos_por_nino', v_destinos_por_nino);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_estado(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_salon_estado(uuid, uuid, date) TO authenticated;

-- ── 3. move only to a salón that corresponds ─────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_mover_salon(
  p_nino_id uuid,
  p_turno_id uuid,
  p_fecha date,
  p_salon_destino_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_checkin public.ninos_checkins%ROWTYPE;
  v_origen public.ninos_salones%ROWTYPE;
  v_destino public.ninos_salones%ROWTYPE;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_ocupacion integer;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para mover niños de este salón.';
  END IF;
  IF char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'motivo_largo' USING ERRCODE = '22023',
      HINT = 'El motivo es muy largo (máximo 300 caracteres).';
  END IF;

  SELECT c.* INTO v_checkin FROM public.ninos_checkins c
   WHERE c.nino_id = p_nino_id AND c.turno_id = p_turno_id AND c.fecha = p_fecha
   FOR UPDATE;
  IF NOT FOUND OR v_checkin.salida_at IS NOT NULL THEN
    RAISE EXCEPTION 'nino_no_adentro' USING ERRCODE = '22023',
      HINT = 'El niño no está adentro en este servicio: ya salió o no ingresó.';
  END IF;
  SELECT s.* INTO v_origen FROM public.ninos_salones s WHERE s.id = v_checkin.salon_id;
  IF NOT public.ninos_puede_operar(v_origen.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para mover niños de este salón.';
  END IF;

  SELECT s.* INTO v_destino FROM public.ninos_salones s WHERE s.id = p_salon_destino_id AND s.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'salon_invalido' USING ERRCODE = '22023',
      HINT = 'El salón de destino no existe o está desactivado.';
  END IF;
  IF v_destino.campus_id <> v_checkin.campus_id THEN
    RAISE EXCEPTION 'salon_otro_campus' USING ERRCODE = '22023',
      HINT = 'El salón de destino es de otro campus.';
  END IF;
  IF v_destino.id = v_origen.id THEN
    RAISE EXCEPTION 'mismo_salon' USING ERRCODE = '22023',
      HINT = 'El niño ya está en ese salón.';
  END IF;
  IF NOT public.ninos_puede_operar(v_destino.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para pasar niños a ese salón.';
  END IF;
  IF NOT public.ninos_salon_corresponde(v_checkin.nino_id, v_destino.id, p_fecha) THEN
    RAISE EXCEPTION 'salon_no_corresponde' USING ERRCODE = '22023',
      HINT = 'Ese salón no corresponde a la edad o el grado del niño.';
  END IF;

  UPDATE public.ninos_checkins c SET salon_id = v_destino.id WHERE c.id = v_checkin.id;
  INSERT INTO public.ninos_checkin_movimientos (checkin_id, salon_origen_id, salon_destino_id, movido_por, motivo)
  VALUES (v_checkin.id, v_origen.id, v_destino.id, v_actor, v_motivo);

  SELECT count(*)::int INTO v_ocupacion FROM public.ninos_checkins c
   WHERE c.salon_id = v_destino.id AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL;

  RETURN jsonb_build_object(
    'checkin_id', v_checkin.id, 'nino_id', v_checkin.nino_id, 'codigo', v_checkin.codigo,
    'salon_origen_id', v_origen.id, 'salon_destino_id', v_destino.id, 'salon_destino', v_destino.nombre,
    'ocupacion', v_ocupacion, 'capacidad', v_destino.capacidad);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mover_salon(uuid, uuid, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mover_salon(uuid, uuid, date, uuid, text) TO authenticated;

-- ── 4. the salón the desk would use: the preferido only when it corresponds ──

CREATE OR REPLACE FUNCTION public.ninos_salon_esperado(p_nino_id uuid, p_campus_id uuid, p_fecha date)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH nino AS (
    SELECT f.salon_preferido_id, f.grado,
           coalesce(btrim(f.necesidades_especiales), '') <> '' AS necesidades,
           CASE WHEN u.fecha_nacimiento IS NULL OR u.fecha_nacimiento::date > p_fecha THEN NULL
                ELSE (extract(year FROM age(p_fecha, u.fecha_nacimiento::date)) * 12
                      + extract(month FROM age(p_fecha, u.fecha_nacimiento::date)))::int END AS meses
      FROM public.ninos_fichas f
      JOIN public.usuarios u ON u.id = f.usuario_id
     WHERE f.usuario_id = p_nino_id
  ), activos AS (
    SELECT s.* FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo
  ), por_edad AS (
    SELECT a.* FROM activos a, nino n
     WHERE a.area = 'waumba' AND NOT a.es_necesidades_especiales
       AND (a.edad_min_meses IS NOT NULL OR a.edad_max_meses IS NOT NULL)
       AND n.meses IS NOT NULL
       AND n.meses BETWEEN coalesce(a.edad_min_meses, 0) AND coalesce(a.edad_max_meses, 2147483647)
  )
  SELECT coalesce(
    (SELECT a.id FROM activos a, nino n
      WHERE a.id = n.salon_preferido_id AND public.ninos_salon_corresponde(p_nino_id, a.id, p_fecha)),
    (SELECT a.id FROM activos a, nino n
      WHERE n.necesidades AND EXISTS (SELECT 1 FROM por_edad)
        AND a.area = 'waumba' AND a.es_necesidades_especiales
      ORDER BY a.orden, a.nombre LIMIT 1),
    (SELECT a.id FROM activos a, nino n
      WHERE n.grado IS NOT NULL AND a.area = 'upstreet' AND (a.grado_min IS NOT NULL OR a.grado_max IS NOT NULL)
        AND n.grado BETWEEN coalesce(a.grado_min, 0) AND coalesce(a.grado_max, 12)
      ORDER BY a.orden, a.nombre LIMIT 1),
    (SELECT e.id FROM por_edad e ORDER BY e.orden, e.nombre LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_esperado(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
