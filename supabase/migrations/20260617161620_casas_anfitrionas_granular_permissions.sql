-- Additive granular Casas Anfitrionas permission RPCs.
-- No data repair, backfill, deletion, or rewrite is performed by this migration.
-- Timestamp matches the migration version applied to global staging for Task 2.2 evidence.

CREATE OR REPLACE FUNCTION public.puede_ver_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_broad_role boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_user_id IS NULL OR p_casa_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false)
  INTO v_is_broad_role
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  IF v_is_broad_role THEN
    RETURN EXISTS (SELECT 1 FROM public.casas_anfitrionas ca WHERE ca.id = p_casa_id);
  END IF;

  RETURN p_casa_id = ANY(public.obtener_casas_visibles_ids(p_auth_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_crear_casa_anfitriona_para(
  p_auth_id uuid,
  p_usuario_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin_or_pastor boolean := false;
  v_is_director_general boolean := false;
  v_is_director_etapa boolean := false;
  v_is_lider boolean := false;
  v_has_director_etapa_assignments boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_user_id IS NULL OR p_usuario_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_usuario_id = v_user_id THEN
    RETURN true;
  END IF;

  SELECT
    COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-general'), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-etapa'), false),
    COALESCE(bool_or(rs.nombre_interno = 'lider'), false)
  INTO v_is_admin_or_pastor, v_is_director_general, v_is_director_etapa, v_is_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  IF v_is_admin_or_pastor THEN
    RETURN true;
  END IF;

  IF v_is_director_general THEN
    SELECT EXISTS (
      SELECT 1 FROM public.dg_directores_etapa dde WHERE dde.dg_usuario_id = v_user_id
    ) INTO v_has_director_etapa_assignments;

    IF v_has_director_etapa_assignments THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.grupo_miembros gm
        JOIN public.grupos g ON g.id = gm.grupo_id
        JOIN public.director_etapa_grupos deg ON deg.grupo_id = g.id
        JOIN public.dg_directores_etapa dde ON dde.segmento_lider_id = deg.director_etapa_id
        WHERE dde.dg_usuario_id = v_user_id
          AND gm.usuario_id = p_usuario_id
          AND gm.fecha_salida IS NULL
          AND g.activo = true
          AND g.eliminado = false
      );
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
      WHERE dgs.usuario_id = v_user_id
        AND gm.usuario_id = p_usuario_id
        AND gm.fecha_salida IS NULL
        AND g.activo = true
        AND g.eliminado = false
    );
  END IF;

  IF v_is_director_etapa THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.director_etapa_grupos deg ON deg.grupo_id = g.id
      JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
      WHERE sl.usuario_id = v_user_id
        AND sl.tipo_lider = 'director_etapa'
        AND gm.usuario_id = p_usuario_id
        AND gm.fecha_salida IS NULL
        AND g.activo = true
        AND g.eliminado = false
    );
  END IF;

  IF v_is_lider THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.grupo_miembros target_member
      JOIN public.grupo_miembros leader_member ON leader_member.grupo_id = target_member.grupo_id
      JOIN public.grupos g ON g.id = target_member.grupo_id
      WHERE leader_member.usuario_id = v_user_id
        AND leader_member.rol = 'Líder'
        AND leader_member.fecha_salida IS NULL
        AND target_member.usuario_id = p_usuario_id
        AND target_member.fecha_salida IS NULL
        AND g.activo = true
        AND g.eliminado = false
        AND g.estado_ciclo = 'activo'
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_aprobar_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_owner_id uuid;
  v_is_admin_or_pastor boolean := false;
  v_is_director_general boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  SELECT ca.usuario_id INTO v_owner_id FROM public.casas_anfitrionas ca WHERE ca.id = p_casa_id;

  IF v_user_id IS NULL OR v_owner_id IS NULL THEN RETURN false; END IF;

  SELECT
    COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-general'), false)
  INTO v_is_admin_or_pastor, v_is_director_general
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  RETURN v_is_admin_or_pastor OR (
    v_is_director_general AND public.puede_crear_casa_anfitriona_para(p_auth_id, v_owner_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_editar_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_owner_id uuid;
  v_has_editor_role boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  SELECT ca.usuario_id INTO v_owner_id FROM public.casas_anfitrionas ca WHERE ca.id = p_casa_id;

  IF v_user_id IS NULL OR v_owner_id IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')), false)
  INTO v_has_editor_role
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  RETURN v_has_editor_role AND public.puede_crear_casa_anfitriona_para(p_auth_id, v_owner_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_cambiar_estado_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public.puede_editar_casa_anfitriona(p_auth_id, p_casa_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_permisos_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_can_create_for_others boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object(
      'puede_ver', false,
      'puede_crear_propia', false,
      'puede_crear_para_otros', false,
      'puede_aprobar', false,
      'puede_editar', false,
      'puede_cambiar_estado', false
    );
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(bool_or(rs.nombre_interno IN (
      'admin', 'pastor', 'director-general', 'director-etapa', 'lider'
    )), false)
    INTO v_can_create_for_others
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'puede_ver', public.puede_ver_casa_anfitriona(p_auth_id, p_casa_id),
    'puede_crear_propia', public.puede_crear_casa_anfitriona_para(p_auth_id, v_user_id),
    'puede_crear_para_otros', v_can_create_for_others,
    'puede_aprobar', public.puede_aprobar_casa_anfitriona(p_auth_id, p_casa_id),
    'puede_editar', public.puede_editar_casa_anfitriona(p_auth_id, p_casa_id),
    'puede_cambiar_estado', public.puede_cambiar_estado_casa_anfitriona(p_auth_id, p_casa_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.puede_ver_casa_anfitriona(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_crear_casa_anfitriona_para(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_aprobar_casa_anfitriona(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_editar_casa_anfitriona(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_cambiar_estado_casa_anfitriona(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_permisos_casa_anfitriona(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_ver_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_crear_casa_anfitriona_para(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_aprobar_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_editar_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_cambiar_estado_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_permisos_casa_anfitriona(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.puede_ver_casa_anfitriona(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_crear_casa_anfitriona_para(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_aprobar_casa_anfitriona(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_editar_casa_anfitriona(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_cambiar_estado_casa_anfitriona(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_permisos_casa_anfitriona(uuid, uuid) TO authenticated, service_role;
