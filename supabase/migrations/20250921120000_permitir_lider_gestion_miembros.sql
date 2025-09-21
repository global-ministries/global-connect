-- Permitir que líderes de un grupo gestionen (agregar/actualizar) miembros de su propio grupo
CREATE OR REPLACE FUNCTION public.puede_gestionar_miembros(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  es_superior boolean;
  es_lider_del_grupo boolean;
BEGIN
  -- Resolver usuario interno
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Roles con permiso explícito a nivel sistema
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa')
  ) INTO es_superior;

  IF es_superior THEN
    -- Validar visibilidad mínima del grupo
    IF public.puede_ver_grupo(internal_user_id, p_grupo_id) IS NOT TRUE THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  -- Permitir a líderes del propio grupo
  SELECT EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id
      AND gm.usuario_id = internal_user_id
      AND gm.rol = 'Líder'
  ) INTO es_lider_del_grupo;

  IF es_lider_del_grupo THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
