-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: families — find, register, edit a child's ficha and pickup list
-- (odd/tasks/ninos-checkin.md, task N3).
--
-- What (all SECURITY DEFINER, search_path '', authority =
-- ninos_puede_operar_algun_area(): Anfitriones, area coordinators, the
-- Directora de Niños, admin and pastor):
--   1. ninos_registrar_familia(jsonb) — one call, one transaction:
--        parent (reused by normalized phone or cédula, never duplicated; or
--        an explicit padre.id to add children to a known parent), children
--        (usuarios + ninos_fichas), relaciones_usuarios and the authorized
--        pickup people (copied to every child of the call). A family whose
--        parent was created here is VIP (es_vip_desde = current_date).
--   2. ninos_buscar_familias(text) — parents by phone, cédula or name, and
--        the parents of children by name, each with their registered
--        children (ficha + pickup list). usuarios RLS hides other people
--        from a volunteer, hence a definer read.
--   3. ninos_actualizar_nino(uuid, jsonb) — updates the ficha and replaces
--        the active pickup list atomically.
--
-- Relationship convention (dream_team_registrar_persona, AgregarFamiliarModal):
-- usuario2 is the tipo_relacion of usuario1, so the child is usuario1, the
-- parent usuario2, tipo 'padre'. Reads also accept the reverse form
-- (parent usuario1, child usuario2, tipo 'hijo').
--
-- Errors raise a snake_case code as the message: sin_autoridad (42501),
-- datos_invalidos / padre_no_encontrado / sin_campus (22023),
-- hijo_ya_registrado (23505).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_actualizar_nino(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_buscar_familias(text);
--   DROP FUNCTION IF EXISTS public.ninos_registrar_familia(jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_familia_hijos(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_texto(jsonb, text);

-- Trimmed text field of a jsonb object; NULL when absent or blank.
CREATE OR REPLACE FUNCTION public.ninos_texto(p jsonb, p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT nullif(btrim(p ->> p_key), '');
$$;
REVOKE ALL ON FUNCTION public.ninos_texto(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_texto(jsonb, text) TO authenticated;

-- The registered children of a parent (both relationship directions) with
-- their ficha and active pickup list, as a jsonb array. Internal: no grant.
CREATE OR REPLACE FUNCTION public.ninos_familia_hijos(p_padre_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento::date, 'genero', u.genero,
           'grado', f.grado, 'alergias', f.alergias, 'necesidades_especiales', f.necesidades_especiales,
           'habitos', f.habitos, 'notas', f.notas, 'puede_comer', f.puede_comer,
           'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen,
           'escolarizado', f.escolarizado, 'salon_preferido_id', f.salon_preferido_id,
           'es_vip_desde', f.es_vip_desde,
           'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'id', a.id, 'nombre', a.nombre, 'telefono', a.telefono, 'relacion', a.relacion)
                              ORDER BY a.created_at), '[]'::jsonb)
                             FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo))
           ORDER BY u.fecha_nacimiento, u.nombre), '[]'::jsonb)
  FROM public.usuarios u
  JOIN public.ninos_fichas f ON f.usuario_id = u.id
  WHERE u.id IN (
    SELECT r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor')
    UNION
    SELECT r.usuario2_id FROM public.relaciones_usuarios r
     WHERE r.usuario1_id = p_padre_id AND r.tipo_relacion = 'hijo'
  );
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_hijos(uuid) FROM PUBLIC, anon, authenticated;

