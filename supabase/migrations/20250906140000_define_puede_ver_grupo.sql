-- Define o reemplaza la función de permisos para visibilidad de grupos
-- Reglas:
-- - Admin/Pastor/Director General: puede ver todos los grupos
-- - Director de Etapa: puede ver grupos de sus segmentos asignados
-- - Líder/Colíder: puede ver los grupos donde es miembro (cualquier rol)
-- - Miembro: puede ver los grupos donde pertenece
-- La función opera con el id interno de usuarios (no auth_id)

-- Importante: conservar la firma y nombres de parámetros existentes para no romper dependencias
CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_director_general boolean := false;
  v_is_director_etapa boolean := false;
  v_is_lider boolean := false;
  v_segmento_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor/Director General
  SELECT TRUE INTO v_is_admin
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_is_admin THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa: por segmentos asignados
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    -- Comparar segmento del grupo con segmentos donde el usuario es líder de etapa
    SELECT g.segmento_id INTO v_segmento_id FROM public.grupos g WHERE g.id = p_grupo_id;
    IF v_segmento_id IS NULL THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.segmento_lideres sl
  WHERE sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
        AND sl.segmento_id = v_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro si pertenece al grupo
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
  WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Garantizar que el invocador tenga permisos de ejecución
REVOKE ALL ON FUNCTION public.puede_ver_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_grupo(uuid, uuid) TO anon, authenticated, service_role;
