-- Identity guard for the role and permission predicates that take the caller as
-- an argument (security phase 2, batch 3).
--
-- What was wrong in the live functions:
--   * They run with the definer's rights and take the caller's identity as an
--     argument (p_auth_id, or p_auth_uid for the two campus helpers) but never
--     compared it with the session. Any logged-in person who knew another person's auth id
--     could ask "which roles does X have" (obtener_roles_usuario,
--     obtener_roles_sistema_usuario), "is X an admin / a leader / a general
--     director", "which campuses does X belong to", "what can X create, edit or
--     manage", "which segments does X direct" and "how many requests can X
--     approve", for anybody.
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, definer flag, owner and grants are unchanged, so the app needs
-- no change):
--   * Identity: the argument must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000 and of the batch 1
--     migration 20261002100000. The rest of every body is the live text.
--   * search_path is pinned to public where the function had none (seven
--     functions). Every object those bodies use is either qualified (public.*,
--     auth.*) or lives in public, so the pin changes no resolution.
--   * Grants are restated at the end of the file; they are exactly today's state
--     (no anon, no PUBLIC; postgres, authenticated, service_role, supabase_admin).
--
-- Form of the guard, per function. The plpgsql functions get
-- "v_request_role text := auth.role();" as the last declaration and the guard as
-- the first statement. The LANGUAGE sql functions stay LANGUAGE sql with the same
-- volatility (they sit in RLS policies, where the planner relies on STABLE): the
-- guard is an extra predicate inside the original query, and the original query
-- text is kept as it is. The guard expression has no column of the query in it,
-- so it costs a constant amount per call.
--
--   function                            lang  guard form             neutral value
--   obtener_roles_usuario               sql   AND in WHERE           NULL (no rows)
--   obtener_roles_sistema_usuario       sql   AND in WHERE           '{}'
--   tiene_rol_de_liderazgo              sql   COALESCE(...) AND (..) false
--   es_admin_o_pastor                   sql   AND inside EXISTS      false
--   es_director_general_de_grupo        plpgsql  IF ... RETURN       false
--   mis_campus_ids(p_auth_uid)          sql   AND in WHERE           '{}'
--   mi_campus_principal(p_auth_uid)     sql   AND in WHERE           NULL (no rows)
--   puede_crear_grupo                   plpgsql  IF ... RETURN       false
--   puede_crear_usuario                 plpgsql  IF ... RETURN       false
--   puede_editar_usuario                plpgsql  IF ... RETURN       false
--   puede_gestionar_casas               plpgsql  IF ... RETURN       false
--   puede_gestionar_miembros            plpgsql  IF ... RETURN       false
--   puede_ver_debug_toolbar             sql   AND inside EXISTS      false
--   contar_solicitudes_pendientes       plpgsql  IF ... RETURN       0
--   obtener_segmentos_para_director     sql   AND in WHERE           no rows
-- Each neutral value is what the live function returns today for an unknown id
-- (checked on staging with a random uuid), so the app sees no new shape.
--
-- Call sites (inventory on staging, all schemas, RLS policies, views, triggers,
-- column defaults, check constraints and indexes):
--   * RLS policies pass auth.uid() or (select auth.uid()): tiene_rol_de_liderazgo
--     (20 policies on casas_anfitrionas, direcciones, disponibilidad_liderazgo,
--     grupo_miembros, grupos, historial_movimientos_grupo, segmentos,
--     solicitudes_grupo, temporadas, usuario_roles), es_admin_o_pastor
--     (dg_directores_etapa), es_director_general_de_grupo (solicitudes_grupo),
--     mis_campus_ids (audit_grupo_miembros), obtener_roles_usuario (usuarios).
--     The usuarios policies also call puede_ver_usuario(auth.uid(), id), which
--     calls obtener_roles_usuario(p_viewer_id): the viewer is auth.uid() there.
--   * Other functions pass their own p_auth_id through (it is already guarded in
--     the batch 1, 2 and 4 functions and in the ones that had their own guard) or
--     auth.uid() (crear_grupo_con_director). puede_editar_usuario passes its
--     p_auth_id to es_director_general_de_grupo, so both agree.
--   * No view, trigger, column default, check constraint or index uses any of
--     the fifteen. The app calls them with the session client and the person's
--     own id; service-role callers stay exempt.
--   * The roles that bypass RLS (service_role, postgres, supabase_admin and the
--     two internal ones) never evaluate the policies; anon cannot execute any of
--     the fifteen, so no policy runs them without a JWT.
--
-- Not touched: es_superadmin, puede_ver_grupo, es_director_de_grupo,
-- es_lider_de_grupo, obtener_conyugue and puede_ver_usuario receive usuarios.id,
-- not the auth id (a later phase).
--
-- Blast radius: these run per statement or per row inside RLS policies, so a
-- wrong guard would break every signed-in user. With a person's own id (the only
-- thing the app and the policies pass) the guard is a no-op: the new functions
-- return exactly what the old ones returned. Only a caller that passes somebody
-- else's id changes, and that is the point.
--
-- Rollback: recreate the previous definitions. The live text before this file is
-- kept as the "ORIGINAL md5" list in the production apply script, and the latest
-- migration that defined each function is in the repository history
-- (git log -S "<name>" -- supabase/migrations); some were later overridden by a
-- live edit, so restore from the backup table the operator creates before
-- applying this file.

