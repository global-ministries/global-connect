-- Niños: family and child searches only list people of the caller's campuses
-- (odd/tasks/ninos-roles-validacion.md, task R3a).
--
-- Before: ninos_buscar_familias, ninos_buscar_hijos_vincular and
-- ninos_buscar_hijos_revisar_edad only checked that the caller operates SOME
-- Niños area. A 2-letter name search returned families of EVERY campus with
-- phone, cédula, the children's medical fields and pickup list, so an
-- Anfitrión of one campus could browse every other campus's families.
--
-- Now a person is in the caller's scope when they, or someone one family hop
-- away (a parent or child through relaciones_usuarios padre/tutor/hijo), are
-- tied to a campus where the caller can operate Niños. A tie is:
--   - usuario_campus (the persona campus; ninos_registrar_familia writes it
--     for every new parent and child), or
--   - a Niños check-in at that campus (ninos_checkins.campus_id).
-- The operable campuses are those of the active rooms whose area passes
-- ninos_puede_operar (the same rooms the check-in screen loads). Admin and
-- pastor keep every campus. Signatures, return shapes, masking and grants
-- are unchanged; nobody outside the scope is returned.
--
-- What (definer, empty search path):
--   1. ninos_campus_operables() (new, internal): uuid[] of the caller's
--      operable campuses; NULL = every campus (admin/pastor).
--   2. ninos_en_alcance(uuid, uuid[]) (new, internal): the person, or a
--      parent/child of theirs, is tied to one of those campuses (NULL = yes).
--   3. ninos_buscar_familias(text): families and childless adults in scope.
--   4. ninos_buscar_hijos_vincular(text, uuid): children in scope.
--   5. ninos_buscar_hijos_revisar_edad(text, uuid): people in scope.
--
-- Rollback: re-apply ninos_buscar_familias from
-- 20261008154000_ninos_buscar_adultos.sql, ninos_buscar_hijos_vincular from
-- 20261008158000_ninos_busqueda_rapida.sql and ninos_buscar_hijos_revisar_edad
-- from 20261008159000_ninos_revisar_edad_fecha.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_en_alcance(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.ninos_campus_operables();

-- ── 1. the caller's operable campuses ────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_campus_operables()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN public.es_admin_o_pastor(auth.uid()) THEN NULL
    ELSE coalesce((SELECT array_agg(DISTINCT s.campus_id)
                     FROM public.ninos_salones s
                    WHERE s.activo AND public.ninos_puede_operar(s.equipo_id)), '{}'::uuid[])
  END;
$$;

-- ── 2. is a person (or their parent/child) tied to one of those campuses ──

CREATE OR REPLACE FUNCTION public.ninos_en_alcance(p_persona_id uuid, p_campus uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH familia AS (
    SELECT p_persona_id AS id
    UNION
    SELECT r.usuario2_id FROM public.relaciones_usuarios r
     WHERE r.usuario1_id = p_persona_id AND r.tipo_relacion IN ('padre', 'tutor', 'hijo')
    UNION
    SELECT r.usuario1_id FROM public.relaciones_usuarios r
     WHERE r.usuario2_id = p_persona_id AND r.tipo_relacion IN ('padre', 'tutor', 'hijo')
  )
  SELECT p_campus IS NULL
      OR EXISTS (SELECT 1 FROM familia fa JOIN public.usuario_campus uc ON uc.usuario_id = fa.id
                  WHERE uc.campus_id = ANY (p_campus))
      OR EXISTS (SELECT 1 FROM familia fa JOIN public.ninos_checkins c ON c.nino_id = fa.id
                  WHERE c.campus_id = ANY (p_campus));
$$;

REVOKE ALL ON FUNCTION public.ninos_campus_operables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_en_alcance(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── 3. families ──────────────────────────────────────────────────────

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
  v_campus uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_campus := public.ninos_campus_operables();
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
         OR (v_ced IS NOT NULL AND hi.cedula = v_ced)
         OR lower(translate(pa.nombre || ' ' || pa.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like
         OR lower(translate(hi.nombre || ' ' || hi.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like)
        -- Only families of the caller's campuses (the parent or a child).
        AND public.ninos_en_alcance(ph.padre, v_campus)
      LIMIT 20
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido, 'telefono', u.telefono,
             'cedula', u.cedula, 'hijos', public.ninos_familia_hijos(u.id),
             'padres', public.ninos_familia_padres(u.id), 'sin_hijos', false)
             ORDER BY u.apellido, u.nombre), '[]'::jsonb)
    FROM coincidencias c JOIN public.usuarios u ON u.id = c.padre
  ) || (
    -- An adult with no Niños children: EXACT cédula or phone only, so the
    -- search never becomes a people directory. Contact data is masked and
    -- nothing else (email, address, birth date) is returned.
    WITH adultos AS (
      SELECT u.id, u.nombre, u.apellido,
             CASE WHEN u.telefono IS NOT NULL THEN '•••' || right(regexp_replace(u.telefono, '\D', '', 'g'), 4) END AS tel,
             CASE WHEN u.cedula IS NOT NULL THEN '•••' || right(regexp_replace(u.cedula, '\D', '', 'g'), 4) END AS ced
        FROM public.usuarios u
       WHERE ((v_ced IS NOT NULL AND u.cedula = v_ced)
          OR (v_tel IS NOT NULL AND regexp_replace(u.telefono, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g')))
         -- Not a Niños child themselves.
         AND NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = u.id)
         AND NOT public.ninos_en_rango_edad(u.fecha_nacimiento::date)
         AND public.ninos_familia_hijos(u.id) = '[]'::jsonb
         AND public.ninos_en_alcance(u.id, v_campus)
       LIMIT 5
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'nombre', a.nombre, 'apellido', a.apellido, 'telefono', a.tel, 'cedula', a.ced,
             'hijos', '[]'::jsonb,
             'padres', jsonb_build_array(jsonb_build_object('id', a.id, 'nombre', a.nombre,
                                                            'apellido', a.apellido, 'telefono', a.tel)),
             'sin_hijos', true)
             ORDER BY a.apellido, a.nombre), '[]'::jsonb)
    FROM adultos a
  );
END;
$$;

-- ── 4. "Vincular hijo existente": children under the age limit ───────

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
  v_word   text;
  v_limit  integer := 10;
  v_campus uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_campus := public.ninos_campus_operables();
  v_ced := CASE WHEN length(v_digits) >= 5 THEN public.normalizar_cedula_ve(p_q) END;
  v_tokens := string_to_array(v_q, ' ');
  -- A name search needs at least 3 characters of a first name AND of a last name.
  IF cardinality(v_tokens) >= 2 AND length(v_tokens[1]) >= 3 AND length(v_tokens[cardinality(v_tokens)]) >= 3 THEN
    v_nom := v_tokens[1];
    v_ape := v_tokens[cardinality(v_tokens)];
  END IF;
  -- One word of >= 3 letters (no digits): first name OR last name, up to 20.
  IF cardinality(v_tokens) = 1 AND v_q !~ '\d' THEN
    v_word := v_q;
    v_limit := 20;
  END IF;

  RETURN (
    WITH candidatos AS (
      SELECT u.id, u.nombre, u.apellido, u.cedula, u.fecha_nacimiento::date AS nac,
             public.ninos_rango_busqueda(u.nombre, u.apellido, v_word) AS rango
        FROM public.usuarios u
       -- Only a KNOWN birth date under the Niños age limit: teens, adults and
       -- unknown ages are never offered as children.
       WHERE public.ninos_en_rango_edad(u.fecha_nacimiento::date)
         AND (p_padre_id IS NULL OR u.id <> p_padre_id)
         AND ((v_ced IS NOT NULL AND u.cedula = v_ced)
          OR lower(translate(u.nombre || ' ' || u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = v_q
          OR (v_nom IS NOT NULL
              AND lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_nom || '%'
              AND lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_ape || '%')
          OR (v_word IS NOT NULL
              AND (lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_word || '%'
                OR lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_word || '%')))
         -- Already a child of this adult: nothing to link.
         AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                          WHERE (r.usuario1_id = u.id AND r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor'))
                             OR (r.usuario1_id = p_padre_id AND r.usuario2_id = u.id AND r.tipo_relacion = 'hijo'))
         -- Only children of the caller's campuses.
         AND public.ninos_en_alcance(u.id, v_campus)
       -- Best match first (a name starting with the word), then age.
       ORDER BY rango, u.fecha_nacimiento DESC, u.apellido, u.nombre
       LIMIT v_limit
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'edad_anos', extract(year FROM age(public.ninos_hoy(), c.nac))::integer,
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.rango, c.nac DESC, c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

-- ── 5. "Revisar edad": people whose age must be corrected ────────────

CREATE OR REPLACE FUNCTION public.ninos_buscar_hijos_revisar_edad(p_q text, p_padre_id uuid)
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
  v_word   text;
  v_limit  integer := 10;
  v_campus uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_campus := public.ninos_campus_operables();
  v_ced := CASE WHEN length(v_digits) >= 5 THEN public.normalizar_cedula_ve(p_q) END;
  v_tokens := string_to_array(v_q, ' ');
  IF cardinality(v_tokens) >= 2 AND length(v_tokens[1]) >= 3 AND length(v_tokens[cardinality(v_tokens)]) >= 3 THEN
    v_nom := v_tokens[1];
    v_ape := v_tokens[cardinality(v_tokens)];
  END IF;
  -- One word of >= 3 letters (no digits): first name OR last name, up to 20.
  IF cardinality(v_tokens) = 1 AND v_q !~ '\d' THEN
    v_word := v_q;
    v_limit := 20;
  END IF;

  RETURN (
    WITH candidatos AS (
      SELECT u.id, u.nombre, u.apellido, u.cedula, u.fecha_nacimiento::date AS nac,
             public.ninos_rango_busqueda(u.nombre, u.apellido, v_word) AS rango
        FROM public.usuarios u
       WHERE public.ninos_revisar_edad_candidato(u.id)
         AND (p_padre_id IS NULL OR u.id <> p_padre_id)
         AND ((v_ced IS NOT NULL AND u.cedula = v_ced)
          OR lower(translate(u.nombre || ' ' || u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = v_q
          OR (v_nom IS NOT NULL
              AND lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_nom || '%'
              AND lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_ape || '%')
          OR (v_word IS NOT NULL
              AND (lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_word || '%'
                OR lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_word || '%')))
         AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                          WHERE (r.usuario1_id = u.id AND r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor'))
                             OR (r.usuario1_id = p_padre_id AND r.usuario2_id = u.id AND r.tipo_relacion = 'hijo'))
         -- Only people of the caller's campuses.
         AND public.ninos_en_alcance(u.id, v_campus)
       -- Best match first, then youngest (the likely children); unknown ages last.
       ORDER BY rango, u.fecha_nacimiento DESC NULLS LAST, u.apellido, u.nombre
       LIMIT v_limit
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'edad_anos', CASE WHEN c.nac IS NOT NULL THEN extract(year FROM age(public.ninos_hoy(), c.nac))::integer END,
             'fecha_nacimiento', to_char(c.nac, 'YYYY-MM-DD'),
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.rango, c.nac DESC NULLS LAST, c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_buscar_familias(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_familias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) TO authenticated;
