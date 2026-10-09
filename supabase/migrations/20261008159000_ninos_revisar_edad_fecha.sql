-- Niños: "Revisar edad" shows the current birth date (odd/tasks/ninos-checkin.md, N15).
--
-- ninos_buscar_hijos_revisar_edad(text, uuid) also returns 'fecha_nacimiento'
-- (ISO yyyy-mm-dd, null when unknown) so the anfitrión sees why the age must
-- be corrected and the date input starts from it. Only this function: the
-- "Menores de 13" search (ninos_buscar_hijos_vincular) is unchanged.
-- The return type stays jsonb, so CREATE OR REPLACE keeps the signature;
-- the definer rights, search_path '' and the grants are restated.
-- Body otherwise identical to 20261008158000_ninos_busqueda_rapida.sql.
--
-- Rollback: re-apply the ninos_buscar_hijos_revisar_edad definition from
--   20261008158000_ninos_busqueda_rapida.sql.

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
             'fecha_nacimiento', to_char(c.nac, 'YYYY-MM-DD'),
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.rango, c.nac DESC NULLS LAST, c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) TO authenticated;
