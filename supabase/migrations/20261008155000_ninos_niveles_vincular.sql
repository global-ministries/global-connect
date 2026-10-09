-- Niños: the child's level (Waumba room or UpStreet grade) and linking an
-- existing under-13 child with no ficha and no parent
-- (odd/tasks/ninos-checkin.md, task N12).
--
-- 1. Level. The child form has one "Nivel" select: an UpStreet option keeps
--    storing ninos_fichas.grado; a Waumba option stores the chosen room as
--    ninos_fichas.salon_preferido_id (grado null). sugerirSalon and the
--    check-in already honor salon_preferido_id before age.
--    ninos_registrar_familia(jsonb) and ninos_actualizar_nino(uuid, jsonb)
--    (and through it ninos_crear_ficha) now accept hijo.salon_preferido_id:
--    an active room, or null. In an edit it is written only when the key is
--    sent. Same bodies as 20261008144000_ninos_salon_menu.sql otherwise.
--
-- 2. Linking. Some children already exist in usuarios (child volunteers from
--    Dream Team, people created by hand) with no ficha and no parent.
--    ninos_buscar_hijos_vincular(text, uuid) (new) finds people with a
--    KNOWN birth date under 13 (ninos_en_rango_edad) by exact cédula, by
--    full name, or by >= 3 characters of a first name AND a last name; at
--    most 10; only name, age and masked cédula. ninos_vincular_padre accepts
--    such a child (no ficha, no parent) when in range. Every other refusal
--    is unchanged. Authority stays ninos_puede_operar_algun_area.
--
-- Rollback: re-run the ninos_registrar_familia and ninos_actualizar_nino
-- bodies of 20261008144000_ninos_salon_menu.sql and the
-- ninos_vincular_padre body of 20261008152000_ninos_rango_edad.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_buscar_hijos_vincular(text, uuid);

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
  v_salon     uuid;
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

    -- Never reuse silently: an existing person with that cédula or phone must
    -- be confirmed by the anfitrión (ninos_buscar_padre) and sent as padre.id.
    IF public.ninos_padre_coincidencias(v_cedula, v_tel) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'padre_existente' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.usuarios (nombre, apellido, cedula, telefono, genero, estado_civil)
    VALUES (public.ninos_texto(v_padre_in, 'nombre'), public.ninos_texto(v_padre_in, 'apellido'),
            v_cedula, v_tel, (v_padre_in ->> 'genero')::public.enum_genero, 'No especificado')
    RETURNING id INTO v_padre;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_padre, v_campus, true);
    v_nuevo := true;
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
      v_salon := (v_hijo ->> 'salon_preferido_id')::uuid;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END;
    IF v_nac IS NULL OR v_nac > public.ninos_hoy() OR v_nac < public.ninos_hoy() - interval '18 years'
       OR (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado out of range';
    END IF;
    -- The level picked in the form: a Waumba room is stored as the preferred room.
    IF v_salon IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.id = v_salon AND s.activo) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: salon_preferido_id';
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
                                     puede_comer, cambio_panal, autoriza_imagen, escolarizado, es_vip_desde,
                                     salon_preferido_id)
    VALUES (v_nino, v_grado, public.ninos_texto(v_hijo, 'alergias'), public.ninos_texto(v_hijo, 'necesidades_especiales'),
            public.ninos_texto(v_hijo, 'habitos'), public.ninos_texto(v_hijo, 'notas'),
            (v_hijo ->> 'puede_comer')::boolean, (v_hijo ->> 'cambio_panal')::boolean,
            (v_hijo ->> 'autoriza_imagen')::boolean, (v_hijo ->> 'escolarizado')::boolean,
            CASE WHEN v_nuevo THEN public.ninos_hoy() END, v_salon);

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

