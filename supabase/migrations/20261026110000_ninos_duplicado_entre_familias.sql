-- Niños: warn when a child registered at the table already exists in ANOTHER
-- family (odd/tasks/ninos-cobertura.md P2-4 / G6; odd/tasks/ninos-pendientes-2.md T2).
--
-- Before: ninos_registrar_familia only refuses a child already linked to the
-- registering adult (or the spouse being linked) as 'hijo_ya_registrado', so
-- the same child could be created again under a second family.
--
-- Now the form asks, before registering, for likely duplicates: a person with
-- the same name key (dream_team_clave_nombre, the key the registration guard
-- and ninos_mis_hijos_registrar already use) and the same birth date, linked
-- to a parent other than the registering adult. It is a warning, not a block:
-- ninos_registrar_familia is unchanged, so the anfitrión can open the other
-- family or continue.
--
-- No new public lookup of people (S4):
--   * only a Niños operator (ninos_puede_operar_algun_area) can call it;
--     anon has no EXECUTE;
--   * a match is returned only when the child is in the caller's scope
--     (ninos_en_alcance with ninos_campus_operables, the same scope as the
--     family searches);
--   * the caller must already know the full name and birth date, and gets
--     back only the child's id and name and its family (principal parent id
--     and parents' names), which the family search already shows.
--
-- What (definer, empty search path):
--   ninos_hijos_coincidencias(p_hijos jsonb, p_padre_id uuid) -> jsonb array of
--   { indice, nino_id, nombre, apellido, padre_id, padres } where indice is
--   the 0-based position in p_hijos. p_padre_id (NULL for a new adult) is the
--   registering adult: children already linked to them are left out (the
--   registration itself refuses those, as before). Entries without nombre,
--   apellido or a valid birth date are skipped. At most 10 children.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_hijos_coincidencias(jsonb, uuid);

CREATE OR REPLACE FUNCTION public.ninos_hijos_coincidencias(p_hijos jsonb, p_padre_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_campus uuid[];
  v_hijo   jsonb;
  v_n      bigint;
  v_nac    date;
  v_clave  text;
  v_res    jsonb := '[]'::jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_hijos IS NULL OR jsonb_typeof(p_hijos) <> 'array' OR jsonb_array_length(p_hijos) > 10 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'hijos: array of at most 10';
  END IF;
  v_campus := public.ninos_campus_operables();

  FOR v_hijo, v_n IN SELECT e.h, e.n FROM jsonb_array_elements(p_hijos) WITH ORDINALITY e(h, n) LOOP
    IF jsonb_typeof(v_hijo) <> 'object' OR public.ninos_texto(v_hijo, 'nombre') IS NULL
       OR public.ninos_texto(v_hijo, 'apellido') IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      v_nac := (v_hijo ->> 'fecha_nacimiento')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      CONTINUE;
    END;
    IF v_nac IS NULL THEN
      CONTINUE;
    END IF;
    v_clave := public.dream_team_clave_nombre(public.ninos_texto(v_hijo, 'nombre'), public.ninos_texto(v_hijo, 'apellido'));

    SELECT v_res || coalesce(jsonb_agg(jsonb_build_object(
             'indice', v_n - 1, 'nino_id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
             'padre_id', fam.padres[1], 'padres', fam.nombres)
             ORDER BY c.apellido, c.nombre, c.id), '[]'::jsonb)
      INTO v_res
      FROM public.usuarios c
      CROSS JOIN LATERAL (
        SELECT array_agg(pa.id ORDER BY pa.principal DESC, pa.apellido, pa.nombre, pa.id) AS padres,
               jsonb_agg(btrim(pa.nombre || ' ' || coalesce(pa.apellido, ''))
                         ORDER BY pa.principal DESC, pa.apellido, pa.nombre, pa.id) AS nombres
          FROM (SELECT u.id, u.nombre, u.apellido, bool_or(l.es_principal) AS principal
                  FROM (SELECT r.usuario2_id AS id, r.es_principal FROM public.relaciones_usuarios r
                         WHERE r.usuario1_id = c.id AND r.tipo_relacion IN ('padre', 'tutor')
                        UNION ALL
                        SELECT r.usuario1_id, r.es_principal FROM public.relaciones_usuarios r
                         WHERE r.usuario2_id = c.id AND r.tipo_relacion = 'hijo') l
                  JOIN public.usuarios u ON u.id = l.id
                 GROUP BY u.id, u.nombre, u.apellido) pa
      ) fam
     WHERE c.fecha_nacimiento = v_nac
       AND public.dream_team_clave_nombre(c.nombre, c.apellido) = v_clave
       -- Only a child of some family: a person without a parent link is not "another family".
       AND fam.padres IS NOT NULL
       -- The registering adult's own children keep the existing hard refusal.
       AND (p_padre_id IS NULL OR p_padre_id <> ALL (fam.padres))
       AND public.ninos_en_alcance(c.id, v_campus);
  END LOOP;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.ninos_hijos_coincidencias(jsonb, uuid) IS
  'Niños staff: children in scope with the same name key and birth date as the ones being registered, '
  'linked to another family (indice, nino_id, nombre, apellido, padre_id, padres). A warning only.';

REVOKE ALL ON FUNCTION public.ninos_hijos_coincidencias(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_hijos_coincidencias(jsonb, uuid) TO authenticated;
