-- COR-002: Fix es_superadmin recibe p_auth_id en vez de v_user_id
-- La función es_superadmin() compara contra usuario_roles.usuario_id,
-- por lo que necesita el ID interno, no auth.uid().
CREATE OR REPLACE FUNCTION public.es_director_general_de_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user_id uuid; v_segmento_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Admin/Pastor: acceso global (v_user_id ya resuelto)
  IF public.es_superadmin(v_user_id) THEN RETURN TRUE; END IF;

  -- Obtener segmento del grupo
  SELECT segmento_id INTO v_segmento_id FROM public.grupos WHERE id = p_grupo_id;
  IF v_segmento_id IS NULL THEN RETURN FALSE; END IF;

  -- Verificar si es DG asignado a ese segmento
  RETURN EXISTS (
    SELECT 1 FROM public.director_general_segmentos dgs
    JOIN public.usuario_roles ur ON ur.usuario_id = dgs.usuario_id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE dgs.usuario_id = v_user_id
      AND dgs.segmento_id = v_segmento_id
      AND rs.nombre_interno = 'director-general'
  );
END; $$;
