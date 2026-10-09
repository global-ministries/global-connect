-- Niños: fast child search in "Vincular hijo existente"
-- (odd/tasks/ninos-checkin.md, task N14).
--
-- Both tabs (ninos_buscar_hijos_vincular and ninos_buscar_hijos_revisar_edad)
-- also accept ONE word of at least 3 letters (e.g. "camila"), matched against
-- the first name OR the last name, accent- and case-insensitive (translate,
-- as before). Single-word searches return up to 20 rows, best match first:
-- a first or last name (or one of its words) starting with the word, then
-- any containment; then by age as before. Cédula, full-name and
-- first+last-name searches, masking, permissions and exclusions (under 13 on
-- the first tab; married people on revisar-edad) are unchanged.
--
-- 1. ninos_rango_busqueda(text, text, text) (new, internal): 0 when a name
--    word starts with the search word, 1 otherwise (0 when no word).
-- 2. ninos_buscar_hijos_vincular(text, uuid): redefined.
-- 3. ninos_buscar_hijos_revisar_edad(text, uuid): redefined.
--
-- Rollback: re-apply the function bodies from
-- 20261008155000_ninos_niveles_vincular.sql and
-- 20261008157000_ninos_revisar_edad.sql, then
--   DROP FUNCTION IF EXISTS public.ninos_rango_busqueda(text, text, text);

CREATE OR REPLACE FUNCTION public.ninos_rango_busqueda(p_nombre text, p_apellido text, p_word text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_word IS NULL THEN 0
    WHEN (' ' || lower(translate(coalesce(p_nombre, '') || ' ' || coalesce(p_apellido, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')))
         LIKE '% ' || p_word || '%' THEN 0
    ELSE 1
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
  v_word   text;
  v_limit  integer := 10;
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
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
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
       -- Best match first, then youngest (the likely children); unknown ages last.
       ORDER BY rango, u.fecha_nacimiento DESC NULLS LAST, u.apellido, u.nombre
       LIMIT v_limit
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'edad_anos', CASE WHEN c.nac IS NOT NULL THEN extract(year FROM age(public.ninos_hoy(), c.nac))::integer END,
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.rango, c.nac DESC NULLS LAST, c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_rango_busqueda(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_vincular(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) TO authenticated;
