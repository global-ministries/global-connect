-- Niños: "Revisar edad" when linking an existing child
-- (odd/tasks/ninos-checkin.md, task N13).
--
-- Some children were registered with a wrong birth date (or none), so
-- ninos_buscar_hijos_vincular (known birth date under 13 only) never offers
-- them. The rule stays: nobody counts as Niños just for being a hijo; only a
-- ficha or a known birth date under 13.
--
-- 1. ninos_buscar_hijos_revisar_edad(text, uuid) (new): same search criteria,
--    exclusions and masking as ninos_buscar_hijos_vincular, but for people
--    NOT in the Niños age range (13 or older, a future date, or no birth
--    date), excluding married people (estado_civil 'Casado' or a 'conyuge'
--    relation in either direction). Youngest first, unknown ages last; at
--    most 10; edad_anos is null when the birth date is unknown.
-- 2. ninos_vincular_revisando_edad(uuid, date, uuid, jsonb) (new): the
--    anfitrión enters a corrected birth date. It must put the person under
--    13 ('edad_fuera_de_rango' otherwise). The person must be a candidate of
--    (1). The date is written to that person only, then the link goes
--    through ninos_vincular_padre (same rules and refusals). One transaction:
--    a refused link leaves the birth date unchanged.
-- Authority: ninos_puede_operar_algun_area (same as the other vincular
-- functions).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_vincular_revisando_edad(uuid, date, uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_buscar_hijos_revisar_edad(text, uuid);
--   DROP FUNCTION IF EXISTS public.ninos_revisar_edad_candidato(uuid);

-- Internal: a person who may be offered for an age review (not in the Niños
-- age range and not married).
CREATE OR REPLACE FUNCTION public.ninos_revisar_edad_candidato(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
     WHERE u.id = p_usuario_id
       AND NOT public.ninos_en_rango_edad(u.fecha_nacimiento::date)
       AND u.estado_civil IS DISTINCT FROM 'Casado'
       AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                        WHERE r.tipo_relacion = 'conyuge'
                          AND (r.usuario1_id = u.id OR r.usuario2_id = u.id)));
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

  RETURN (
    WITH candidatos AS (
      SELECT u.id, u.nombre, u.apellido, u.cedula, u.fecha_nacimiento::date AS nac
        FROM public.usuarios u
       WHERE public.ninos_revisar_edad_candidato(u.id)
         AND (p_padre_id IS NULL OR u.id <> p_padre_id)
         AND ((v_ced IS NOT NULL AND u.cedula = v_ced)
          OR lower(translate(u.nombre || ' ' || u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) = v_q
          OR (v_nom IS NOT NULL
              AND lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_nom || '%'
              AND lower(translate(u.apellido, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE '%' || v_ape || '%'))
         AND NOT EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                          WHERE (r.usuario1_id = u.id AND r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor'))
                             OR (r.usuario1_id = p_padre_id AND r.usuario2_id = u.id AND r.tipo_relacion = 'hijo'))
       -- Youngest first: the likely children; unknown ages last.
       ORDER BY u.fecha_nacimiento DESC NULLS LAST, u.apellido, u.nombre
       LIMIT 10
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'edad_anos', CASE WHEN c.nac IS NOT NULL THEN extract(year FROM age(public.ninos_hoy(), c.nac))::integer END,
             'cedula', CASE WHEN c.cedula IS NOT NULL THEN '•••' || right(regexp_replace(c.cedula, '\D', '', 'g'), 4) END)
             ORDER BY c.nac DESC NULLS LAST, c.apellido, c.nombre), '[]'::jsonb)
      FROM candidatos c
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ninos_vincular_revisando_edad(
  p_nino_id uuid, p_fecha_nacimiento date, p_padre_id uuid, p_padre_nuevo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_id IS NULL OR NOT public.ninos_revisar_edad_candidato(p_nino_id) THEN
    RAISE EXCEPTION 'nino_no_encontrado' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ninos_en_rango_edad(p_fecha_nacimiento) THEN
    RAISE EXCEPTION 'edad_fuera_de_rango' USING ERRCODE = '22023';
  END IF;

  UPDATE public.usuarios u SET fecha_nacimiento = p_fecha_nacimiento WHERE u.id = p_nino_id;

  RETURN public.ninos_vincular_padre(ARRAY[p_nino_id], p_padre_id, p_padre_nuevo);
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_revisar_edad_candidato(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_vincular_revisando_edad(uuid, date, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_buscar_hijos_revisar_edad(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_vincular_revisando_edad(uuid, date, uuid, jsonb) TO authenticated;