CREATE OR REPLACE FUNCTION public.contar_solicitudes_pendientes(p_auth_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN 0;
  END IF;

  IF public.es_superadmin(
    (SELECT id FROM public.usuarios WHERE auth_id = p_auth_id)
  ) THEN
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo WHERE estado = 'pendiente';
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo s
    JOIN public.grupos g ON g.id = s.grupo_id
    WHERE s.estado = 'pendiente'
      AND public.es_director_general_de_grupo(p_auth_id, s.grupo_id);
  END IF;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.es_admin_o_pastor(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND rs.nombre_interno IN ('admin', 'pastor')
      -- The caller is the person in the session; only service_role may act for
      -- somebody else.
      AND (
        coalesce(auth.role(), '') = 'service_role'
        OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.es_director_general_de_grupo(p_auth_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF public.es_superadmin(v_user_id) THEN RETURN TRUE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  ) THEN RETURN FALSE; END IF;
  RETURN public.gdv_dg_ve_grupo(v_user_id, p_grupo_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.mi_campus_principal(p_auth_uid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT uc.campus_id
  FROM usuario_campus uc
  WHERE uc.usuario_id = p_auth_uid
    AND uc.es_campus_principal = true
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.mis_campus_ids(p_auth_uid uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    array_agg(uc.campus_id),
    ARRAY[]::uuid[]
  )
  FROM usuario_campus uc
  WHERE uc.usuario_id = p_auth_uid
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_roles_sistema_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(rs.nombre_interno), ARRAY[]::text[])
  FROM usuario_roles ur
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  JOIN usuarios u ON u.id = ur.usuario_id
  WHERE u.auth_id = p_auth_id
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_roles_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT array_agg(rs.nombre_interno)
  FROM public.roles_sistema rs
  JOIN public.usuario_roles ur ON rs.id = ur.rol_id
  JOIN public.usuarios u ON ur.usuario_id = u.id
  WHERE u.auth_id = p_auth_id
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_segmentos_para_director(p_auth_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, nombre text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.nombre
  FROM public.usuarios u
  JOIN public.segmento_lideres sl ON sl.usuario_id = u.id AND sl.tipo_lider = 'director_etapa'
  JOIN public.segmentos s ON s.id = sl.segmento_id
  WHERE u.auth_id = p_auth_id
    -- NUEVO: filtro campus
    AND (p_campus_id IS NULL OR s.campus_id = p_campus_id)
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    )
  ORDER BY s.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_director_general boolean := false;
  v_es_director_etapa boolean := false;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

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
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;
  IF v_es_admin THEN
    RETURN TRUE;
  END IF;

  -- A general director creates only in the segments assigned to them.
  SELECT TRUE INTO v_es_director_general
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;
  IF v_es_director_general THEN
    IF EXISTS (
      SELECT 1 FROM public.director_general_segmentos dgs
      WHERE dgs.usuario_id = v_user_id
        AND dgs.segmento_id = p_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.puede_crear_usuario(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_permitido boolean := false;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.puede_editar_usuario(p_auth_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.puede_gestionar_casas(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  internal_user_id uuid;
  es_gestor boolean;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO internal_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF internal_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Verificar roles de gestión (incluye lider para asignar casas a miembros de su grupo)
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa','lider')
  ) INTO es_gestor;

  RETURN es_gestor;
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_gestionar_miembros(p_auth_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  internal_user_id uuid;
  es_superior boolean;
  es_lider_del_grupo boolean;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_debug_toolbar(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.debug_toolbar_whitelist w ON w.usuario_id = u.id
    WHERE u.auth_id = p_auth_id
      -- The caller is the person in the session; only service_role may act for
      -- somebody else.
      AND (
        coalesce(auth.role(), '') = 'service_role'
        OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_rol_de_liderazgo(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    obtener_roles_usuario(p_auth_id) && ARRAY['lider', 'director-etapa', 'director-general', 'pastor', 'admin'],
    false
  )
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  AND (
    coalesce(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
  );
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.contar_solicitudes_pendientes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_admin_o_pastor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_director_general_de_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_campus_principal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_campus_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_roles_sistema_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_roles_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_segmentos_para_director(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_crear_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_crear_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_gestionar_casas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_gestionar_miembros(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_ver_debug_toolbar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_rol_de_liderazgo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.contar_solicitudes_pendientes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_admin_o_pastor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_director_general_de_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mi_campus_principal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mis_campus_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_roles_sistema_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_roles_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_segmentos_para_director(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_crear_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_crear_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_casas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_miembros(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_debug_toolbar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_rol_de_liderazgo(uuid) TO authenticated, service_role;
