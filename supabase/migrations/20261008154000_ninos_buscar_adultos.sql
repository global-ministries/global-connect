-- Niños: an existing adult with no children is found by exact cédula or phone
-- (odd/tasks/ninos-checkin.md, task N11).
--
-- When the anfitrión types the exact cédula or phone of a person who has no
-- Niños children, the search used to answer "No se encontraron familias" and
-- the person was registered again. Now that person comes back as a family
-- with zero children (sin_hijos = true) so a child can be added with the
-- explicit padre.id path of ninos_registrar_familia, or an existing child
-- linked with ninos_vincular_padre.
--
-- What (definer, empty search path, same authority ninos_puede_operar_algun_area):
--   ninos_buscar_familias(text) replaced:
--     - families also match a child's exact cédula (to link an existing child);
--     - adults without children: EXACT cédula or phone (digits only) only,
--       never a partial name; telefono/cedula masked as •••1234; no email,
--       address or birth date; a Niños child (ficha or in age range) is never
--       listed as an adult; at most 5.
--   Every row now carries sin_hijos. The return type (jsonb) is unchanged.
--
-- Rollback: re-run the ninos_buscar_familias body of
-- 20261008152000_ninos_rango_edad.sql.

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
         OR (v_ced IS NOT NULL AND hi.cedula = v_ced)
         OR lower(translate(pa.nombre || ' ' || pa.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like
         OR lower(translate(hi.nombre || ' ' || hi.apellido, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) LIKE v_like)
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

REVOKE ALL ON FUNCTION public.ninos_buscar_familias(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_familias(text) TO authenticated;
