-- Quita auto-asignación de líder al crear un grupo
-- Se mantiene la misma firma y permisos
DROP FUNCTION IF EXISTS public.crear_grupo(uuid, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.crear_grupo(
  p_auth_id uuid,
  p_nombre text,
  p_temporada_id uuid,
  p_segmento_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo_id uuid;
  v_user_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_nombre IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  -- Validar permiso a nivel DB (ya no hay caso especial para líder dentro de puede_crear_grupo)
  IF NOT public.puede_crear_grupo(p_auth_id, p_segmento_id) THEN
    RAISE EXCEPTION 'Permiso denegado para crear grupo en el segmento indicado';
  END IF;

  -- Resolver usuario interno (solo para validación; ya no se usa para auto-asignar)
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  INSERT INTO public.grupos (nombre, temporada_id, segmento_id, activo)
  VALUES (p_nombre, p_temporada_id, p_segmento_id, TRUE)
  RETURNING id INTO v_nuevo_id;

  RETURN v_nuevo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid) TO authenticated, anon, service_role;
