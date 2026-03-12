-- E10: Definir o reemplazar la función puede_crear_usuario
-- Agrega director_etapa y director_general a los roles que pueden crear usuarios.
-- Antes solo admin y pastor podían. Ahora también director-general y director-etapa.

CREATE OR REPLACE FUNCTION public.puede_crear_usuario(p_auth_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_permitido boolean := false;
BEGIN
  IF p_auth_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mapear auth_id a id interno
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verificar si tiene alguno de los roles permitidos
  SELECT TRUE INTO v_permitido
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  LIMIT 1;

  RETURN COALESCE(v_permitido, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.puede_crear_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_crear_usuario(uuid) TO anon, authenticated, service_role;
