-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: the salón's Esperados / Aquí / Retirados, moving a child to another
-- salón in one step and «Llegó» from the salón
-- (odd/tasks/ninos-checkin-pco.md, T2b, S6, S9.4; artboard
-- design/ninos-checkin-pco/06-salon-celular.html).
--
-- Why: ninos_lista_salon only lists the children inside (salida_at IS NULL);
-- the salón also needs who is expected and who already left. A child changed
-- salón only by a new check-in (salon_id has no UPDATE grant). S9.4: "Sí,
-- desde el salón, y queda registrado" — the salón checks in a child
-- pre-registered for it. Who sees the salón screen (coordinators, Líderes,
-- Anfitriones: ninos_puede_ver_salon) is not always an Anfitrión, so they may
-- lack ninos_puede_operar and cannot use ninos_checkin. L32: "queda solo para
-- coordinadores, líderes y anfitriones como hoy" — a volunteer who only has
-- the salón assigned in the planilla gets neither the screen nor «Llegó».
--
-- What:
--   1. ninos_checkins.entrada_desde_salon (boolean, default false): the
--      check-in was made from the salón (audit). Readable like the rest of the
--      row; nobody writes ninos_checkins directly.
--   2. ninos_checkin_movimientos (checkin, salón origen, salón destino,
--      movido_por, movido_at, motivo ≤ 300). RLS on, no privileges for anon or
--      authenticated: written by ninos_mover_salon, read through
--      ninos_salon_estado.
--   3. ninos_salon_esperado(niño, campus, fecha), internal: the salón the desk
--      would use for the child — the preferred salón (ficha) when active and of
--      the campus, else the suggestion of salonParaHijo / sugerirSalon
--      (lib/platform/ninos/familias-vista.ts, sugerir-salon.ts) without the
--      salón rules, as the desk calls it today: special needs → the Waumba
--      special-needs salón when the age fits a Waumba salón, then the grade →
--      UpStreet, then the age in months on the service date → Waumba; ties by
--      orden. Keep both in step.
--   4. ninos_salon_estado(salón, turno, fecha) → jsonb, read-only. Authority
--      as ninos_lista_salon (ninos_puede_ver_salon). Aquí stays in
--      ninos_lista_salon, unchanged. Returns:
--        esperados   today's pending pre-checks of that turno inside its
--                    window (what the desk lists as «Llegando»), not checked
--                    in, whose salón (3) is this one; with who sent the notice
--                    and the alerts. Family pre-registrations by QR have no
--                    child yet, so they are not here.
--        retirados   this salón's check-ins of the service already out, with
--                    salida_at and retirado_por_nombre.
--        movimientos moves into or out of this salón for the service.
--        destinos    when the caller operates this salón: the other active
--                    salones of the campus the caller also operates, with
--                    their children inside and capacity.
--        puede_operar (move, pick up) and puede_llegar («Llegó»: whoever
--        sees the salón, so always true for a caller who got the answer).
--   5. ninos_mover_salon(niño, turno, fecha, salón destino, motivo NULL) →
--      jsonb: moves the open check-in; same row, code and visit. The child
--      must be inside; the destination active, of the same campus and not the
--      same salón; the caller ninos_puede_operar on both salones' equipos.
--      One audit row. A full destination is not refused (S9.1: warn, never
--      block); the answer carries the occupancy.
--   6. ninos_checkin_desde_salon(niño, salón, turno, fecha) → jsonb: checks
--      in one child with a pending pre-check of that turno for today, inside
--      the window, whose salón (3) is this one. Caller: ninos_puede_ver_salon
--      on the salón's equipo (L32; the same authority as reading the salón). The code is issued as
--      ninos_checkin does (same advisory lock, 4 digits, unique among the
--      open check-ins of campus + fecha + turno); one new visit. It records
--      entrada_por and entrada_desde_salon. The existing trigger marks the
--      pre-check 'ingresado', which is what the parent's phone reads
--      (ninos_mis_prechecks) for desk check-ins too.
--
-- Errors: the message is a short code (42501 sin_autoridad; 23505
-- ya_ingresado; 22023 for the rest) and the HINT a Spanish sentence the
-- screens show as is.
--
-- Every function runs with definer rights and search_path ''.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_checkin_desde_salon(uuid, uuid, uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_mover_salon(uuid, uuid, date, uuid, text);
--   DROP FUNCTION IF EXISTS public.ninos_salon_estado(uuid, uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_salon_esperado(uuid, uuid, date);
--   DROP TABLE IF EXISTS public.ninos_checkin_movimientos;
--   then remove the column ninos_checkins.entrada_desde_salon (ALTER TABLE).

-- ── 1. check-in from the salón ───────────────────────────────────────

ALTER TABLE public.ninos_checkins
  ADD COLUMN IF NOT EXISTS entrada_desde_salon boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.ninos_checkins.entrada_desde_salon IS
  'The check-in was made from the salón (ninos_checkin_desde_salon), not at the desk.';

-- ── 2. moves ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_checkin_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.ninos_checkins(id) ON DELETE CASCADE,
  salon_origen_id uuid NOT NULL REFERENCES public.ninos_salones(id),
  salon_destino_id uuid NOT NULL REFERENCES public.ninos_salones(id),
  movido_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  movido_at timestamptz NOT NULL DEFAULT now(),
  motivo text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  CHECK (salon_origen_id <> salon_destino_id)
);
CREATE INDEX IF NOT EXISTS ninos_checkin_movimientos_checkin_idx ON public.ninos_checkin_movimientos (checkin_id);
COMMENT ON TABLE public.ninos_checkin_movimientos IS
  'A child moved between salones during a service. Written only by ninos_mover_salon.';

ALTER TABLE public.ninos_checkin_movimientos ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_checkin_movimientos FROM PUBLIC, anon, authenticated;

-- ── 3. the salón the desk would use ──────────────────────────────────

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
    (SELECT a.id FROM activos a, nino n WHERE a.id = n.salon_preferido_id),
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

-- ── 4. the salón's lists ─────────────────────────────────────────────

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
  END IF;

  RETURN jsonb_build_object(
    'salon_id', v_salon.id, 'puede_operar', v_operar, 'puede_llegar', v_llegar,
    'esperados', v_esperados, 'retirados', v_retirados, 'movimientos', v_movimientos, 'destinos', v_destinos);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_estado(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_salon_estado(uuid, uuid, date) TO authenticated;

-- ── 5. move to another salón ─────────────────────────────────────────

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

-- ── 6. «Llegó» from the salón ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_checkin_desde_salon(
  p_nino_id uuid,
  p_salon_id uuid,
  p_turno_id uuid,
  p_fecha date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_salon public.ninos_salones%ROWTYPE;
  v_visita uuid := gen_random_uuid();
  v_codigo text;
  v_intentos integer := 0;
  v_id uuid;
BEGIN
  SELECT s.* INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_id;
  IF v_actor IS NULL OR NOT FOUND
     OR NOT public.ninos_puede_ver_salon(v_salon.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Solo la coordinación, los líderes y los anfitriones de este salón pueden registrar aquí su llegada.';
  END IF;
  IF NOT v_salon.activo THEN
    RAISE EXCEPTION 'salon_invalido' USING ERRCODE = '22023',
      HINT = 'El salón está desactivado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t
                  WHERE t.id = p_turno_id AND t.activo AND t.campus_id = v_salon.campus_id) THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
      HINT = 'El horario no es de este campus o está inactivo.';
  END IF;
  IF p_fecha IS DISTINCT FROM public.ninos_hoy() OR NOT public.ninos_precheck_en_ventana(p_turno_id) THEN
    RAISE EXCEPTION 'fuera_de_horario' USING ERRCODE = '22023',
      HINT = 'El check-in de este horario no está abierto ahora.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ninos_checkins c
              WHERE c.nino_id = p_nino_id AND c.turno_id = p_turno_id AND c.fecha = p_fecha) THEN
    RAISE EXCEPTION 'ya_ingresado' USING ERRCODE = '23505',
      HINT = 'El niño ya ingresó en este servicio.';
  END IF;
  PERFORM 1 FROM public.ninos_prechecks p
   WHERE p.nino_id = p_nino_id AND p.turno_id = p_turno_id AND p.fecha = p_fecha AND p.estado = 'pendiente'
   FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id) THEN
    RAISE EXCEPTION 'sin_precheck' USING ERRCODE = '22023',
      HINT = 'Este niño no avisó que venía a este servicio. Regístralo en la mesa.';
  END IF;
  IF public.ninos_salon_esperado(p_nino_id, v_salon.campus_id, p_fecha) IS DISTINCT FROM p_salon_id THEN
    RAISE EXCEPTION 'otro_salon' USING ERRCODE = '22023',
      HINT = 'Este niño está esperado en otro salón.';
  END IF;

  -- The code as ninos_checkin issues it: same lock, so desk and salón never share an open code.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_checkin:' || v_salon.campus_id || ':' || p_fecha || ':' || p_turno_id, 0));
  LOOP
    v_codigo := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ninos_checkins c
      WHERE c.campus_id = v_salon.campus_id AND c.fecha = p_fecha AND c.turno_id = p_turno_id
        AND c.codigo = v_codigo AND c.salida_at IS NULL);
    v_intentos := v_intentos + 1;
    IF v_intentos > 200 THEN
      RAISE EXCEPTION 'sin_codigo' USING ERRCODE = '53000',
        HINT = 'No quedan códigos libres en este horario. Avisa a la mesa.';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por,
                                       entrada_desde_salon)
    VALUES (p_nino_id, p_salon_id, p_turno_id, v_salon.campus_id, p_fecha, v_visita, v_codigo, v_actor, true)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ya_ingresado' USING ERRCODE = '23505',
      HINT = 'El niño ya ingresó en este servicio.';
  END;

  RETURN jsonb_build_object(
    'checkin_id', v_id, 'nino_id', p_nino_id, 'salon_id', p_salon_id, 'codigo', v_codigo, 'visita_id', v_visita);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkin_desde_salon(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkin_desde_salon(uuid, uuid, uuid, date) TO authenticated;
