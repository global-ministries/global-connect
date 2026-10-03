-- Person-id helpers answer only about the session person (security phase 3,
-- batch L2).
--
-- What: es_superadmin, puede_ver_grupo, es_director_de_grupo and
-- es_lider_de_grupo take a person's internal id, usuarios.id (es_superadmin
-- names it p_auth_uid but compares it with usuario_roles.usuario_id). Unless
-- the request role is service_role, the argument must now be the usuarios.id
-- of the session person, the row whose auth_id is auth.uid(); with no session
-- or any other id they return false. Otherwise they return exactly what they
-- returned before.
--
-- Why: every signed-in person can execute them, and they answered about
-- anybody: whether a person is admin or pastor, and which groups somebody may
-- see, directs or leads.
--
-- Callers (staging pg_policy, pg_proc and pg_views, and the app, 2026-10-02).
-- None passes another person's id on a path that works today:
--   es_superadmin
--     * solicitudes_grupo: solicitudes_select and solicitudes_update pass
--       get_my_internal_id(), the session person.
--     * contar_solicitudes_pendientes and es_director_general_de_grupo pass the
--       usuarios.id of their p_auth_id, which their own guard pins to
--       auth.uid() unless the caller is service_role.
--     * 19 policies pass auth.uid(), a session id where the function expects
--       usuarios.id: audit_grupo_miembros (1), campus (3), campus_localidades
--       (3), configuracion_grupos_vida (1), director_general_directores (4),
--       director_general_segmentos (1), tipos_grupo (2), usuario_campus (4).
--       So do lib/actions/geocodificar.actions.ts and
--       app/(auth)/configuracion/grupos-vida/page.tsx (rpc with user.id).
--       They are always false today and stay false: a session id gets past
--       the guard only on a row whose id equals its own auth_id, and there
--       the answer is the same as before (2 such rows on staging, without
--       roles; no row's id equals another row's auth_id). Batch L5 moves them
--       to the internal id.
--   puede_ver_grupo
--     * grupos: grupos_select_scoped_authenticated passes actor.id, the
--       usuarios row of auth.uid().
--     * grupo_miembros: "Los usuarios pueden ver los miembros de los grupos
--       permitidos" passes get_my_internal_id().
--     * obtener_auditoria_miembros, obtener_detalle_grupo,
--       obtener_eventos_con_notas, obtener_grupos_para_usuario,
--       obtener_ranking_asistencia_grupo, obtener_reporte_asistencia_grupo and
--       puede_gestionar_miembros pass the usuarios.id of their p_auth_id,
--       pinned to auth.uid() by their guard unless service_role.
--   es_director_de_grupo
--     * grupo_miembros: "Solo directores pueden gestionar miembros en grupos"
--       (INSERT, UPDATE, DELETE) pass get_my_internal_id().
--     * puede_ver_usuario passes its p_viewer_id, which both usuarios
--       policies fill with auth.uid(): the session-id case above, unchanged.
--   es_lider_de_grupo
--     * puede_ver_usuario only, as above.
--   No view calls them. service_role skips the guard, as in the guarded
--   functions of phase 2, so the service client keeps its answers.
--
-- What changes in the bodies:
--   * LANGUAGE plpgsql with the guard as the first IF, the form of
--     tiene_rol_de_liderazgo in 20261002150000. puede_ver_grupo already was
--     plpgsql: after the guard its body is the live one, line for line.
--   * The session person is read inline, through the unique index
--     unique_auth_id_nonnull. get_my_internal_id() does the same lookup and is
--     safe to call (definer, search_path pinned, reads only auth.uid()); as the
--     guard it measured about 10% cheaper on staging (0.028 against 0.032 ms
--     per call of es_lider_de_grupo: an IF without a subquery runs as a plpgsql
--     simple expression). But it is VOLATILE: es_superadmin is STABLE and would
--     take a new snapshot on every call, which 20261002150000 avoided for
--     tiene_rol_de_liderazgo. Inlining also keeps the four helpers free of a
--     function outside this batch.
--   * es_superadmin and puede_ver_grupo get search_path pinned to public (they
--     had none); es_superadmin's tables are now schema-qualified.
--   * A NULL argument still returns false: it matches no row.
--   * Cost: the guard adds one query per call. Prototypes on staging, 2000
--     calls in one statement as a policy makes them: es_lider_de_grupo 0.010
--     to 0.032 ms per call, es_superadmin 0.015 to 0.039 ms (part of it is
--     plpgsql against the old sql bodies). The suite
--     ayudantes-persona-sesion.test.sql prints old and new for all four.
--
-- What does not change: signatures, parameter names, return type, the definer
-- flag, owner, volatility (es_superadmin STABLE, the other three VOLATILE), not
-- STRICT, and grants (restated at the end, today's state: no anon, no PUBLIC).
--
-- Rollback: puede_ver_grupo from 20260929150000_gdv_dg_regla_en_grupos.sql (the
-- live body is byte-identical). The other three were never in a migration of
-- this repository; recreate them with CREATE OR REPLACE as LANGUAGE sql,
-- definer, with these bodies:
--   es_superadmin(p_auth_uid uuid), STABLE, no search_path:
--     SELECT EXISTS (SELECT 1 FROM usuario_roles ur
--       JOIN roles_sistema rs ON rs.id = ur.rol_id
--       WHERE ur.usuario_id = p_auth_uid AND rs.nombre_interno IN ('admin', 'pastor'));
--   es_director_de_grupo(p_user_id uuid, p_grupo_id uuid), VOLATILE,
--   search_path public:
--     SELECT EXISTS (SELECT 1 FROM public.grupos g
--       JOIN public.segmento_lideres sl ON g.segmento_id = sl.segmento_id
--       WHERE g.id = p_grupo_id AND sl.usuario_id = p_user_id
--         AND sl.tipo_lider IN ('director_general', 'director_etapa'));
--   es_lider_de_grupo(p_user_id uuid, p_grupo_id uuid), VOLATILE,
--   search_path public:
--     SELECT EXISTS (SELECT 1 FROM public.grupo_miembros
--       WHERE usuario_id = p_user_id AND grupo_id = p_grupo_id
--         AND rol IN ('Líder', 'Colíder'));

CREATE OR REPLACE FUNCTION public.es_superadmin(p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session (the argument is usuarios.id);
  -- only service_role may ask about somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_auth_uid IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = p_auth_uid
      AND rs.nombre_interno IN ('admin', 'pastor')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  v_is_superior boolean := false;
  v_is_dg boolean := false;
  v_is_director_etapa boolean := false;
  v_is_grupo_futuro boolean := false;
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor: acceso total (incluye grupos inactivos/futuros)
  SELECT TRUE INTO v_is_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;

  IF v_is_superior THEN
    RETURN TRUE;
  END IF;

  -- Director General: acceso solo a los grupos que le da la regla única (gdv_dg_ve_grupo)
  SELECT TRUE INTO v_is_dg
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;

  IF v_is_dg THEN
    IF public.gdv_dg_ve_grupo(p_user_id, p_grupo_id) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Director de Etapa: acceso si está asignado explícitamente al grupo (incluye futuros)
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

  -- Líder/Colíder/Miembro: solo si pertenece al grupo Y el grupo NO es futuro
  SELECT EXISTS (
    SELECT 1 FROM public.grupos g
    JOIN public.temporadas t ON t.id = g.temporada_id
    WHERE g.id = p_grupo_id AND t.fecha_inicio > CURRENT_DATE
  ) INTO v_is_grupo_futuro;

  IF v_is_grupo_futuro THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.grupos g
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.id = p_grupo_id
        AND g.activo IS TRUE
        AND t.activa IS TRUE
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.es_director_de_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupos g
    JOIN public.segmento_lideres sl ON g.segmento_id = sl.segmento_id
    WHERE g.id = p_grupo_id
      AND sl.usuario_id = p_user_id
      AND sl.tipo_lider IN ('director_general', 'director_etapa')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.es_lider_de_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.usuario_id = p_user_id
      AND gm.grupo_id = p_grupo_id
      AND gm.rol IN ('Líder', 'Colíder')
  );
END;
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.es_superadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_ver_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_director_de_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_lider_de_grupo(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.es_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_director_de_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_lider_de_grupo(uuid, uuid) TO authenticated, service_role;
