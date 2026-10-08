-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: room list, check-out lookup, menu flags and the Caracas date
-- (odd/tasks/ninos-checkin.md, tasks N5 and N6 plus fixes).
--
-- What (all SECURITY DEFINER, search_path ''):
--   1. ninos_hoy() — today's date in America/Caracas. The database runs in
--      UTC, so current_date flips to tomorrow at 20:00 local time.
--   2. ninos_puede_ver_algun_salon() — the caller may see at least one active
--      room (sidebar flag for "Salones").
--   3. ninos_lista_salon(salon, fecha, turno) recreated with the child's
--      grade. The return type changes, so it is dropped and created again
--      (CREATE OR REPLACE cannot change OUT columns). Same authority.
--   4. ninos_buscar_codigo(codigo, turno, fecha) — the check-ins carrying a
--      code in that service (open and already out), with the room, the
--      check-out data and the child's active pickup people. Only rooms the
--      caller may operate (ninos_puede_operar).
--   5. ninos_registrar_familia / ninos_actualizar_nino replaced: identical to
--      20261008143000 except current_date → ninos_hoy().
--
-- Rollback: re-run the function bodies of 20261008143000 and the
-- ninos_lista_salon body of 20261008140000 (after dropping this one), then
--   DROP FUNCTION IF EXISTS public.ninos_buscar_codigo(text, uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_puede_ver_algun_salon();
--   DROP FUNCTION IF EXISTS public.ninos_hoy();

-- ── 1. today in Caracas ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_hoy()
RETURNS date
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT (now() AT TIME ZONE 'America/Caracas')::date;
$$;
REVOKE ALL ON FUNCTION public.ninos_hoy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_hoy() TO authenticated;

-- ── 2. menu flag ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_puede_ver_algun_salon()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s WHERE s.activo) a
    WHERE public.ninos_puede_ver_salon(a.equipo_id)
  );
$$;
REVOKE ALL ON FUNCTION public.ninos_puede_ver_algun_salon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_puede_ver_algun_salon() TO authenticated;

-- ── 3. room list with grade ──────────────────────────────────────────

DROP FUNCTION IF EXISTS public.ninos_lista_salon(uuid, date, uuid);
CREATE FUNCTION public.ninos_lista_salon(p_salon_id uuid, p_fecha date, p_turno_id uuid)
RETURNS TABLE (nino_id uuid, nombre text, apellido text, fecha_nacimiento date, grado integer, codigo text,
               entrada_at timestamptz, alergias text, necesidades_especiales text, habitos text,
               puede_comer boolean, cambio_panal boolean, autoriza_imagen boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ninos_salones s
                 WHERE s.id = p_salon_id AND public.ninos_puede_ver_salon(s.equipo_id)) THEN
    RAISE EXCEPTION 'not allowed to read this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.nino_id, u.nombre, u.apellido, u.fecha_nacimiento::date, f.grado, c.codigo, c.entrada_at,
         f.alergias, f.necesidades_especiales, f.habitos, f.puede_comer, f.cambio_panal, f.autoriza_imagen
  FROM public.ninos_checkins c
  JOIN public.usuarios u ON u.id = c.nino_id
  LEFT JOIN public.ninos_fichas f ON f.usuario_id = c.nino_id
  WHERE c.salon_id = p_salon_id AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL
  ORDER BY u.apellido, u.nombre;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_lista_salon(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_lista_salon(uuid, date, uuid) TO authenticated;

-- ── 4. check-out lookup by code ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_buscar_codigo(p_codigo text, p_turno_id uuid, p_fecha date)
RETURNS TABLE (checkin_id uuid, nino_id uuid, nombre text, apellido text, salon_id uuid, salon text,
               entrada_at timestamptz, salida_at timestamptz, retirado_por_nombre text, autorizados jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.nino_id, u.nombre, u.apellido, s.id, s.nombre, c.entrada_at, c.salida_at, c.retirado_por_nombre,
         coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', a.nombre, 'telefono', a.telefono,
                                                       'relacion', a.relacion) ORDER BY a.created_at)
                     FROM public.ninos_autorizados_retiro a
                    WHERE a.nino_id = c.nino_id AND a.activo), '[]'::jsonb)
  FROM public.ninos_checkins c
  JOIN public.ninos_salones s ON s.id = c.salon_id
  JOIN public.usuarios u ON u.id = c.nino_id
  WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha
    AND public.ninos_puede_operar(s.equipo_id)
  ORDER BY c.salida_at IS NOT NULL, c.entrada_at DESC, u.apellido, u.nombre;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_buscar_codigo(text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_codigo(text, uuid, date) TO authenticated;

-- ── 5. Caracas date in the family RPCs ───────────────────────────────

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
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijo: fecha_nacimiento or grado';
    END;
    IF v_nac IS NULL OR v_nac > public.ninos_hoy() OR v_nac < public.ninos_hoy() - interval '18 years'
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
            CASE WHEN v_nuevo THEN public.ninos_hoy() END);

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
  'N3/N4: registers a family atomically. A parent is reused only through an explicit padre.id '
  '(confirmed via ninos_buscar_padre); new-parent data matching a cédula or phone raises padre_existente. '
  'Authority: ninos_puede_operar_algun_area.';

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
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF v_grado IS NOT NULL AND v_grado NOT BETWEEN 0 AND 6 THEN
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
REVOKE ALL ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_registrar_familia(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_actualizar_nino(uuid, jsonb) TO authenticated;
