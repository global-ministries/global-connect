-- Ajuste de permisos para Director de Etapa: ahora sólo supervisa grupos asignados explícitamente
-- 1. Actualiza puede_ver_grupo
-- 2. Actualiza puede_editar_grupo
-- 3. Elimina excepción de líder en puede_crear_grupo (fase 1 parte A)

-- Backup nombres originales (por si rollback manual)
-- Reemplazo en caliente sin DROP para no invalidar políticas dependientes
CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_director_etapa boolean := false;
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

  -- Director de Etapa: ahora sólo si está asignado explícitamente al grupo
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro: si pertenece al grupo
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_ver_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_grupo(uuid, uuid) TO anon, authenticated, service_role;

-- Actualizar puede_editar_grupo (usa auth_id, mantenemos firma)
-- Reemplazo en caliente sin DROP
CREATE OR REPLACE FUNCTION public.puede_editar_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_director_etapa boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT TRUE INTO v_es_admin
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_es_admin THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa: sólo si asignado al grupo
  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_es_director_etapa THEN
    IF EXISTS (
      SELECT 1 FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = v_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder del grupo (Colíder ya no)
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = v_user_id AND gm.rol = 'Líder'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_editar_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_editar_grupo(uuid, uuid) TO anon, authenticated, service_role;

-- Reemplazar puede_crear_grupo eliminando excepción de líder
-- Reemplazo en caliente sin DROP
CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_director_etapa boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_segmento_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT TRUE INTO v_es_admin
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;
  IF v_es_admin THEN
    RETURN TRUE;
  END IF;

  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;
  IF v_es_director_etapa THEN
    -- Debe supervisar el segmento (segmento_lideres) para poder crear en él
    IF EXISTS (
      SELECT 1 FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_user_id
        AND sl.segmento_id = p_segmento_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_crear_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_crear_grupo(uuid, uuid) TO anon, authenticated, service_role;
