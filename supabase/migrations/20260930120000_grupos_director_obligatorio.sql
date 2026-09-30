-- A group is born with its director de etapa.
--
-- 1. puede_crear_grupo: a general director may create a group only in a segment
--    assigned to them in director_general_segmentos (any alcance). Admin, pastor
--    and director de etapa behave exactly as before.
-- 2. crear_grupo_con_director: creates the group and its director_etapa_grupos
--    row in one transaction, so a failed link leaves no group behind. The actor
--    is always auth.uid(). A director de etapa becomes the director of the group
--    they create, whatever the argument says.
--
-- crear_grupo is untouched; the existing groups are not modified.

CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_director_general boolean := false;
  v_es_director_etapa boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_segmento_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT TRUE INTO v_es_admin
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;
  IF v_es_admin THEN
    RETURN TRUE;
  END IF;

  -- A general director creates only in the segments assigned to them.
  SELECT TRUE INTO v_es_director_general
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;
  IF v_es_director_general THEN
    IF EXISTS (
      SELECT 1 FROM public.director_general_segmentos dgs
      WHERE dgs.usuario_id = v_user_id
        AND dgs.segmento_id = p_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;
  IF v_es_director_etapa THEN
    -- Debe supervisar el segmento (segmento_lideres) para poder crear en él
    IF EXISTS (
      SELECT 1 FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_user_id
        AND sl.segmento_id = p_segmento_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$function$;

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

  RETURN v_nuevo_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.crear_grupo_con_director(text, uuid, uuid, uuid) IS
  'Creates a group and links its director de etapa (segmento_lideres id) in one transaction. The actor is auth.uid(); a director de etapa is always the director of the group they create.';
