-- A couple of directores de etapa directs the SAME groups at creation time.
--
-- In segment Matrimonios each spouse is its own director_etapa row in
-- segmento_lideres, so creating a group linked only one spouse. The business
-- rule is that a couple is one director: both are linked to the same groups.
--
-- 1. conyuge_director_etapa_id: the segmento_lideres id of the spouse of a
--    director de etapa, or NULL. Same pairing rule as the dream-team migration
--    20260912120000: same segmento_id, both director_etapa, conyuge in either
--    direction in relaciones_usuarios.
-- 2. crear_grupo_con_director: also links the spouse after the director link.
--
-- Non-couple directors behave exactly as before. Existing groups are NOT
-- modified here (backfill is a separate, explicitly authorized operation).
-- Couple-aware assign/remove of directors lives in app code, not in the database.
--
-- ROLLBACK: restore crear_grupo_con_director from 20260930120000, then
-- remove the function conyuge_director_etapa_id(uuid).

-- SECURITY INVOKER on purpose, and EXECUTE only for service_role. The helper is
-- called from crear_grupo_con_director (SECURITY DEFINER, so it runs as its
-- owner, who can always execute it) and from app code using the service-role
-- client (which bypasses RLS). Nobody else needs it: anon and authenticated
-- get no EXECUTE, so it cannot be used to probe spouse relations, and as
-- INVOKER it never grants more visibility than the caller already has.
CREATE OR REPLACE FUNCTION public.conyuge_director_etapa_id(p_segmento_lider_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT c.id
  FROM public.segmento_lideres d
  JOIN public.segmento_lideres c
    ON c.segmento_id = d.segmento_id
   AND c.tipo_lider = 'director_etapa'
   AND c.usuario_id <> d.usuario_id
  JOIN public.relaciones_usuarios r
    ON r.tipo_relacion = 'conyuge'
   AND ((r.usuario1_id = d.usuario_id AND r.usuario2_id = c.usuario_id)
     OR (r.usuario1_id = c.usuario_id AND r.usuario2_id = d.usuario_id))
  WHERE d.id = p_segmento_lider_id
    AND d.tipo_lider = 'director_etapa'
  ORDER BY coalesce(r.es_principal, false) DESC, r.id, c.id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.conyuge_director_etapa_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conyuge_director_etapa_id(uuid) TO service_role;

COMMENT ON FUNCTION public.conyuge_director_etapa_id(uuid) IS
  'Returns the segmento_lideres id of the spouse of a director de etapa (same segment, also director de etapa, conyuge in relaciones_usuarios), or NULL. Deterministic: es_principal first, then lowest relation id, then lowest segmento_lideres id. EXECUTE only for service_role (and the owner, through crear_grupo_con_director).';

CREATE OR REPLACE FUNCTION public.crear_grupo_con_director(
  p_nombre text,
  p_temporada_id uuid,
  p_segmento_id uuid,
  p_director_etapa_segmento_lider_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_solo_director_etapa boolean;
  v_director_id uuid;
  v_conyuge_id uuid;
  v_nuevo_id uuid;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  IF NOT public.puede_crear_grupo(v_auth_id, p_segmento_id) THEN
    RAISE EXCEPTION 'Permiso denegado para crear grupo en el segmento indicado' USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;

  -- A director de etapa (with no higher role) is always the director of the group they create.
  SELECT
    bool_or(rs.nombre_interno = 'director-etapa')
      AND NOT bool_or(rs.nombre_interno IN ('admin', 'pastor', 'director-general'))
  INTO v_solo_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  IF coalesce(v_solo_director_etapa, false) THEN
    SELECT sl.id INTO v_director_id
    FROM public.segmento_lideres sl
    WHERE sl.usuario_id = v_user_id
      AND sl.segmento_id = p_segmento_id
      AND sl.tipo_lider = 'director_etapa'
    LIMIT 1;
    IF v_director_id IS NULL THEN
      RAISE EXCEPTION 'No eres director de etapa de este segmento' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT sl.id INTO v_director_id
    FROM public.segmento_lideres sl
    WHERE sl.id = p_director_etapa_segmento_lider_id
      AND sl.segmento_id = p_segmento_id
      AND sl.tipo_lider = 'director_etapa';
    IF v_director_id IS NULL THEN
      RAISE EXCEPTION 'El director de etapa indicado no pertenece al segmento' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_nuevo_id := public.crear_grupo(v_auth_id, p_nombre, p_temporada_id, p_segmento_id);

  INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
  VALUES (v_nuevo_id, v_director_id);

  -- A couple directs the same groups: link the spouse too, if any.
  v_conyuge_id := public.conyuge_director_etapa_id(v_director_id);
  IF v_conyuge_id IS NOT NULL THEN
    -- NOT EXISTS instead of ON CONFLICT (cols): director_etapa_grupos has no
    -- unique index on (director_etapa_id, grupo_id) (only the primary key), and
    -- a column-targeted ON CONFLICT fails without it.
    INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
    SELECT v_nuevo_id, v_conyuge_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.director_etapa_grupos x
      WHERE x.grupo_id = v_nuevo_id AND x.director_etapa_id = v_conyuge_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_nuevo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) IS
  'Creates a group and links its director de etapa (segmento_lideres id) in one transaction. The actor is auth.uid(); a director de etapa is always the director of the group they create.';
