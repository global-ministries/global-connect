-- Campus rule for the remaining global paths (follow-up of #619 / #620).
--
-- The rule (user decision): every person sees only their campus; the pastor
-- sees everything inside their campus; the system admin is the only global
-- role. A person's campuses are their usuario_campus rows. People with no
-- usuario_campus row are reached only by admin (and by the narrower lider /
-- miembro / self scopes that already reach them), as in #619.
--
-- What was still global for pastor (or director general) before this file:
--   * usuarios RLS: usuarios_can_view_profile_photos (20261003160000) let
--     admin, pastor and director-general read every row, and
--     puede_ver_usuario (20261003190000), the function of the policy
--     "Los usuarios pueden ver perfiles según su rol", let admin and pastor see
--     everybody.
--   * puede_editar_usuario (20261002120000): admin and pastor edit anybody.
--   * puede_gestionar_relacion_familiar (20260618203000): es_admin_o_pastor
--     manages the family relations of anybody (relaciones_usuarios write
--     policies, agregar/eliminar_relacion_familiar_segura,
--     buscar_usuarios_para_relacion_familiar).
--   * obtener_reporte_asistencia_usuario (20260930110000): admin, pastor and
--     director general read the attendance report of anybody.
--   * obtener_conyugue (20261003190000): admin, pastor, director general and
--     director de etapa read the spouse of anybody.
--   * puede_ver_direccion / puede_editar_direccion (20261004120000):
--     es_superadmin (admin or pastor) reads and edits every address.
--
-- What changes (every function keeps its signature, return type, language,
-- volatility, definer flag, search_path, identity check and grants; the
-- policy keeps its name, command, roles and permissiveness):
--   1. puede_ver_usuario: admin sees everybody; pastor and director general
--      see the people who share one of their campuses. Self, the director
--      general group branch, director de etapa and Líder / Colíder branches
--      are unchanged.
--   2. usuarios_can_view_profile_photos: self or admin. pastor and director
--      general now read usuarios rows through puede_ver_usuario (point 1).
--   3. puede_editar_usuario: admin edits anybody; pastor edits the people who
--      share one of their campuses. Self, lider, director de etapa and
--      director general (group scope) are unchanged.
--   4. puede_gestionar_relacion_familiar: only admin skips the per-person
--      check; pastor needs puede_editar_usuario over both people (point 3).
--   5. obtener_reporte_asistencia_usuario: step 2b is admin (any campus);
--      pastor and director general only for people who share one of their
--      campuses, the gate puede_ver_asistencia_persona already uses. The rest
--      of the function is copied verbatim.
--   6. obtener_conyugue: admin asks about anybody; pastor, director general
--      and director de etapa only when the person and the spouse share one of
--      their campuses. The Líder / Colíder branch and service_role are
--      unchanged.
--   7. puede_ver_direccion / puede_editar_direccion: only admin is global;
--      pastor reaches an address through the person (points 1 and 3, and
--      puede_ver_usuario_ficha) or the group (puede_ver_grupo /
--      puede_editar_grupo, unchanged).
--
-- Not changed here: es_superadmin and es_admin_o_pastor (organization
-- settings policies), usuario_campus policies, puede_ver_grupo /
-- puede_editar_grupo and the other Grupos de Vida, Niños, Dream Team,
-- Estudiantes and Talleres helpers, which keep their own scopes.
--
-- Production holds one campus and every person has a usuario_campus row
-- (#619 backfill and the usuarios_campus_por_defecto trigger), so nobody sees
-- or edits a different set today.
--
-- Rollback: re-apply, in this order,
--   * puede_ver_usuario and obtener_conyugue from
--     20261003190000_quien_ve_a_quien.sql;
--   * the usuarios_can_view_profile_photos DROP / CREATE from
--     20261003160000_identidades_en_politicas.sql;
--   * puede_editar_usuario from 20261002120000_definer_identidad_predicados.sql;
--   * puede_gestionar_relacion_familiar from
--     20260618203000_harden_judgment_day_critical_security.sql;
--   * obtener_reporte_asistencia_usuario (section 6) from
--     20260930110000_usuarios_directores_ven_a_todos.sql;
--   * puede_ver_direccion and puede_editar_direccion from
--     20261004120000_direcciones_y_usuarios_columnas.sql.
-- No row is written by this file.

-- 1. Who sees whom (usuarios RLS) ----------------------------------------------
CREATE OR REPLACE FUNCTION public.puede_ver_usuario(p_viewer_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_viewer_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id = p_target_user_id THEN
    RETURN true;
  END IF;

  -- admin sees every campus.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno = 'admin') THEN
    RETURN true;
  END IF;

  -- pastor and director general see the people who share one of their
  -- campuses.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno IN ('pastor', 'director-general'))
     AND EXISTS (SELECT 1 FROM public.usuario_campus mi_uc
                   JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
                  WHERE mi_uc.usuario_id = p_viewer_id
                    AND su_uc.usuario_id = p_target_user_id) THEN
    RETURN true;
  END IF;

  -- Director general: members of the groups the single DG rule gives them.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno = 'director-general')
     AND EXISTS (SELECT 1 FROM public.grupo_miembros gm
                  WHERE gm.usuario_id = p_target_user_id
                    AND public.gdv_dg_ve_grupo(p_viewer_id, gm.grupo_id)) THEN
    RETURN true;
  END IF;

  -- Director de etapa: members of the groups assigned to them.
  IF EXISTS (SELECT 1 FROM public.grupo_miembros gm
               JOIN public.director_etapa_grupos deg ON deg.grupo_id = gm.grupo_id
               JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
              WHERE gm.usuario_id = p_target_user_id
                AND sl.usuario_id = p_viewer_id
                AND sl.tipo_lider = 'director_etapa') THEN
    RETURN true;
  END IF;

  -- Líder or Colíder: members of their groups.
  RETURN EXISTS (SELECT 1 FROM public.grupo_miembros lead
                   JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                  WHERE lead.usuario_id = p_viewer_id
                    AND lead.rol IN ('Líder', 'Colíder')
                    AND gm.usuario_id = p_target_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_usuario(uuid, uuid) TO authenticated, service_role;

-- 2. The second SELECT policy on usuarios --------------------------------------
DROP POLICY usuarios_can_view_profile_photos ON public.usuarios;
CREATE POLICY usuarios_can_view_profile_photos ON public.usuarios
  FOR SELECT TO public
  USING ((auth.uid() = auth_id) OR (EXISTS ( SELECT 1
         FROM (usuario_roles ur JOIN roles_sistema rs ON ((ur.rol_id = rs.id)))
         WHERE ((ur.usuario_id = ( SELECT get_my_internal_id())) AND (rs.nombre_interno = 'admin'::text)))));

-- 3. Who may edit a person ----------------------------------------------------
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

  -- Regla global: Admin (todos los campus)
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Pastor edita a las personas que comparten uno de sus campus
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'pastor'
  ) AND EXISTS (
    SELECT 1
    FROM public.usuario_campus mi_uc
    JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
    WHERE mi_uc.usuario_id = v_actor_id
      AND su_uc.usuario_id = p_target_user_id
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

REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated, service_role;

-- 4. Who may manage a family relation -------------------------------------------
CREATE OR REPLACE FUNCTION public.puede_gestionar_relacion_familiar(
  p_auth_id uuid,
  p_usuario1_id uuid,
  p_usuario2_id uuid
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
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  IF p_usuario1_id IS NULL OR p_usuario2_id IS NULL OR p_usuario1_id = p_usuario2_id THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Only admin manages the relations of every campus; everybody else (pastor
  -- included) needs edit rights over both people.
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN public.puede_editar_usuario(p_auth_id, p_usuario1_id)
     AND public.puede_editar_usuario(p_auth_id, p_usuario2_id);
END;
$$;

REVOKE ALL ON FUNCTION public.puede_gestionar_relacion_familiar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_relacion_familiar(uuid, uuid, uuid) TO authenticated, service_role;

-- 5. Attendance report of one person ------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_asistencia_usuario(
  p_usuario_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL::date,
  p_fecha_fin date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request_role text := auth.role();
  v_auth_user_id uuid;
  v_puede_ver boolean := false;
  v_es_admin boolean := false;
  v_result jsonb;
  v_kpis jsonb;
  v_series_temporales jsonb;
  v_historial_eventos jsonb;
BEGIN
  -- 0. The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_auth_id) THEN
    RETURN jsonb_build_object('error', 'Sin permisos para ver este reporte');
  END IF;

  -- 1. Obtener el user_id interno desde auth_id del solicitante
  SELECT id INTO v_auth_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario solicitante no encontrado');
  END IF;

  -- 2. Validar permisos: el solicitante puede ver el reporte si:

  -- 2a. Es el mismo usuario
  IF v_auth_user_id = p_usuario_id THEN
    v_puede_ver := true;
  END IF;

  -- 2b. admin (todos los campus); pastor y director-general solo para las
  -- personas que comparten uno de sus campus.
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_auth_user_id
        AND rs.nombre_interno = 'admin'
    ) OR (
      EXISTS (
        SELECT 1 FROM public.usuario_roles ur
        JOIN public.roles_sistema rs ON rs.id = ur.rol_id
        WHERE ur.usuario_id = v_auth_user_id
          AND rs.nombre_interno IN ('pastor', 'director-general')
      ) AND EXISTS (
        SELECT 1 FROM public.usuario_campus mi_uc
        JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
        WHERE mi_uc.usuario_id = v_auth_user_id
          AND su_uc.usuario_id = p_usuario_id
      )
    ) INTO v_es_admin;

    IF v_es_admin THEN
      v_puede_ver := true;
    END IF;
  END IF;

  -- 2c. Es líder de un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.grupo_miembros gm_lider
      JOIN public.grupo_miembros gm_miembro ON gm_miembro.grupo_id = gm_lider.grupo_id
      WHERE gm_lider.usuario_id = v_auth_user_id
        AND gm_lider.rol = 'Líder'
        AND gm_miembro.usuario_id = p_usuario_id
    ) INTO v_puede_ver;
  END IF;

  -- 2d. Es director de etapa asignado a un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl
        ON sl.id = deg.director_etapa_id
       AND sl.usuario_id = v_auth_user_id
       AND sl.tipo_lider = 'director_etapa'
      JOIN public.grupo_miembros gm ON gm.grupo_id = deg.grupo_id
      WHERE gm.usuario_id = p_usuario_id
        AND gm.fecha_salida IS NULL
    ) INTO v_puede_ver;
  END IF;

  -- 2e. Es familiar directo
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.relaciones_usuarios ru
      WHERE (ru.usuario1_id = v_auth_user_id AND ru.usuario2_id = p_usuario_id)
         OR (ru.usuario1_id = p_usuario_id AND ru.usuario2_id = v_auth_user_id)
    ) INTO v_puede_ver;
  END IF;

  -- Si no tiene permisos, retornar error con debug info
  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object(
      'error', 'Sin permisos para ver este reporte',
      'debug', jsonb_build_object(
        'v_auth_user_id', v_auth_user_id,
        'p_usuario_id', p_usuario_id,
        'v_es_admin', v_es_admin
      )
    );
  END IF;

  -- 3. Establecer fechas por defecto si no se proporcionan (últimos 12 meses)
  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '12 months';
  END IF;

  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  -- 4. Calcular KPIs
  WITH eventos_usuario AS (
    SELECT
      a.id,
      a.presente,
      a.evento_grupo_id,
      eg.grupo_id,
      eg.fecha,
      g.nombre AS grupo_nombre
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  kpis_calc AS (
    SELECT
      -- Porcentaje de asistencia general
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia_general,
      -- Total de grupos activos (grupos donde ha tenido al menos un evento)
      COUNT(DISTINCT grupo_id) AS total_grupos_activos,
      -- Grupo más frecuente
      (
        SELECT jsonb_build_object(
          'id', grupo_id,
          'nombre', grupo_nombre
        )
        FROM eventos_usuario
        GROUP BY grupo_id, grupo_nombre
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS grupo_mas_frecuente,
      -- Última fecha de asistencia
      (
        SELECT MAX(fecha)
        FROM eventos_usuario
        WHERE presente = true
      ) AS ultima_asistencia_fecha
    FROM eventos_usuario
  )
  SELECT jsonb_build_object(
    'porcentaje_asistencia_general', porcentaje_asistencia_general,
    'total_grupos_activos', total_grupos_activos,
    'grupo_mas_frecuente', COALESCE(grupo_mas_frecuente, jsonb_build_object('id', null, 'nombre', 'N/D')),
    'ultima_asistencia_fecha', ultima_asistencia_fecha
  )
  INTO v_kpis
  FROM kpis_calc;

  -- 5. Calcular series temporales (agrupadas por mes)
  WITH eventos_con_mes AS (
    SELECT
      DATE_TRUNC('month', eg.fecha::timestamp)::date AS mes,
      a.presente
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  series_mensuales AS (
    SELECT
      mes,
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia
    FROM eventos_con_mes
    GROUP BY mes
    ORDER BY mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', mes,
      'porcentaje_asistencia', porcentaje_asistencia
    )
  )
  INTO v_series_temporales
  FROM series_mensuales;

  -- 6. Obtener historial de eventos
  WITH historial AS (
    SELECT
      eg.fecha,
      g.nombre AS grupo_nombre,
      g.id AS grupo_id,
      eg.tema,
      CASE WHEN a.presente THEN 'Presente' ELSE 'Ausente' END AS estado
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    ORDER BY eg.fecha DESC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'grupo_nombre', grupo_nombre,
      'grupo_id', grupo_id,
      'tema', COALESCE(tema, 'Sin tema'),
      'estado', estado,
      'motivo_ausencia', null
    )
  )
  INTO v_historial_eventos
  FROM historial;

  -- 7. Construir el resultado final
  v_result := jsonb_build_object(
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'series_temporales', COALESCE(v_series_temporales, '[]'::jsonb),
    'historial_eventos', COALESCE(v_historial_eventos, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_reporte_asistencia_usuario(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_asistencia_usuario(uuid, uuid, date, date) TO authenticated, service_role;

-- 6. Spouse of a person ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_conyugue(p_usuario_id uuid)
RETURNS TABLE(id uuid, nombre text, apellido text, foto_perfil_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.nombre, u.apellido, u.foto_perfil_url
  FROM public.relaciones_usuarios ru
  JOIN public.usuarios u ON u.id = CASE
    WHEN ru.usuario1_id = p_usuario_id THEN ru.usuario2_id
    ELSE ru.usuario1_id
  END
  WHERE (ru.usuario1_id = p_usuario_id OR ru.usuario2_id = p_usuario_id)
    AND ru.tipo_relacion = 'conyuge'
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.usuarios me
        WHERE me.auth_id = auth.uid()
          AND (
            -- admin: every campus.
            EXISTS (SELECT 1 FROM public.usuario_roles ur
                      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                     WHERE ur.usuario_id = me.id
                       AND rs.nombre_interno = 'admin')
            -- pastor and directors: the person and the spouse share one of
            -- their campuses.
            OR (EXISTS (SELECT 1 FROM public.usuario_roles ur
                          JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                         WHERE ur.usuario_id = me.id
                           AND rs.nombre_interno IN ('pastor', 'director-general', 'director-etapa'))
                AND EXISTS (SELECT 1 FROM public.usuario_campus mi_uc
                              JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
                             WHERE mi_uc.usuario_id = me.id
                               AND su_uc.usuario_id = p_usuario_id)
                AND EXISTS (SELECT 1 FROM public.usuario_campus mi_uc
                              JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
                             WHERE mi_uc.usuario_id = me.id
                               AND su_uc.usuario_id = u.id))
            OR EXISTS (SELECT 1 FROM public.grupo_miembros lead
                         JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                        WHERE lead.usuario_id = me.id
                          AND lead.rol IN ('Líder', 'Colíder')
                          AND gm.usuario_id = p_usuario_id)
          )
      )
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_conyugue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_conyugue(uuid) TO authenticated, service_role;

-- 7. Addresses -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.puede_ver_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  -- Only admin reads every address; pastor reaches one through a person or a
  -- group below.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = v_me
                AND rs.nombre_interno = 'admin') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_ver_grupo(v_me, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_direccion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_editar_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  -- Only admin edits every address; pastor reaches one through a person or a
  -- group below.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = v_me
                AND rs.nombre_interno = 'admin') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_editar_grupo(v_auth, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_editar_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_direccion(uuid) TO authenticated, service_role;
