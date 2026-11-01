-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: registration rules in the database (odd/tasks/ninos-v2.md, S6, task N4a).
--
-- 1. "Sí, guardarlo": the public pre-registration keeps the parent's género.
--    ninos_preregistro_crear stores the payload as given; it now refuses a
--    padre.genero other than 'Masculino', 'Femenino' or null/missing
--    (datos_invalidos, 22023), so a stored value is always one the desk can
--    confirm. Confirming (ninos_preregistro_resolver → ninos_registrar_familia)
--    already writes padre.genero to the new adult; null stays valid in the
--    stored request and the desk sets it before confirming.
-- 2. "También la base": a child outside the Niños age range
--    (ninos_en_rango_edad: known birth date, not in the future, under 13) is
--    refused with fuera_de_rango (22023), the code of ninos_crear_ficha.
--      * ninos_registrar_familia: replaces the old "up to 18 years" bound.
--        ninos_registrar_familia_mesa, ninos_preregistro_resolver and
--        ninos_preregistro_confirmar_cuenta register through it, so they
--        inherit the rule unchanged.
--      * ninos_preregistro_crear (4 arguments; the 3-argument form delegates).
--    ninos_mis_hijos_registrar, ninos_crear_ficha, ninos_vincular_padre and
--    ninos_vincular_revisando_edad already apply the same rule (unchanged).
--
-- Bodies copied from the latest definition, plus only the new checks:
--   ninos_registrar_familia  ← 20261011100000_ninos_familia_conyuge.sql
--   ninos_preregistro_crear  ← 20261026120000_ninos_precheck_qr.sql
-- Same signatures, definer flag, search_path and grants.
--
-- Rollback: re-run both function bodies from those two migrations.

-- ── 1. family registration at the desk ───────────────────────────────

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
  v_conyuge   uuid;
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
       OR coalesce(v_padre_in ->> 'genero', '') NOT IN ('Masculino', 'Femenino') THEN
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

  -- ── optional spouse as second parent (offered by the form, never automatic) ──
  -- Only a recorded spouse of an EXISTING adult; the client is never trusted.
  IF p ? 'conyuge_id' AND jsonb_typeof(p -> 'conyuge_id') <> 'null' THEN
    BEGIN
      v_conyuge := (p ->> 'conyuge_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'conyuge_invalido' USING ERRCODE = '22023';
    END;
    IF v_nuevo OR v_conyuge IS NULL OR v_conyuge = v_padre
       OR NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                       WHERE r.tipo_relacion = 'conyuge'
                         AND ((r.usuario1_id = v_padre AND r.usuario2_id = v_conyuge)
                           OR (r.usuario1_id = v_conyuge AND r.usuario2_id = v_padre))) THEN
      RAISE EXCEPTION 'conyuge_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ── children ──
  FOR v_hijo IN SELECT x FROM jsonb_array_elements(p -> 'hijos') AS t(x) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' OR public.ninos_texto(v_hijo, 'nombre') IS NULL
       OR public.ninos_texto(v_hijo, 'apellido') IS NULL
       OR coalesce(v_hijo ->> 'genero', '') NOT IN ('Masculino', 'Femenino') THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: nombre, apellido, genero';
    END IF;
    BEGIN
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
      v_grado := (v_hijo ->> 'grado')::integer;
      v_salon := (v_hijo ->> 'salon_preferido_id')::uuid;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END;
    IF v_nac IS NULL OR (v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado out of range';
    END IF;
    -- The Niños range (same rule as the form's enRangoNinos and ninos_crear_ficha).
    IF NOT public.ninos_en_rango_edad(v_nac) THEN
      RAISE EXCEPTION 'fuera_de_rango' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento outside the Niños age range';
    END IF;
    -- The level picked in the form: a Waumba room is stored as the preferred room.
    IF v_salon IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.id = v_salon AND s.activo) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: salon_preferido_id';
    END IF;

    -- A child already linked to the adult, or to the spouse being linked, is not duplicated.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.ninos_familia_hijos(v_padre)
                 || CASE WHEN v_conyuge IS NOT NULL
                         THEN coalesce(public.ninos_familia_hijos(v_conyuge), '[]'::jsonb)
                         ELSE '[]'::jsonb END) e(h)
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
    -- Same storage direction as the registering adult: the spouse is 'padre' of the child.
    IF v_conyuge IS NOT NULL THEN
      INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
      VALUES (v_nino, v_conyuge, 'padre', false);
    END IF;

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

  RETURN jsonb_build_object('padre_id', v_padre, 'padre_nuevo', v_nuevo, 'hijos', to_jsonb(v_hijos),
                            'conyuge_id', v_conyuge);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_registrar_familia(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_registrar_familia(jsonb) TO authenticated;

-- ── 2. public pre-registration (service_role only) ───────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_crear(p_campus_id uuid, p_payload jsonb, p_ip_hash text, p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id   uuid;
  v_hijo jsonb;
  v_nac  date;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload -> 'padre') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload -> 'hijos') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'hijos') NOT BETWEEN 1 AND 10
     OR octet_length(p_payload::text) > 32768
     OR (p_token_hash IS NOT NULL AND p_token_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  -- The parent's género is optional; when given, one the desk can confirm.
  IF jsonb_typeof(p_payload -> 'padre' -> 'genero') NOT IN ('null', 'string')
     OR coalesce(p_payload -> 'padre' ->> 'genero', 'Masculino') NOT IN ('Masculino', 'Femenino') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'padre: genero';
  END IF;
  -- Every child in the Niños range (same rule as the form and ninos_registrar_familia).
  FOR v_hijo IN SELECT x FROM jsonb_array_elements(p_payload -> 'hijos') AS t(x) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo';
    END IF;
    BEGIN
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento';
    END;
    IF v_nac IS NULL THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento';
    END IF;
    IF NOT public.ninos_en_rango_edad(v_nac) THEN
      RAISE EXCEPTION 'fuera_de_rango' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento outside the Niños age range';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo) THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_preregistro:' || coalesce(p_ip_hash, '-'), 0));
  IF (SELECT count(*) FROM public.ninos_preregistros r
       WHERE r.ip_hash = p_ip_hash AND r.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.ninos_preregistros r
          WHERE r.campus_id = p_campus_id AND r.created_at > now() - interval '1 hour') >= 200 THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  INSERT INTO public.ninos_preregistros (campus_id, payload, ip_hash, aviso_token_hash)
  VALUES (p_campus_id, p_payload, p_ip_hash, p_token_hash)
  RETURNING id INTO v_id;
  IF p_token_hash IS NULL THEN
    RETURN jsonb_build_object('estado', 'ok');
  END IF;
  RETURN jsonb_build_object('estado', 'ok', 'id', v_id,
                            'servicios', public.ninos_preregistro_servicios_hoy(p_campus_id));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text, text) TO service_role;
