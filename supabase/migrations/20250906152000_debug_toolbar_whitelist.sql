-- Tabla de whitelist para mostrar barra superior de debug
CREATE TABLE IF NOT EXISTS public.debug_toolbar_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.debug_toolbar_whitelist ENABLE ROW LEVEL SECURITY;
-- Por simplicidad, permitir a roles autenticados leer su propio registro; administración se hará via Studio/SQL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'debug_toolbar_whitelist' AND policyname = 'select_whitelist'
  ) THEN
    CREATE POLICY select_whitelist ON public.debug_toolbar_whitelist FOR SELECT USING (true);
  END IF;
END $$;

-- RPC: puede_ver_debug_toolbar
CREATE OR REPLACE FUNCTION public.puede_ver_debug_toolbar(p_auth_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.debug_toolbar_whitelist w ON w.usuario_id = u.id
    WHERE u.auth_id = p_auth_id
  );
$$;

REVOKE ALL ON FUNCTION public.puede_ver_debug_toolbar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_debug_toolbar(uuid) TO anon, authenticated, service_role;

-- RPC: debug_cambiar_rol
-- Cambia el rol principal del usuario autenticado si est en la whitelist
CREATE OR REPLACE FUNCTION public.debug_cambiar_rol(p_auth_id uuid, p_nuevo_rol text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid;
  v_rol_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_nuevo_rol IS NULL THEN
    RAISE EXCEPTION 'Parmetros invalidos';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Verificar whitelist
  IF NOT EXISTS (
    SELECT 1 FROM public.debug_toolbar_whitelist w WHERE w.usuario_id = v_usuario_id
  ) THEN
    RAISE EXCEPTION 'No autorizado para cambiar rol';
  END IF;

  -- Encontrar rol por nombre interno
  SELECT rs.id INTO v_rol_id FROM public.roles_sistema rs WHERE rs.nombre_interno = p_nuevo_rol;
  IF v_rol_id IS NULL THEN
    RAISE EXCEPTION 'Rol no vlido: %', p_nuevo_rol;
  END IF;

  -- Reemplazar asignacin de roles (modo debug simple): borrar y asignar uno
  DELETE FROM public.usuario_roles WHERE usuario_id = v_usuario_id;
  INSERT INTO public.usuario_roles (usuario_id, rol_id) VALUES (v_usuario_id, v_rol_id);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.debug_cambiar_rol(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_cambiar_rol(uuid, text) TO authenticated, service_role;
