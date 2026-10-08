-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: age range for linked children without a ficha
-- (odd/tasks/ninos-checkin.md, task N10 correction).
--
-- Being somebody's hijo does not make a person a Niños child: teens,
-- university students and married adults are hijos too. A linked person
-- without a ninos_fichas row now counts only when the birth date is KNOWN and
-- under ninos_edad_maxima_anos() years (13: UpStreet ends at 6th grade).
-- The limit is measured on ninos_hoy(); the search has no service date.
--
-- What (definer functions with an empty search path; same authority):
--   1. ninos_edad_maxima_anos() / ninos_en_rango_edad(date): the single
--      source of the limit (TS mirror: EDAD_MAXIMA_NINOS_ANOS in
--      lib/platform/ninos/familia.ts).
--   2. ninos_familia_hijos and ninos_buscar_familias: unknown birth date or
--      out of range and no ficha ⇒ not shown.
--   3. ninos_crear_ficha: refuses a child out of range or with no known birth
--      date (fuera_de_rango, 22023). The form's birth date wins over the
--      stored one.
--   4. ninos_vincular_padre: a child without ficha must be in range too.
--
-- Rollback: re-run the four function bodies of
-- 20261008151000_ninos_vinculos_familia.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_en_rango_edad(date);
--   DROP FUNCTION IF EXISTS public.ninos_edad_maxima_anos();

CREATE OR REPLACE FUNCTION public.ninos_edad_maxima_anos()
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT 13;
$$;
REVOKE ALL ON FUNCTION public.ninos_edad_maxima_anos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_edad_maxima_anos() TO authenticated;

-- True for a known birth date, not in the future, under the age limit today.
CREATE OR REPLACE FUNCTION public.ninos_en_rango_edad(p_fecha_nacimiento date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT p_fecha_nacimiento IS NOT NULL
     AND p_fecha_nacimiento <= public.ninos_hoy()
     AND p_fecha_nacimiento > public.ninos_hoy() - make_interval(years => public.ninos_edad_maxima_anos());
$$;
REVOKE ALL ON FUNCTION public.ninos_en_rango_edad(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_en_rango_edad(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.ninos_familia_hijos(p_padre_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
           'fecha_nacimiento', u.fecha_nacimiento::date, 'genero', u.genero,
           'tiene_ficha', f.usuario_id IS NOT NULL,
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
  LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
  WHERE u.id IN (
    SELECT r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor')
    UNION
    SELECT r.usuario2_id FROM public.relaciones_usuarios r
     WHERE r.usuario1_id = p_padre_id AND r.tipo_relacion = 'hijo'
  )
  AND (f.usuario_id IS NOT NULL OR public.ninos_en_rango_edad(u.fecha_nacimiento::date));
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_hijos(uuid) FROM PUBLIC, anon, authenticated;

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
    WITH padres_de_hijos AS (
      SELECT r.usuario2_id AS padre, r.usuario1_id AS hijo FROM public.relaciones_usuarios r
       WHERE r.tipo_relacion IN ('padre', 'tutor')
      UNION
      SELECT r.usuario1_id, r.usuario2_id FROM public.relaciones_usuarios r
       WHERE r.tipo_relacion = 'hijo'
    ), coincidencias AS (
      SELECT DISTINCT ph.padre
      FROM padres_de_hijos ph
      JOIN public.usuarios pa ON pa.id = ph.padre
      JOIN public.usuarios hi ON hi.id = ph.hijo
      LEFT JOIN public.ninos_fichas f ON f.usuario_id = hi.id
      WHERE (f.usuario_id IS NOT NULL OR public.ninos_en_rango_edad(hi.fecha_nacimiento::date))
        AND ((v_tel IS NOT NULL AND regexp_replace(pa.telefono, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g'))
         OR (v_ced IS NOT NULL AND pa.cedula = v_ced)
         OR lower(translate(pa.nombre || ' ' || pa.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like
         OR lower(translate(hi.nombre || ' ' || hi.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like)
      LIMIT 20
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'telefono', u.telefono,
             'cedula', u.cedula, 'hijos', public.ninos_familia_hijos(u.id),
             'padres', public.ninos_familia_padres(u.id))
             ORDER BY u.apellido, u.nombre), '[]'::jsonb)
    FROM coincidencias c JOIN public.usuarios u ON u.id = c.padre
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ninos_crear_ficha(p_nino_id uuid, p_ficha jsonb, p_autorizados jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nac date;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF (p_ficha IS NOT NULL AND jsonb_typeof(p_ficha) <> 'object')
     OR (p_autorizados IS NOT NULL AND jsonb_typeof(p_autorizados) <> 'array') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_id) THEN
    RAISE EXCEPTION 'ficha_existente' USING ERRCODE = '23505';
  END IF;
  IF NOT public.ninos_es_hijo_vinculado(p_nino_id) THEN
    RAISE EXCEPTION 'sin_padre' USING ERRCODE = '22023';
  END IF;

  -- Only children in the Niños age range: the birth date sent in the form,
  -- else the one on file. Unknown ⇒ refused.
  BEGIN
    v_nac := coalesce((p_ficha ->> 'fecha_nacimiento')::date,
                      (SELECT u.fecha_nacimiento::date FROM public.usuarios u WHERE u.id = p_nino_id));
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END;
  IF NOT public.ninos_en_rango_edad(v_nac) THEN
    RAISE EXCEPTION 'fuera_de_rango' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ninos_fichas (usuario_id) VALUES (p_nino_id);
  -- Same validation and writes as an edit; any error rolls back the insert.
  PERFORM public.ninos_actualizar_nino(p_nino_id,
    coalesce(p_ficha, '{}'::jsonb) - 'autorizados'
      || jsonb_build_object('autorizados', coalesce(p_autorizados, '[]'::jsonb)));
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

  -- Only children of the Niños module: a ficha, or a parent link and an
  -- age in the Niños range.
  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = v_nino)
       AND NOT (public.ninos_es_hijo_vinculado(v_nino)
                AND public.ninos_en_rango_edad((SELECT u.fecha_nacimiento::date FROM public.usuarios u WHERE u.id = v_nino))) THEN
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

REVOKE ALL ON FUNCTION public.ninos_buscar_familias(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_familias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) TO authenticated;
