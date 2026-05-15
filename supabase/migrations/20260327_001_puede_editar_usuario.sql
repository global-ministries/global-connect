-- ==========================================================================
-- Migración: Ajustar función de permisos para edición de usuarios
-- Objetivo: concentrar reglas de dominio en puede_editar_usuario con alcance
--           por rol + membresía objetivo/actor (líder, director-etapa, DG).
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.puede_editar_usuario(
  p_auth_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_actor_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Autoedición
  IF v_actor_id = p_target_user_id THEN
    RETURN TRUE;
  END IF;

  -- El usuario objetivo debe existir
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_target_user_id) THEN
    RETURN FALSE;
  END IF;

  -- Regla global: Admin/Pastor
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Líder puede editar usuarios activos del mismo grupo
  IF EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_actor
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = gm_actor.grupo_id
    JOIN public.grupos g
      ON g.id = gm_actor.grupo_id
    WHERE gm_actor.usuario_id = v_actor_id
      AND gm_actor.rol = 'Líder'
      AND gm_actor.estado = 'activo'
      AND gm_actor.fecha_salida IS NULL
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director de etapa puede editar usuarios activos en sus grupos asignados
  IF EXISTS (
    SELECT 1
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl
      ON sl.id = deg.director_etapa_id
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = deg.grupo_id
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE sl.usuario_id = v_actor_id
      AND sl.tipo_lider = 'director_etapa'
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director general (scoped) via función existente por grupo
  IF EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_objetivo
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
      AND public.es_director_general_de_grupo(p_auth_id, gm_objetivo.grupo_id)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Permisos de ejecución explícitos
REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated;
