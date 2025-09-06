SET search_path = public;

-- Actualizar rol de miembro
DROP FUNCTION IF EXISTS public.actualizar_rol_miembro(uuid, uuid, uuid, public.enum_rol_grupo);
CREATE OR REPLACE FUNCTION public.actualizar_rol_miembro(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_usuario_id uuid,
  p_rol public.enum_rol_grupo
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  UPDATE public.grupo_miembros
  SET rol = p_rol
  WHERE grupo_id = p_grupo_id AND usuario_id = p_usuario_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_rol_miembro(uuid, uuid, uuid, public.enum_rol_grupo) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_rol_miembro(uuid, uuid, uuid, public.enum_rol_grupo) TO anon, authenticated;

-- Eliminar miembro del grupo
DROP FUNCTION IF EXISTS public.eliminar_miembro_de_grupo(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.eliminar_miembro_de_grupo(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  DELETE FROM public.grupo_miembros
  WHERE grupo_id = p_grupo_id AND usuario_id = p_usuario_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_miembro_de_grupo(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_miembro_de_grupo(uuid, uuid, uuid) TO anon, authenticated;
