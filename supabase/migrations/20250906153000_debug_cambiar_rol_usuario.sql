-- RPC de depuración para cambiar el rol principal del usuario autenticado
-- Solo permitido para admin o pastor

CREATE OR REPLACE FUNCTION public.debug_cambiar_rol_usuario(
  p_auth_id uuid,
  p_nuevo_rol text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_permitido boolean := false;
  v_rol_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_nuevo_rol IS NULL THEN
    RAISE EXCEPTION 'Parámetros inválidos';
  END IF;

  -- Resolver id interno
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Solo admin o pastor pueden usar esta función
  SELECT TRUE INTO v_permitido
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;

  IF NOT v_permitido THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Encontrar el rol solicitado
  SELECT id INTO v_rol_id FROM public.roles_sistema WHERE nombre_interno = p_nuevo_rol;
  IF v_rol_id IS NULL THEN
    RAISE EXCEPTION 'Rol inválido: %', p_nuevo_rol;
  END IF;

  -- Reemplazar asignaciones: para debug dejaremos un solo rol activo
  DELETE FROM public.usuario_roles WHERE usuario_id = v_user_id;
  INSERT INTO public.usuario_roles (usuario_id, rol_id) VALUES (v_user_id, v_rol_id);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.debug_cambiar_rol_usuario(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_cambiar_rol_usuario(uuid, text) TO authenticated, service_role;
