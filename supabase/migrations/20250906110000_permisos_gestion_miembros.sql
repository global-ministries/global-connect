-- Seguridad: Permiso para gestionar miembros de un grupo
CREATE OR REPLACE FUNCTION public.puede_gestionar_miembros(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  es_autorizado boolean;
BEGIN
  -- Resolver usuario interno
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Roles con permiso explícito
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa')
  ) INTO es_autorizado;

  -- Si no es de los roles superiores, no puede gestionar
  IF NOT es_autorizado THEN
    RETURN FALSE;
  END IF;

  -- Opcional: Podríamos validar que el usuario tenga visibilidad del grupo.
  IF public.puede_ver_grupo(internal_user_id, p_grupo_id) IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;
