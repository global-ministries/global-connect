-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: complete the ficha of an already-linked child and link a second
-- parent (odd/tasks/ninos-checkin.md, task N10).
--
-- What (definer functions with an empty search path; authority =
-- ninos_puede_operar_algun_area()):
--   1. ninos_familia_hijos(uuid) replaced: it also returns the minors linked
--      to the parent that have no ninos_fichas row yet (for example added
--      through "Agregar Familiar" on the profile), with tiene_ficha = false
--      and empty ficha fields. A linked person counts as a minor when the
--      birth date is unknown or under 18 years.
--   2. ninos_familia_padres(uuid) (internal): every parent of the children
--      of a parent, the parent itself first, so a family card shows both.
--   3. ninos_buscar_familias(text) replaced: also matches children without a
--      ficha and returns padres per family.
--   4. ninos_crear_ficha(nino, ficha, autorizados): creates the missing
--      ficha of a child linked as hijo to at least one person, then reuses
--      ninos_actualizar_nino for the fields and the pickup list.
--   5. ninos_vincular_padre(ninos[], padre_id, padre_nuevo): links an
--      existing person (confirmed through ninos_buscar_padre) or a new adult
--      as 'padre' of every child given. Idempotent; refuses self links and
--      linking a child to its own child.
--
-- Relationship convention unchanged: child = usuario1, parent = usuario2,
-- tipo 'padre'; reads also accept the reverse 'hijo' form. Parent emails for
-- notifications (ninos_correos_visita, pre-registration branch) read the
-- child→padre rows, so a second parent linked here is included.
--
-- Errors: sin_autoridad (42501); datos_invalidos / nino_no_encontrado /
-- sin_padre / padre_no_encontrado / vinculo_invalido / sin_campus (22023);
-- ficha_existente / padre_existente (23505).
--
-- Rollback: re-run ninos_familia_hijos and ninos_buscar_familias from
-- 20261008142000_ninos_familias.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_vincular_padre(uuid[], uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_crear_ficha(uuid, jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_familia_padres(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_es_hijo_vinculado(uuid);

-- True when the person is linked as the child of somebody (either direction).
CREATE OR REPLACE FUNCTION public.ninos_es_hijo_vinculado(p_nino_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                  WHERE r.usuario1_id = p_nino_id AND r.tipo_relacion IN ('padre', 'tutor'))
      OR EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                  WHERE r.usuario2_id = p_nino_id AND r.tipo_relacion = 'hijo');
$$;
REVOKE ALL ON FUNCTION public.ninos_es_hijo_vinculado(uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. children of a parent, with or without ficha ───────────────────

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
  AND (f.usuario_id IS NOT NULL OR u.fecha_nacimiento IS NULL
       OR u.fecha_nacimiento::date > public.ninos_hoy() - interval '18 years');
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_hijos(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. every parent of a parent's children ───────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_familia_padres(p_padre_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH hijos AS (
    SELECT (e.h ->> 'id')::uuid AS id FROM jsonb_array_elements(public.ninos_familia_hijos(p_padre_id)) e(h)
  ), padres AS (
    SELECT p_padre_id AS id
    UNION
    SELECT r.usuario2_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion IN ('padre', 'tutor') AND r.usuario1_id IN (SELECT id FROM hijos)
    UNION
    SELECT r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.tipo_relacion = 'hijo' AND r.usuario2_id IN (SELECT id FROM hijos)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'telefono', u.telefono)
           ORDER BY u.id <> p_padre_id, u.apellido, u.nombre), '[]'::jsonb)
  FROM padres p JOIN public.usuarios u ON u.id = p.id;
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_padres(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. search, children without ficha included ───────────────────────

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
      WHERE (f.usuario_id IS NOT NULL OR hi.fecha_nacimiento IS NULL
             OR hi.fecha_nacimiento::date > public.ninos_hoy() - interval '18 years')
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

-- ── 4. complete the ficha of a linked child ──────────────────────────

-- p_ficha has the keys ninos_actualizar_nino accepts (personal data and
-- ficha fields); p_autorizados is the pickup list.
CREATE OR REPLACE FUNCTION public.ninos_crear_ficha(p_nino_id uuid, p_ficha jsonb, p_autorizados jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  INSERT INTO public.ninos_fichas (usuario_id) VALUES (p_nino_id);
  -- Same validation and writes as an edit; any error rolls back the insert.
  PERFORM public.ninos_actualizar_nino(p_nino_id,
    coalesce(p_ficha, '{}'::jsonb) - 'autorizados'
      || jsonb_build_object('autorizados', coalesce(p_autorizados, '[]'::jsonb)));
END;
$$;

COMMENT ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) IS
  'N10: creates the missing ninos_fichas row of a child linked as hijo to someone, with the pickup list. '
  'Authority: ninos_puede_operar_algun_area.';

-- ── 5. link a (second) parent ────────────────────────────────────────

-- Exactly one of p_padre_id (an existing person the anfitrión confirmed) or
-- p_padre_nuevo {nombre, apellido, telefono, genero, cedula?, email?}.
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

  -- Only children of the Niños module: a ficha or an existing parent link.
  FOREACH v_nino IN ARRAY p_nino_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = v_nino)
       AND NOT public.ninos_es_hijo_vinculado(v_nino) THEN
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

COMMENT ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) IS
  'N10: links an existing person (explicit id) or a new adult as padre of the given children; idempotent. '
  'Authority: ninos_puede_operar_algun_area.';

REVOKE ALL ON FUNCTION public.ninos_buscar_familias(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_familias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_crear_ficha(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_padre(uuid[], uuid, jsonb) TO authenticated;