-- ── register ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_registrar_familia(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor     uuid := public.ninos_usuario_actual();
  v_padre_in  jsonb := p -> 'padre';
  v_padre     uuid;
  v_nuevo     boolean := false;
  v_campus    uuid;
  v_tel       text;
  v_cedula    text;
  v_hijo      jsonb;
  v_aut       jsonb;
  v_nino      uuid;
  v_hijos     uuid[] := '{}';
  v_grado     integer;
  v_nac       date;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR jsonb_typeof(v_padre_in) <> 'object'
     OR jsonb_typeof(p -> 'hijos') <> 'array' OR jsonb_array_length(p -> 'hijos') = 0
     OR (p ? 'autorizados' AND jsonb_typeof(p -> 'autorizados') <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'padre object and non-empty hijos array required';
  END IF;

  -- Campus for new people: the campus of a room the caller operates
  -- (the caller's principal campus first).
  SELECT s.campus_id INTO v_campus
    FROM public.ninos_salones s
   WHERE s.activo AND public.ninos_puede_operar(s.equipo_id)
   ORDER BY EXISTS (SELECT 1 FROM public.usuario_campus uc
                     WHERE uc.usuario_id = v_actor AND uc.campus_id = s.campus_id AND uc.es_campus_principal) DESC,
            s.orden
   LIMIT 1;
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END IF;

  -- ── parent ──
  IF public.ninos_texto(v_padre_in, 'id') IS NOT NULL THEN
    BEGIN
      v_padre := (v_padre_in ->> 'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'padre_no_encontrado' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_padre) THEN
      RAISE EXCEPTION 'padre_no_encontrado' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_tel := public.normalizar_telefono_ve(public.ninos_texto(v_padre_in, 'telefono'));
    v_cedula := public.normalizar_cedula_ve(public.ninos_texto(v_padre_in, 'cedula'));
    IF public.ninos_texto(v_padre_in, 'nombre') IS NULL OR public.ninos_texto(v_padre_in, 'apellido') IS NULL
       OR v_tel IS NULL OR length(regexp_replace(v_tel, '\D', '', 'g')) < 7
       OR coalesce(v_padre_in ->> 'genero', '') NOT IN ('Masculino', 'Femenino', 'Otro') THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'padre: nombre, apellido, telefono, genero';
    END IF;

    -- Never duplicate: cédula first, then phone.
    IF v_cedula IS NOT NULL THEN
      SELECT u.id INTO v_padre FROM public.usuarios u WHERE u.cedula = v_cedula
       ORDER BY u.fecha_registro LIMIT 1;
    END IF;
    IF v_padre IS NULL THEN
      SELECT u.id INTO v_padre FROM public.usuarios u WHERE regexp_replace(u.telefono, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g')
       ORDER BY u.fecha_registro LIMIT 1;
    END IF;

    IF v_padre IS NULL THEN
      INSERT INTO public.usuarios (nombre, apellido, cedula, telefono, genero, estado_civil)
      VALUES (public.ninos_texto(v_padre_in, 'nombre'), public.ninos_texto(v_padre_in, 'apellido'),
              v_cedula, v_tel, (v_padre_in ->> 'genero')::public.enum_genero, 'No especificado')
      RETURNING id INTO v_padre;
      INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
      VALUES (v_padre, v_campus, true);
      v_nuevo := true;
    END IF;
  END IF;

  -- ── children ──
  FOR v_hijo IN SELECT x FROM jsonb_array_elements(p -> 'hijos') AS t(x) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' OR public.ninos_texto(v_hijo, 'nombre') IS NULL
       OR public.ninos_texto(v_hijo, 'apellido') IS NULL
       OR coalesce(v_hijo ->> 'genero', '') NOT IN ('Masculino', 'Femenino', 'Otro') THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: nombre, apellido, genero';
    END IF;
    BEGIN
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
      v_grado := (v_hijo ->> 'grado')::integer;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END;
    IF v_nac IS NULL OR v_nac > current_date OR v_nac < current_date - interval '18 years'
       OR (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado out of range';
    END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.ninos_familia_hijos(v_padre)) e(h)
                WHERE (e.h ->> 'fecha_nacimiento')::date = v_nac
                  AND public.dream_team_clave_nombre(e.h ->> 'nombre', e.h ->> 'apellido')
                    = public.dream_team_clave_nombre(public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'))) THEN
      RAISE EXCEPTION 'hijo_ya_registrado' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.usuarios (nombre, apellido, genero, estado_civil, fecha_nacimiento)
    VALUES (public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'),
            (v_hijo ->> 'genero')::public.enum_genero, 'No especificado', v_nac)
    RETURNING id INTO v_nino;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_nino, v_campus, true);
    INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
    VALUES (v_nino, v_padre, 'padre', true);

    INSERT INTO public.ninos_fichas (usuario_id, grado, alergias, necesidades_especiales, habitos, notas,
                                     puede_comer, cambio_panal, autoriza_imagen, escolarizado, es_vip_desde)
    VALUES (v_nino, v_grado, public.ninos_texto(v_hijo, 'alergias'), public.ninos_texto(v_hijo, 'necesidades_especiales'),
            public.ninos_texto(v_hijo, 'habitos'), public.ninos_texto(v_hijo, 'notas'),
            (v_hijo ->> 'puede_comer')::boolean, (v_hijo ->> 'cambio_panal')::boolean,
            (v_hijo ->> 'autoriza_imagen')::boolean, (v_hijo ->> 'escolarizado')::boolean,
            CASE WHEN v_nuevo THEN current_date END);

    v_hijos := v_hijos || v_nino;
  END LOOP;

  -- ── authorized pickup people (for every child of this call) ──
  FOR v_aut IN SELECT x FROM jsonb_array_elements(coalesce(p -> 'autorizados', '[]'::jsonb)) AS t(x) LOOP
    IF jsonb_typeof(v_aut) <> 'object' OR public.ninos_texto(v_aut, 'nombre') IS NULL THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'autorizado: nombre';
    END IF;
    INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion)
    SELECT h, public.ninos_texto(v_aut, 'nombre'), public.ninos_texto(v_aut, 'telefono'), public.ninos_texto(v_aut, 'relacion')
      FROM unnest(v_hijos) AS h;
  END LOOP;

  RETURN jsonb_build_object('padre_id', v_padre, 'padre_nuevo', v_nuevo, 'hijos', to_jsonb(v_hijos));
END;
$$;

COMMENT ON FUNCTION public.ninos_registrar_familia(jsonb) IS
  'N3: registers a family atomically (parent reused by phone or cédula, children with ficha, '
  'relaciones_usuarios child→padre, pickup list). New parent ⇒ VIP. Authority: ninos_puede_operar_algun_area.';

-- ── search ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_buscar_familias(p_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q      text := btrim(coalesce(p_q, ''));
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_tel    text;
  v_ced    text;
  v_like   text;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_tel := CASE WHEN length(v_digits) >= 7 THEN public.normalizar_telefono_ve(v_q) END;
  v_ced := CASE WHEN length(v_digits) >= 5 THEN public.normalizar_cedula_ve(v_q) END;
  v_like := '%' || lower(translate(v_q, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) || '%';

  RETURN (
    WITH hijos AS (
      SELECT f.usuario_id AS id FROM public.ninos_fichas f
    ), padres_de_hijos AS (
      SELECT r.usuario2_id AS padre, r.usuario1_id AS hijo FROM public.relaciones_usuarios r
       WHERE r.tipo_relacion IN ('padre', 'tutor') AND r.usuario1_id IN (SELECT id FROM hijos)
      UNION
      SELECT r.usuario1_id, r.usuario2_id FROM public.relaciones_usuarios r
       WHERE r.tipo_relacion = 'hijo' AND r.usuario2_id IN (SELECT id FROM hijos)
    ), coincidencias AS (
      SELECT DISTINCT ph.padre
      FROM padres_de_hijos ph
      JOIN public.usuarios pa ON pa.id = ph.padre
      JOIN public.usuarios hi ON hi.id = ph.hijo
      WHERE (v_tel IS NOT NULL AND regexp_replace(pa.telefono, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g'))
         OR (v_ced IS NOT NULL AND pa.cedula = v_ced)
         OR lower(translate(pa.nombre || ' ' || pa.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like
         OR lower(translate(hi.nombre || ' ' || hi.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like
      LIMIT 20
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'telefono', u.telefono,
             'cedula', u.cedula, 'hijos', public.ninos_familia_hijos(u.id))
             ORDER BY u.apellido, u.nombre), '[]'::jsonb)
    FROM coincidencias c JOIN public.usuarios u ON u.id = c.padre
  );
END;
$$;

-- ── edit a child ─────────────────────────────────────────────────────

-- p = { ficha fields..., autorizados: [{nombre, telefono, relacion}] }.
-- Ficha keys present in p are written; autorizados, when present, replaces
-- the active list (old rows are deactivated, never deleted).
CREATE OR REPLACE FUNCTION public.ninos_actualizar_nino(p_nino_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grado integer;
  v_aut   jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object'
     OR (p ? 'autorizados' AND jsonb_typeof(p -> 'autorizados') <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_grado := (p ->> 'grado')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ninos_fichas f SET
    grado = CASE WHEN p ? 'grado' THEN v_grado ELSE f.grado END,
    alergias = CASE WHEN p ? 'alergias' THEN public.ninos_texto(p, 'alergias') ELSE f.alergias END,
    necesidades_especiales = CASE WHEN p ? 'necesidades_especiales'
                                  THEN public.ninos_texto(p, 'necesidades_especiales') ELSE f.necesidades_especiales END,
    habitos = CASE WHEN p ? 'habitos' THEN public.ninos_texto(p, 'habitos') ELSE f.habitos END,
    notas = CASE WHEN p ? 'notas' THEN public.ninos_texto(p, 'notas') ELSE f.notas END,
    puede_comer = CASE WHEN p ? 'puede_comer' THEN (p ->> 'puede_comer')::boolean ELSE f.puede_comer END,
    cambio_panal = CASE WHEN p ? 'cambio_panal' THEN (p ->> 'cambio_panal')::boolean ELSE f.cambio_panal END,
    autoriza_imagen = CASE WHEN p ? 'autoriza_imagen' THEN (p ->> 'autoriza_imagen')::boolean ELSE f.autoriza_imagen END,
    escolarizado = CASE WHEN p ? 'escolarizado' THEN (p ->> 'escolarizado')::boolean ELSE f.escolarizado END
  WHERE f.usuario_id = p_nino_id;

  IF p ? 'autorizados' THEN
    UPDATE public.ninos_autorizados_retiro a SET activo = false WHERE a.nino_id = p_nino_id AND a.activo;
    FOR v_aut IN SELECT x FROM jsonb_array_elements(p -> 'autorizados') AS t(x) LOOP
      IF jsonb_typeof(v_aut) <> 'object' OR public.ninos_texto(v_aut, 'nombre') IS NULL THEN
        RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'autorizado: nombre';
      END IF;
      INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion)
      VALUES (p_nino_id, public.ninos_texto(v_aut, 'nombre'), public.ninos_texto(v_aut, 'telefono'),
              public.ninos_texto(v_aut, 'relacion'));
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_registrar_familia(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_buscar_familias(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_registrar_familia(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_familias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) TO authenticated;