CREATE OR REPLACE FUNCTION public.ninos_actualizar_nino(p_nino_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grado integer;
  v_nac   date;
  v_salon uuid;
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
    v_nac := (p ->> 'fecha_nacimiento')::date;
    v_salon := (p ->> 'salon_preferido_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6)
     OR (v_salon IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.id = v_salon AND s.activo)) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF (p ? 'nombre' AND public.ninos_texto(p, 'nombre') IS NULL)
     OR (p ? 'apellido' AND public.ninos_texto(p, 'apellido') IS NULL)
     OR (p ? 'genero' AND coalesce(p ->> 'genero', '') NOT IN ('Masculino', 'Femenino', 'Otro'))
     OR (p ? 'fecha_nacimiento' AND (v_nac IS NULL OR v_nac > public.ninos_hoy()
                                     OR v_nac < public.ninos_hoy() - interval '18 years')) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'nombre, apellido, fecha_nacimiento, genero';
  END IF;

  UPDATE public.usuarios u SET
    nombre = CASE WHEN p ? 'nombre' THEN public.ninos_texto(p, 'nombre') ELSE u.nombre END,
    apellido = CASE WHEN p ? 'apellido' THEN public.ninos_texto(p, 'apellido') ELSE u.apellido END,
    fecha_nacimiento = CASE WHEN p ? 'fecha_nacimiento' THEN v_nac ELSE u.fecha_nacimiento END,
    genero = CASE WHEN p ? 'genero' THEN (p ->> 'genero')::public.enum_genero ELSE u.genero END
  WHERE u.id = p_nino_id
    AND (p ? 'nombre' OR p ? 'apellido' OR p ? 'fecha_nacimiento' OR p ? 'genero');

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
    escolarizado = CASE WHEN p ? 'escolarizado' THEN (p ->> 'escolarizado')::boolean ELSE f.escolarizado END,
    salon_preferido_id = CASE WHEN p ? 'salon_preferido_id' THEN v_salon ELSE f.salon_preferido_id END
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

CREATE OR REPLACE FUNCTION public.ninos_vincular_padre(p_nino_ids uuid[], p_padre_id uuid, p_padre_nuevo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_padre  uuid := p_padre_id;
  v_nuevo  boolean := false;
  v_campus uuid;
  v_tel    text;
  v_cedula text;
  v_email  text;
  v_nino   uuid;
  v_count  integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR cardinality(p_nino_ids) = 0 OR array_position(p_nino_ids, NULL) IS NOT NULL
     OR (p_padre_id IS NULL) = (p_padre_nuevo IS NULL)
     OR (p_padre_nuevo IS NOT NULL AND jsonb_typeof(p_padre_nuevo) <> 'object') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'children and exactly one of padre id or new padre';
  END IF;

  -- Only children of the Niños module: a ficha, or a KNOWN birth date in the
  -- Niños age range (with or without a parent link yet: N12). Teens, adults
  -- and people without a birth date are never linked as children here.
  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = v_nino)
       AND NOT public.ninos_en_rango_edad((SELECT u.fecha_nacimiento::date FROM public.usuarios u WHERE u.id = v_nino)) THEN
      RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_padre IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_padre) THEN
      RAISE EXCEPTION 'padre_no_encontrado' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_tel := public.normalizar_telefono_ve(public.ninos_texto(p_padre_nuevo, 'telefono'));
    v_cedula := public.normalizar_cedula_ve(public.ninos_texto(p_padre_nuevo, 'cedula'));
    v_email := lower(public.ninos_texto(p_padre_nuevo, 'email'));
    IF public.ninos_texto(p_padre_nuevo, 'nombre') IS NULL OR public.ninos_texto(p_padre_nuevo, 'apellido') IS NULL
       OR v_tel IS NULL OR length(regexp_replace(v_tel, '\D', '', 'g')) < 7
       OR coalesce(p_padre_nuevo ->> 'genero', '') NOT IN ('Masculino', 'Femenino', 'Otro')
       OR (v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'padre: nombre, apellido, telefono, genero, email';
    END IF;
    -- Never reuse silently (same rule as ninos_registrar_familia).
    IF public.ninos_padre_coincidencias(v_cedula, v_tel) <> '[]'::jsonb
       OR (v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email)) THEN
      RAISE EXCEPTION 'padre_existente' USING ERRCODE = '23505';
    END IF;

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

    INSERT INTO public.usuarios (nombre, apellido, cedula, telefono, email, genero, estado_civil)
    VALUES (public.ninos_texto(p_padre_nuevo, 'nombre'), public.ninos_texto(p_padre_nuevo, 'apellido'),
            v_cedula, v_tel, v_email, (p_padre_nuevo ->> 'genero')::public.enum_genero, 'No especificado')
    RETURNING id INTO v_padre;
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
    VALUES (v_padre, v_campus, true);
    v_nuevo := true;
  END IF;

  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    -- No self link and no cycle: the parent cannot be the child's own child.
    IF v_nino = v_padre
       OR EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                   WHERE (r.usuario1_id = v_padre AND r.usuario2_id = v_nino AND r.tipo_relacion IN ('padre', 'tutor'))
                      OR (r.usuario1_id = v_nino AND r.usuario2_id = v_padre AND r.tipo_relacion = 'hijo')) THEN
      RAISE EXCEPTION 'vinculo_invalido' USING ERRCODE = '22023';
    END IF;
    -- Idempotent: an existing link in either direction is kept as is.
    IF NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                    WHERE (r.usuario1_id = v_nino AND r.usuario2_id = v_padre AND r.tipo_relacion IN ('padre', 'tutor'))
                       OR (r.usuario1_id = v_padre AND r.usuario2_id = v_nino AND r.tipo_relacion = 'hijo')) THEN
      INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
      VALUES (v_nino, v_padre, 'padre', false)
      ON CONFLICT (usuario1_id, usuario2_id, tipo_relacion) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('padre_id', v_padre, 'padre_nuevo', v_nuevo, 'vinculados', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.ninos_buscar_hijos_vincular(p_q text, p_padre_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q      text := lower(translate(regexp_replace(regexp_replace(btrim(coalesce(p_q, '')), '[%_\\]', '', 'g'), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_ced    text;
  v_tokens text[];
  v_nom    text;
  v_ape    text;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_ced := CASE WHEN length(v_digits) >= 5 THEN public.normalizar_cedula_ve(p_q) END;
  v_tokens := string_to_array(v_q, ' ');
  -- A name search needs at least 3 characters of a first name AND of a last name.
  IF cardinality(v_tokens) >= 2 AND length(v_tokens[1]) >= 3 AND length(v_tokens[cardinality(v_tokens)]) >= 3 THEN
    v_nom := v_tokens[1];
    v_ape := v_tokens[cardinality(v_tokens)];
  END IF;

  RETURN (
    WITH candidatos AS (
      SELECT u.id, u.nombre, u.apellido, u.cedula, u.fecha_nacimiento::date AS nac
        FROM public.usuarios u
       -- Only a KNOWN birth date under the Niños age limit: teens, adults and
       -- unknown ages are never offered as children.
       WHERE public.ninos_en_rango_edad(u.fecha_nacimiento::date)
         AND (p_padre_id IS NULL OR u.id <> p_padre_id)
         AND ((v_ced IS NOT NULL AND u.cedula = v_ced)
          OR lower(translate(u.nombre || ' ' || u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = v_q
          OR (v_nom IS NOT NULL
              AND lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_nom || '%'
              AND lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_ape || '%'))
         -- Already a child of this adult: nothing to link.
         AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                          WHERE (r.usuario1_id = u.id AND r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor'))
                             OR (r.usuario1_id = p_padre_id AND r.usuario2_id = u.id AND r.tipo_relacion = 'hijo'))
       ORDER BY u.apellido, u.nombre
       LIMIT 10
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'edad_anos', extract(year FROM age(public.ninos_hoy(), c.nac))::integer,
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_registrar_familia(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_registrar_familia(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) TO authenticated;
