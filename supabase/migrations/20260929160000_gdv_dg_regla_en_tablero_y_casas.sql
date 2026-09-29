-- Grupos de Vida — the dashboard, risk, casas and users functions use the single
-- director general rule.
--
-- Nine functions scoped the director general on their own, and not the same way:
-- most showed the whole segment, four narrowed to the directores de etapa listed
-- in dg_directores_etapa whenever the person had any, and the campus overload of
-- the KPI function treated the role like admin. Each one is recreated from its
-- LIVE definition (pg_get_functiondef on staging) with ONLY the director general
-- clause replaced by gdv_dg_ve_grupo / gdv_dg_grupos_visibles (see
-- 20260929140000_gdv_dg_alcance.sql). Every other branch, filter, ordering and
-- comment is as it was; language, volatility, security definer, search_path,
-- signature, return type and grants are unchanged.
--
-- Not touched: the dead one-argument obtener_kpis_grupos_para_usuario(uuid) (it
-- cannot be called: it collides with the two-argument overload).
--
-- Known and left alone: get_personas_under_me compares
-- director_etapa_grupos.director_etapa_id (a segmento_lideres.id) with a usuarios.id
-- in its director de etapa branch, so that branch never matches. It is not part of
-- this change.

-- Director general clause. Before: the group was active and not deleted and either
-- its segment was one of the person's director_general_segmentos or it belonged to
-- a director de etapa listed in dg_directores_etapa (either was enough). Now: the
-- group is active and not deleted and gdv_dg_ve_grupo(p_user_id, g.id).
create or replace function public.casas_map_director_general_can_view_group(p_user_id uuid, p_grupo_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupos g
    WHERE g.id = p_grupo_id
      AND g.activo = true
      AND g.eliminado = false
      AND public.gdv_dg_ve_grupo(p_user_id, g.id)
  );
END;
$function$;

-- Director general clause. Before: if the person had any dg_directores_etapa row,
-- the casas of the members of the groups of those directores; otherwise the casas
-- of the members of the groups of their segments. Now: the casas of the members of
-- the groups in gdv_dg_grupos_visibles(v_user_id). The person's own casas stay
-- included; v_tiene_des is no longer needed.
create or replace function public.obtener_casas_visibles_ids(p_auth_id uuid)
 returns uuid[]
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_pastor boolean := false;
  v_es_dg boolean := false;
  v_es_de boolean := false;
  v_es_lider boolean := false;
  v_result uuid[];
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth_id_required' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'auth_id_spoofed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN RETURN '{}'; END IF;

  SELECT
    COALESCE(bool_or(rs.nombre_interno = 'admin'), false),
    COALESCE(bool_or(rs.nombre_interno = 'pastor'), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-general'), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-etapa'), false),
    COALESCE(bool_or(rs.nombre_interno = 'lider'), false)
  INTO v_es_admin, v_es_pastor, v_es_dg, v_es_de, v_es_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON ur.rol_id = rs.id
  WHERE ur.usuario_id = v_user_id;

  IF v_es_admin OR v_es_pastor THEN
    SELECT array_agg(ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca;
    RETURN COALESCE(v_result, '{}');
  END IF;

  v_result := '{}';

  IF v_es_dg THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      WHERE g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
      AND g.activo = true AND g.eliminado = false
    )
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  IF v_es_de THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.segmento_id IN (
        SELECT sl.segmento_id
        FROM public.segmento_lideres sl
        WHERE sl.usuario_id = v_user_id
          AND sl.tipo_lider = 'director_etapa'
      )
      AND t.activa = true
      AND g.activo = true AND g.eliminado = false
    )
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  IF v_es_lider THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm2.usuario_id
      FROM public.grupo_miembros gm2
      WHERE gm2.grupo_id IN (
        SELECT gm.grupo_id
        FROM public.grupo_miembros gm
        JOIN public.grupos g ON g.id = gm.grupo_id
        WHERE gm.usuario_id = v_user_id
          AND gm.rol = 'Líder'
          AND g.activo = true AND g.eliminado = false
          AND g.estado_ciclo = 'activo'
      )
    )
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  SELECT array_agg(ca.id)
  INTO v_result
  FROM public.casas_anfitrionas ca
  WHERE ca.usuario_id = v_user_id;

  RETURN COALESCE(v_result, '{}');
END;
$function$;

-- Director general clause. Before: if the person had any dg_directores_etapa row,
-- the target had to be an active member of an active group of one of those
-- directores; otherwise of an active group of one of their segments. Now: an
-- active member of an active group with gdv_dg_ve_grupo(v_user_id, g.id);
-- v_has_director_etapa_assignments is no longer needed.
create or replace function public.puede_crear_casa_anfitriona_para(p_auth_id uuid, p_usuario_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
  v_is_admin_or_pastor boolean := false;
  v_is_director_general boolean := false;
  v_is_director_etapa boolean := false;
  v_is_lider boolean := false;
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
    RETURN EXISTS (
      SELECT 1
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      WHERE public.gdv_dg_ve_grupo(v_user_id, g.id)
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
$function$;

-- Director general clause. Before: the groups of the person's segments only (the
-- risk dashboard never applied the dg_directores_etapa filter). Now: the groups in
-- gdv_dg_grupos_visibles(v_user_id).
create or replace function public.obtener_dashboard_riesgo(p_auth_id uuid, p_campus_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid; v_rol text; v_resultado jsonb;
BEGIN
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'Usuario no encontrado'); END IF;
  SELECT rs.nombre_interno INTO v_rol FROM usuario_roles ur JOIN roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY CASE rs.nombre_interno WHEN 'admin' THEN 1 WHEN 'pastor' THEN 2 WHEN 'director-general' THEN 3 WHEN 'director-etapa' THEN 4 END LIMIT 1;
  IF v_rol IS NULL THEN RETURN jsonb_build_object('error', 'Sin permisos'); END IF;

  WITH grupos_visibles AS (
    SELECT g.id AS grupo_id FROM grupos g
    WHERE g.activo = true AND (p_campus_id IS NULL OR g.campus_id = p_campus_id) AND (
      v_rol IN ('admin', 'pastor')
      OR (v_rol = 'director-general' AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
      OR (v_rol = 'director-etapa' AND g.id IN (
        SELECT deg.grupo_id FROM director_etapa_grupos deg
        JOIN segmento_lideres sl ON deg.director_etapa_id = sl.id
        WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'))
    )
  ),
  stats AS (
    SELECT COUNT(DISTINCT gv.grupo_id) AS total_grupos,
      COUNT(DISTINCT gv.grupo_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM eventos_grupo eg WHERE eg.grupo_id = gv.grupo_id AND eg.fecha >= (CURRENT_DATE - interval '7 days'))) AS grupos_sin_reunion_esta_semana,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'critico') AS miembros_criticos,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'riesgo') AS miembros_en_riesgo,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'atencion') AS miembros_en_atencion,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'normal') AS miembros_sanos,
      COUNT(DISTINCT v.usuario_id) AS total_miembros,
      (SELECT COUNT(*) FROM solicitudes_grupo sg WHERE sg.grupo_id IN (SELECT grupo_id FROM grupos_visibles) AND sg.estado = 'pendiente') AS solicitudes_pendientes,
      COALESCE(SUM(eg2.conteo_visitantes) FILTER (WHERE eg2.fecha >= date_trunc('month', now())), 0) AS visitantes_del_mes
    FROM grupos_visibles gv LEFT JOIN v_salud_miembros_grupo v ON v.grupo_id = gv.grupo_id LEFT JOIN eventos_grupo eg2 ON eg2.grupo_id = gv.grupo_id
  ),
  distribucion AS (
    SELECT jsonb_agg(jsonb_build_object('nivel', sub.nivel, 'cantidad', sub.cantidad, 'porcentaje', CASE WHEN sub.total > 0 THEN ROUND(sub.cantidad::numeric / sub.total * 100, 1) ELSE 0 END)) AS datos
    FROM (SELECT unnest(ARRAY['normal', 'atencion', 'riesgo', 'critico']) AS nivel, unnest(ARRAY[COUNT(*) FILTER (WHERE v.nivel_riesgo = 'normal'), COUNT(*) FILTER (WHERE v.nivel_riesgo = 'atencion'), COUNT(*) FILTER (WHERE v.nivel_riesgo = 'riesgo'), COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico')]) AS cantidad, COUNT(*) AS total FROM v_salud_miembros_grupo v WHERE v.grupo_id IN (SELECT grupo_id FROM grupos_visibles)) sub
  ),
  top_riesgo AS (
    SELECT jsonb_agg(sub ORDER BY sub.criticos DESC, sub.riesgo_total DESC) AS top_5
    FROM (SELECT g.id AS grupo_id, g.nombre AS grupo_nombre, COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico') AS criticos, COUNT(*) FILTER (WHERE v.nivel_riesgo IN ('riesgo', 'critico')) AS riesgo_total, COUNT(*) AS total_miembros FROM grupos g JOIN v_salud_miembros_grupo v ON v.grupo_id = g.id WHERE g.id IN (SELECT grupo_id FROM grupos_visibles) GROUP BY g.id, g.nombre HAVING COUNT(*) FILTER (WHERE v.nivel_riesgo IN ('riesgo', 'critico')) > 0 ORDER BY criticos DESC, riesgo_total DESC LIMIT 5) sub
  ),
  miembros_crit AS (
    SELECT jsonb_agg(jsonb_build_object('usuario_id', v.usuario_id, 'nombre', v.nombre_completo, 'grupo_nombre', g.nombre, 'grupo_id', g.id, 'semanas_ausente', v.semanas_ausente, 'pct_asistencia', v.pct_asistencia, 'nivel_riesgo', v.nivel_riesgo) ORDER BY v.semanas_ausente DESC, v.pct_asistencia ASC) AS datos
    FROM (SELECT * FROM v_salud_miembros_grupo WHERE nivel_riesgo IN ('critico', 'riesgo') AND grupo_id IN (SELECT grupo_id FROM grupos_visibles) ORDER BY semanas_ausente DESC, pct_asistencia ASC LIMIT 10) v JOIN grupos g ON g.id = v.grupo_id
  ),
  segmentos_riesgo AS (
    SELECT jsonb_agg(jsonb_build_object('segmento_nombre', sub.segmento_nombre, 'criticos', sub.criticos, 'riesgo', sub.en_riesgo, 'atencion', sub.en_atencion, 'normal', sub.normales, 'total', sub.total_seg) ORDER BY sub.criticos DESC, sub.en_riesgo DESC) AS datos
    FROM (SELECT COALESCE(s.nombre, 'Sin segmento') AS segmento_nombre, COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico') AS criticos, COUNT(*) FILTER (WHERE v.nivel_riesgo = 'riesgo') AS en_riesgo, COUNT(*) FILTER (WHERE v.nivel_riesgo = 'atencion') AS en_atencion, COUNT(*) FILTER (WHERE v.nivel_riesgo = 'normal') AS normales, COUNT(*) AS total_seg FROM v_salud_miembros_grupo v JOIN grupos g ON g.id = v.grupo_id LEFT JOIN segmentos s ON s.id = g.segmento_id WHERE g.id IN (SELECT grupo_id FROM grupos_visibles) GROUP BY s.nombre) sub
  ),
  sin_reunion AS (
    SELECT jsonb_agg(jsonb_build_object('grupo_id', sub.grupo_id, 'grupo_nombre', sub.grupo_nombre, 'lider_nombre', sub.lider_nombre) ORDER BY sub.grupo_nombre) AS datos
    FROM (SELECT g.id AS grupo_id, g.nombre AS grupo_nombre, COALESCE((SELECT u.nombre || ' ' || u.apellido FROM grupo_miembros gm JOIN usuarios u ON u.id = gm.usuario_id WHERE gm.grupo_id = g.id AND gm.rol = 'Líder' AND gm.estado = 'activo' LIMIT 1), 'Sin líder') AS lider_nombre FROM grupos g WHERE g.id IN (SELECT grupo_id FROM grupos_visibles) AND NOT EXISTS (SELECT 1 FROM eventos_grupo eg WHERE eg.grupo_id = g.id AND eg.fecha >= (CURRENT_DATE - interval '7 days')) ORDER BY g.nombre LIMIT 10) sub
  ),
  tendencia AS (
    SELECT jsonb_agg(jsonb_build_object('semana', to_char(semana, 'DD Mon'), 'pct', CASE WHEN total > 0 THEN ROUND(presentes::numeric / total * 100, 1) ELSE 0 END) ORDER BY semana) AS datos
    FROM (SELECT date_trunc('week', eg.fecha)::date AS semana, COUNT(*) FILTER (WHERE a.tipo_presencia IN ('presente', 'tarde')) AS presentes, COUNT(*) AS total FROM asistencia a JOIN eventos_grupo eg ON eg.id = a.evento_grupo_id WHERE eg.fecha >= now() - interval '4 weeks' AND eg.grupo_id IN (SELECT grupo_id FROM grupos_visibles) GROUP BY 1) sub
  )
  SELECT jsonb_build_object(
    'total_grupos', s.total_grupos, 'grupos_sin_reunion_esta_semana', s.grupos_sin_reunion_esta_semana,
    'miembros_criticos', s.miembros_criticos, 'miembros_en_riesgo', s.miembros_en_riesgo,
    'miembros_en_atencion', s.miembros_en_atencion, 'miembros_sanos', s.miembros_sanos,
    'total_miembros', s.total_miembros, 'solicitudes_pendientes', s.solicitudes_pendientes,
    'visitantes_del_mes', s.visitantes_del_mes,
    'top_5_grupos_riesgo', COALESCE(tr.top_5, '[]'::jsonb),
    'tendencia_asistencia_4_semanas', COALESCE(t.datos, '[]'::jsonb),
    'distribucion_riesgo', COALESCE(dr.datos, '[]'::jsonb),
    'miembros_criticos_detalle', COALESCE(mc.datos, '[]'::jsonb),
    'segmentos_riesgo', COALESCE(sr.datos, '[]'::jsonb),
    'grupos_sin_reunion_detalle', COALESCE(snr.datos, '[]'::jsonb)
  ) INTO v_resultado FROM stats s CROSS JOIN top_riesgo tr CROSS JOIN tendencia t CROSS JOIN distribucion dr CROSS JOIN miembros_crit mc CROSS JOIN segmentos_riesgo sr CROSS JOIN sin_reunion snr;
  RETURN v_resultado;
END; $function$;

-- Director general clause. Before: if the person had any dg_directores_etapa row,
-- only the groups of those directores; otherwise the groups of their segments.
-- Now: the groups in gdv_dg_grupos_visibles(v_user_id); v_tiene_des is no longer
-- needed.
create or replace function public.obtener_miembros_en_riesgo(p_auth_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v_user_id uuid; v_rol text; v_result jsonb;
BEGIN
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  SELECT rs.nombre_interno INTO v_rol FROM usuario_roles ur JOIN roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY CASE rs.nombre_interno WHEN 'admin' THEN 1 WHEN 'pastor' THEN 2 WHEN 'director-general' THEN 3 WHEN 'director-etapa' THEN 4 END LIMIT 1;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'Sin permisos para acceder a este recurso'; END IF;
  WITH grupos_visibles AS (
    SELECT g.id AS grupo_id FROM grupos g
    WHERE g.activo = true AND (
      v_rol IN ('admin', 'pastor')
      OR (v_rol = 'director-general' AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
      OR (v_rol = 'director-etapa' AND g.id IN (
        SELECT deg.grupo_id FROM director_etapa_grupos deg JOIN segmento_lideres sl ON deg.director_etapa_id = sl.id WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'))
    )
  )
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.semanas_ausente DESC), '[]'::jsonb) INTO v_result
  FROM (SELECT v.usuario_id, v.nombre_completo, v.grupo_id, g.nombre AS grupo_nombre, v.rol, v.semanas_ausente, v.pct_asistencia, v.nivel_riesgo, v.ultima_vez_presente
    FROM v_salud_miembros_grupo v JOIN grupos g ON g.id = v.grupo_id
    WHERE v.nivel_riesgo != 'normal' AND v.grupo_id IN (SELECT grupo_id FROM grupos_visibles)
    ORDER BY CASE v.nivel_riesgo WHEN 'critico' THEN 1 WHEN 'riesgo' THEN 2 WHEN 'atencion' THEN 3 END, v.semanas_ausente DESC LIMIT 500) q;
  RETURN v_result;
END; $function$;

-- Director general clause. Before: the group's segment had to be one of the
-- person's director_general_segmentos in every place the function scoped the
-- director general (group counts, members, attendance, trend, risk list, activity
-- feed, birthdays and the segment distribution). Now: the group is in
-- gdv_dg_grupos_visibles(v_user_id). In the segment distribution only the groups
-- the rule returns are counted, so a segment with none of them is no longer listed.
create or replace function public.obtener_datos_dashboard(p_auth_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
  v_rol_nombre text;
  v_is_admin_pastor boolean := false;
  v_is_dg boolean := false;
  v_total_miembros int := 0;
  v_total_miembros_hace_30 int := 0;
  v_variacion_miembros numeric := 0;
  v_asistencia_semanal numeric := 0;
  v_grupos_activos int := 0;
  v_nuevos_miembros_mes int := 0;
  v_actividad jsonb := '[]'::jsonb;
  v_cumpleanos jsonb := '[]'::jsonb;
  v_riesgo jsonb := '[]'::jsonb;
  v_tendencia jsonb := '[]'::jsonb;
  v_distribucion jsonb := '[]'::jsonb;
  v_rep jsonb;
  v_grupos_asignados_ids uuid[];
  v_total_miembros_alcance int := 0;
  v_asistencia_semanal_alcance numeric := 0;
  v_grupos_activos_alcance int := 0;
  v_nuevos_miembros_mes_alcance int := 0;
  v_actividad_alcance jsonb := '[]'::jsonb;
  v_cumpleanos_alcance jsonb := '[]'::jsonb;
  v_riesgo_alcance jsonb := '[]'::jsonb;
  v_lideres_sin_reporte jsonb := '[]'::jsonb;
  v_semana_inicio date;
  v_semana_fin date;
  v_grupos_lider_ids uuid[];
  v_accion_requerida jsonb := NULL;
  v_kpis_grupo jsonb := '{}'::jsonb;
  v_proximos_cumpleanos_grupo jsonb := '[]'::jsonb;
  v_miembros_ausentes_recientemente jsonb := '[]'::jsonb;
  v_nuevos_miembros_grupo jsonb := '[]'::jsonb;
  v_evento_ultimo uuid;
  v_evento_ultimo_grupo uuid;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  SELECT rs.nombre_interno INTO v_rol_nombre
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
  ORDER BY CASE rs.nombre_interno
    WHEN 'admin' THEN 1 WHEN 'pastor' THEN 2 WHEN 'director-general' THEN 3
    WHEN 'director-etapa' THEN 4 WHEN 'lider' THEN 5 ELSE 6 END
  LIMIT 1;

  v_is_admin_pastor := v_rol_nombre IN ('admin', 'pastor');
  v_is_dg := v_rol_nombre = 'director-general';

  IF v_is_admin_pastor OR v_is_dg THEN
    WITH scoped_groups AS (
      SELECT g.id, g.nombre, g.fecha_creacion, g.segmento_id
      FROM public.grupos g
      WHERE g.activo = true
        AND COALESCE(g.eliminado, false) = false
        AND (
          v_is_admin_pastor
          OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
        )
    ), scoped_members AS (
      SELECT DISTINCT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN scoped_groups sg ON sg.id = gm.grupo_id
      WHERE gm.fecha_salida IS NULL
        AND COALESCE(gm.estado, 'activo') = 'activo'
    )
    SELECT COUNT(*) INTO v_total_miembros FROM scoped_members;

    WITH scoped_groups AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true AND COALESCE(g.eliminado, false) = false
        AND (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
    ), scoped_members AS (
      SELECT DISTINCT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN scoped_groups sg ON sg.id = gm.grupo_id
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE gm.fecha_salida IS NULL
        AND COALESCE(gm.estado, 'activo') = 'activo'
        AND u.fecha_registro <= (CURRENT_DATE - INTERVAL '30 days')
    )
    SELECT COUNT(*) INTO v_total_miembros_hace_30 FROM scoped_members;

    v_variacion_miembros := CASE WHEN v_total_miembros_hace_30 > 0 THEN ROUND(((v_total_miembros - v_total_miembros_hace_30)::numeric / v_total_miembros_hace_30::numeric) * 100, 1) ELSE 0 END;

    SELECT COUNT(*) INTO v_grupos_activos
    FROM public.grupos g
    WHERE g.activo = true AND COALESCE(g.eliminado, false) = false
      AND (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)));

    SELECT COUNT(DISTINCT gm.usuario_id) INTO v_nuevos_miembros_mes
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE u.fecha_registro >= (CURRENT_DATE - INTERVAL '30 days')
      AND gm.fecha_salida IS NULL
      AND COALESCE(gm.estado, 'activo') = 'activo'
      AND g.activo = true AND COALESCE(g.eliminado, false) = false
      AND (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)));

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    IF v_is_admin_pastor THEN
      BEGIN
        v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
        v_asistencia_semanal := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
      EXCEPTION WHEN OTHERS THEN
        v_asistencia_semanal := 0;
      END;
    ELSE
      WITH scoped_groups AS (
        SELECT g.id
        FROM public.grupos g
        WHERE g.activo = true
          AND COALESCE(g.eliminado, false) = false
          AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
      ), eventos_por_grupo AS (
        SELECT eg.grupo_id,
               COUNT(a.id) AS total_registros,
               COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
        FROM public.eventos_grupo eg
        JOIN scoped_groups sg ON sg.id = eg.grupo_id
        LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
        WHERE eg.fecha >= v_semana_inicio
          AND eg.fecha <= v_semana_fin
        GROUP BY eg.grupo_id
      )
      SELECT COALESCE(ROUND(AVG(CASE WHEN COALESCE(epg.total_registros, 0) > 0 THEN (epg.total_presentes::numeric / epg.total_registros::numeric) * 100 ELSE 0 END), 1), 0)
      INTO v_asistencia_semanal
      FROM scoped_groups sg
      LEFT JOIN eventos_por_grupo epg ON epg.grupo_id = sg.id;

      v_tendencia := (
        WITH semanas AS (
          SELECT v_semana_inicio - (n * INTERVAL '7 days') AS semana_inicio,
                 v_semana_fin - (n * INTERVAL '7 days') AS semana_fin
          FROM generate_series(0, 7) AS n
        ), trend AS (
          SELECT s.semana_inicio,
                 (
                   WITH scoped_groups AS (
                     SELECT g.id
                     FROM public.grupos g
                     WHERE g.activo = true
                       AND COALESCE(g.eliminado, false) = false
                       AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
                   ), eventos_por_grupo AS (
                     SELECT eg.grupo_id,
                            COUNT(a.id) AS total_registros,
                            COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
                     FROM public.eventos_grupo eg
                     JOIN scoped_groups sg ON sg.id = eg.grupo_id
                     LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
                     WHERE eg.fecha >= s.semana_inicio
                       AND eg.fecha <= s.semana_fin
                     GROUP BY eg.grupo_id
                   )
                   SELECT COALESCE(ROUND(AVG(CASE WHEN COALESCE(epg.total_registros, 0) > 0 THEN (epg.total_presentes::numeric / epg.total_registros::numeric) * 100 ELSE 0 END), 1), 0)
                   FROM scoped_groups sg
                   LEFT JOIN eventos_por_grupo epg ON epg.grupo_id = sg.id
                 ) AS porcentaje
          FROM semanas s
          ORDER BY s.semana_inicio
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('semana_inicio', semana_inicio, 'porcentaje', porcentaje) ORDER BY semana_inicio), '[]'::jsonb)
        FROM trend
      );
    END IF;

    v_actividad := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'texto', e.texto, 'fecha', e.fecha) ORDER BY e.fecha DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM (
          SELECT u.fecha_registro AS fecha, 'NUEVO_MIEMBRO'::text AS tipo,
                 (u.nombre || ' ' || u.apellido || ' se ha unido a la comunidad.') AS texto
          FROM public.usuarios u
          WHERE u.fecha_registro IS NOT NULL
            AND (v_is_admin_pastor OR EXISTS (
              SELECT 1 FROM public.grupo_miembros gm
              JOIN public.grupos g ON g.id = gm.grupo_id
              WHERE gm.usuario_id = u.id AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
            ))
          UNION ALL
          SELECT g.fecha_creacion, 'NUEVO_GRUPO'::text, ('Se creó el grupo "' || g.nombre || '".')
          FROM public.grupos g
          WHERE g.fecha_creacion IS NOT NULL
            AND (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
          UNION ALL
          SELECT gm.fecha_asignacion, 'USUARIO_A_GRUPO'::text,
                 (COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'') || ' añadido a ' || COALESCE(g.nombre,''))
          FROM public.grupo_miembros gm
          JOIN public.grupos g ON g.id = gm.grupo_id
          LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE gm.fecha_asignacion IS NOT NULL
            AND (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
          UNION ALL
          SELECT eg.fecha, 'REPORTE_ASISTENCIA'::text,
                 ('El grupo "' || COALESCE(g.nombre,'') || '" ha reportado su asistencia.')
          FROM public.eventos_grupo eg
          JOIN public.grupos g ON g.id = eg.grupo_id
          WHERE (v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id)))
        ) eventos
        ORDER BY fecha DESC
        LIMIT 5
      ) e
    );

    v_cumpleanos := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        WHERE u.fecha_nacimiento IS NOT NULL
          AND (v_is_admin_pastor OR EXISTS (
            SELECT 1 FROM public.grupo_miembros gm
            JOIN public.grupos g ON g.id = gm.grupo_id
            WHERE gm.usuario_id = u.id AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
          ))
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                    THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre_completo', nombre || ' ' || apellido, 'foto_url', foto_perfil_url, 'fecha_nacimiento', fecha_nacimiento, 'proximo', proximo) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    IF v_is_admin_pastor THEN
      v_riesgo := (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT risk.item AS item
          FROM jsonb_array_elements(COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb)) AS risk(item)
          LIMIT 5
        ) scoped_risk
      );
      v_tendencia := COALESCE(v_rep->'tendencia_asistencia_global', '[]'::jsonb);
    ELSE
      v_riesgo := (
        WITH scoped_groups AS (
          SELECT g.id, g.nombre
          FROM public.grupos g
          WHERE g.activo = true
            AND COALESCE(g.eliminado, false) = false
            AND g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
        ), eventos_agreg AS (
          SELECT eg.grupo_id,
                 COUNT(a.id) AS total_registros,
                 COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
          FROM public.eventos_grupo eg
          JOIN scoped_groups sg ON sg.id = eg.grupo_id
          LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
          WHERE eg.fecha >= v_semana_inicio
            AND eg.fecha <= v_semana_fin
          GROUP BY eg.grupo_id
        ), pct AS (
          SELECT sg.id AS grupo_id,
                 COALESCE(ROUND((CASE WHEN COALESCE(e.total_registros, 0) > 0 THEN (COALESCE(e.total_presentes, 0)::numeric / COALESCE(e.total_registros, 0)::numeric) * 100 ELSE 0 END), 1), 0) AS porcentaje,
                 COALESCE(e.total_registros, 0) AS total_registros
          FROM scoped_groups sg
          LEFT JOIN eventos_agreg e ON e.grupo_id = sg.id
        ), lideres AS (
          SELECT gm.grupo_id,
                 STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre || ' ' || u.apellido) AS nombres
          FROM public.grupo_miembros gm
          JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE gm.rol = 'Líder'
          GROUP BY gm.grupo_id
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.grupo_id, 'nombre', sg.nombre, 'porcentaje_asistencia', o.porcentaje, 'lideres', COALESCE(l.nombres, 'Sin líderes asignados')) ORDER BY o.porcentaje ASC, o.grupo_id), '[]'::jsonb)
        FROM (
          SELECT grupo_id, porcentaje
          FROM pct
          WHERE total_registros > 0
            AND porcentaje > 0
            AND porcentaje < 70
          ORDER BY porcentaje ASC, grupo_id
          LIMIT 5
        ) o
        JOIN scoped_groups sg ON sg.id = o.grupo_id
        LEFT JOIN lideres l ON l.grupo_id = o.grupo_id
      );
    END IF;

    v_distribucion := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'total_miembros', x.total_miembros) ORDER BY x.total_miembros DESC), '[]'::jsonb)
      FROM (
        SELECT s.id, COALESCE(s.nombre, 'Sin segmento') AS nombre, COUNT(DISTINCT gm.usuario_id) AS total_miembros
        FROM public.segmentos s
        JOIN public.grupos g ON g.segmento_id = s.id AND g.activo = true AND COALESCE(g.eliminado,false) = false
        LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = g.id AND gm.fecha_salida IS NULL AND COALESCE(gm.estado, 'activo') = 'activo'
        WHERE v_is_admin_pastor OR g.id IN (SELECT public.gdv_dg_grupos_visibles(v_user_id))
        GROUP BY s.id, s.nombre
      ) x
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'kpis_globales', jsonb_build_object(
          'total_miembros', jsonb_build_object('valor', v_total_miembros, 'variacion', v_variacion_miembros),
          'asistencia_semanal', jsonb_build_object('valor', v_asistencia_semanal),
          'grupos_activos', jsonb_build_object('valor', v_grupos_activos),
          'nuevos_miembros_mes', jsonb_build_object('valor', v_nuevos_miembros_mes)
        ),
        'actividad_reciente', v_actividad,
        'proximos_cumpleanos', v_cumpleanos,
        'grupos_en_riesgo', v_riesgo,
        'tendencia_asistencia', v_tendencia,
        'distribucion_segmentos', v_distribucion
      )
    );
  ELSIF v_rol_nombre = 'director-etapa' THEN
    SELECT array_agg(deg.grupo_id)
    INTO v_grupos_asignados_ids
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
    WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa';

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    SELECT COUNT(DISTINCT gm.usuario_id) INTO v_total_miembros_alcance
    FROM public.grupo_miembros gm
    WHERE v_grupos_asignados_ids IS NOT NULL AND gm.grupo_id = ANY(v_grupos_asignados_ids);

    BEGIN
      v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
      v_asistencia_semanal_alcance := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_asistencia_semanal_alcance := 0;
    END;

    SELECT COUNT(*) INTO v_grupos_activos_alcance
    FROM public.grupos g
    WHERE v_grupos_asignados_ids IS NOT NULL AND g.id = ANY(v_grupos_asignados_ids) AND g.activo = true AND COALESCE(g.eliminado,false)=false;

    SELECT COUNT(*) INTO v_nuevos_miembros_mes_alcance
    FROM public.grupo_miembros gm
    WHERE v_grupos_asignados_ids IS NOT NULL AND gm.grupo_id = ANY(v_grupos_asignados_ids)
      AND gm.fecha_asignacion >= (CURRENT_DATE - INTERVAL '30 days');

    v_actividad_alcance := (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('tipo', e.tipo, 'texto', e.texto, 'fecha', e.fecha) ORDER BY e.fecha DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT * FROM (
          SELECT gm.fecha_asignacion AS fecha, 'USUARIO_A_GRUPO'::text AS tipo,
                 (COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'') || ' añadido a ' || COALESCE(g.nombre,'')) AS texto
          FROM public.grupo_miembros gm
          JOIN public.grupos g ON g.id = gm.grupo_id
          LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids)
          UNION ALL
          SELECT g.fecha_creacion AS fecha, 'NUEVO_GRUPO'::text AS tipo,
                 ('Se creó el grupo ' || '"' || g.nombre || '".') AS texto
          FROM public.grupos g
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND g.id = ANY(v_grupos_asignados_ids)
          UNION ALL
          SELECT eg.fecha AS fecha, 'REPORTE_ASISTENCIA'::text AS tipo,
                 ('El grupo "' || COALESCE(g.nombre,'') || '" ha reportado su asistencia.') AS texto
          FROM public.eventos_grupo eg
          JOIN public.grupos g ON g.id = eg.grupo_id
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_asignados_ids)
        ) eventos
        ORDER BY fecha DESC
        LIMIT 5
      ) e
    );

    v_cumpleanos_alcance := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
        WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids)
          AND u.fecha_nacimiento IS NOT NULL
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN fecha_nacimiento IS NULL THEN NULL
                    WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                      THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date
               END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre_completo', nombre || ' ' || apellido,
        'foto_url', foto_perfil_url,
        'fecha_nacimiento', fecha_nacimiento,
        'proximo', proximo
      ) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    IF v_rep IS NULL THEN v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true); END IF;
    v_riesgo_alcance := COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb);

    v_lideres_sin_reporte := (
      WITH asignados AS (
        SELECT g.id, g.nombre
        FROM public.grupos g
        WHERE (v_grupos_asignados_ids IS NOT NULL) AND g.id = ANY(v_grupos_asignados_ids)
          AND g.activo = true AND COALESCE(g.eliminado,false)=false
      ), eventos_semana AS (
        SELECT DISTINCT eg.grupo_id
        FROM public.eventos_grupo eg
        WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
          AND (v_grupos_asignados_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_asignados_ids)
      ), faltantes AS (
        SELECT a.id AS grupo_id, a.nombre
        FROM asignados a
        LEFT JOIN eventos_semana es ON es.grupo_id = a.id
        WHERE es.grupo_id IS NULL
      ), lideres AS (
        SELECT gm.grupo_id, STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre||' '||u.apellido) AS nombres
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
        WHERE gm.rol = 'Líder'
        GROUP BY gm.grupo_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'grupo_id', f.grupo_id,
        'grupo_nombre', f.nombre,
        'lideres', COALESCE(l.nombres,'Sin líderes asignados')
      ) ORDER BY f.nombre), '[]'::jsonb)
      FROM faltantes f
      LEFT JOIN lideres l ON l.grupo_id = f.grupo_id
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'kpis_alcance', jsonb_build_object(
          'total_miembros', jsonb_build_object('valor', v_total_miembros_alcance),
          'asistencia_semanal', jsonb_build_object('valor', v_asistencia_semanal_alcance),
          'grupos_activos', jsonb_build_object('valor', v_grupos_activos_alcance),
          'nuevos_miembros_mes', jsonb_build_object('valor', v_nuevos_miembros_mes_alcance)
        ),
        'actividad_reciente_alcance', v_actividad_alcance,
        'proximos_cumpleanos_alcance', v_cumpleanos_alcance,
        'grupos_en_riesgo_alcance', v_riesgo_alcance,
        'lideres_sin_reporte', v_lideres_sin_reporte
      )
    );
  ELSIF v_rol_nombre = 'lider' THEN
    SELECT array_agg(gm.grupo_id) INTO v_grupos_lider_ids
    FROM public.grupo_miembros gm
    WHERE gm.usuario_id = v_user_id AND gm.rol = 'Líder';

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    SELECT jsonb_build_object(
      'tipo','REGISTRAR_ASISTENCIA',
      'mensaje','No has registrado la asistencia de esta semana para el grupo ' || '"' || a.nombre || '"' || '.',
      'grupo_id', a.id,
      'grupo_nombre', a.nombre
    ) INTO v_accion_requerida
    FROM (
      WITH asignados AS (
        SELECT g.id, g.nombre
        FROM public.grupos g
        WHERE (v_grupos_lider_ids IS NOT NULL) AND g.id = ANY(v_grupos_lider_ids)
          AND g.activo = true AND COALESCE(g.eliminado,false)=false
      ), eventos_semana AS (
        SELECT DISTINCT eg.grupo_id
        FROM public.eventos_grupo eg
        WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
          AND (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
      )
      SELECT a.*
      FROM asignados a
      LEFT JOIN eventos_semana es ON es.grupo_id = a.id
      WHERE es.grupo_id IS NULL
      ORDER BY a.nombre
      LIMIT 1
    ) a;

    IF NOT EXISTS (
      SELECT 1 FROM (
        WITH asignados AS (
          SELECT g.id FROM public.grupos g
          WHERE (v_grupos_lider_ids IS NOT NULL) AND g.id = ANY(v_grupos_lider_ids)
            AND g.activo = true AND COALESCE(g.eliminado,false)=false
        ), eventos_semana AS (
          SELECT DISTINCT eg.grupo_id FROM public.eventos_grupo eg
          WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
            AND (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
        )
        SELECT a.id FROM asignados a
        LEFT JOIN eventos_semana es ON es.grupo_id = a.id
        WHERE es.grupo_id IS NULL
      ) x
    ) THEN
      v_accion_requerida := NULL;
    END IF;

    SELECT eg.id, eg.grupo_id INTO v_evento_ultimo, v_evento_ultimo_grupo
    FROM public.eventos_grupo eg
    WHERE v_grupos_lider_ids IS NOT NULL AND eg.grupo_id = ANY(v_grupos_lider_ids)
    ORDER BY eg.fecha DESC
    LIMIT 1;

    v_kpis_grupo := jsonb_build_object(
      'asistencia_ultima_reunion', (SELECT COALESCE(ROUND((COUNT(a.id) FILTER (WHERE a.presente = true))::numeric / NULLIF(COUNT(a.id), 0)::numeric * 100, 1), 0) FROM public.asistencia a WHERE v_evento_ultimo IS NOT NULL AND a.evento_grupo_id = v_evento_ultimo),
      'total_miembros', (SELECT COALESCE(COUNT(DISTINCT gm.usuario_id), 0) FROM public.grupo_miembros gm WHERE v_evento_ultimo_grupo IS NOT NULL AND gm.grupo_id = v_evento_ultimo_grupo AND gm.fecha_salida IS NULL)
    );

    v_proximos_cumpleanos_grupo := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
        WHERE (v_grupos_lider_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_lider_ids)
          AND u.fecha_nacimiento IS NOT NULL
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN fecha_nacimiento IS NULL THEN NULL
                    WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                      THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date
               END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre_completo', nombre || ' ' || apellido,
        'foto_url', foto_perfil_url,
        'fecha_nacimiento', fecha_nacimiento,
        'proximo', proximo
      ) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    v_miembros_ausentes_recientemente := (
      WITH ultimos_eventos AS (
        SELECT eg.id AS evento_id, eg.grupo_id, eg.fecha
        FROM public.eventos_grupo eg
        WHERE (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
        ORDER BY eg.fecha DESC
        LIMIT 2
      ), ausentes AS (
        SELECT a.usuario_id, MAX(COALESCE(a.fecha_registro::date, ue.fecha)) AS ultima_ausencia
        FROM public.asistencia a
        JOIN ultimos_eventos ue ON ue.evento_id = a.evento_grupo_id
        WHERE a.presente = false
        GROUP BY a.usuario_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nombre_completo', u.nombre || ' ' || u.apellido,
        'foto_url', u.foto_perfil_url,
        'ultima_ausencia', aus.ultima_ausencia
      ) ORDER BY aus.ultima_ausencia DESC), '[]'::jsonb)
      FROM ausentes aus
      JOIN public.usuarios u ON u.id = aus.usuario_id
    );

    v_nuevos_miembros_grupo := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nombre_completo', u.nombre || ' ' || u.apellido,
        'foto_url', u.foto_perfil_url,
        'fecha_ingreso', gm.fecha_asignacion
      ) ORDER BY gm.fecha_asignacion DESC), '[]'::jsonb)
      FROM public.grupo_miembros gm
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE (v_grupos_lider_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_lider_ids)
        AND gm.fecha_asignacion >= (CURRENT_DATE - INTERVAL '30 days')
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'accion_requerida', v_accion_requerida,
        'kpis_grupo', v_kpis_grupo,
        'proximos_cumpleanos_grupo', v_proximos_cumpleanos_grupo,
        'miembros_ausentes_recientemente', v_miembros_ausentes_recientemente,
        'nuevos_miembros_grupo', v_nuevos_miembros_grupo
      )
    );
  ELSE
    RETURN jsonb_build_object('rol', v_rol_nombre, 'widgets', jsonb_build_object());
  END IF;
END;
$function$;

-- Director general clause. Before: the users who are active members of an active,
-- not deleted group of one of the person's director_general_segmentos segments.
-- Now: the same users, for the groups in gdv_dg_grupos_visibles(usuario_interno_id).
-- Who the director general may list is otherwise unchanged (p_contexto_relacion
-- still lists everybody).
create or replace function public.listar_usuarios_con_permisos(p_auth_id uuid, p_busqueda text default ''::text, p_roles_filtro text[] default '{}'::text[], p_con_email boolean default null::boolean, p_con_telefono boolean default null::boolean, p_en_grupo boolean default null::boolean, p_limite integer default 20, p_offset integer default 0, p_contexto_relacion boolean default false, p_campus_id uuid default null::uuid)
 returns table(id uuid, nombre text, apellido text, email text, telefono text, cedula text, fecha_registro timestamp with time zone, rol_nombre_interno text, rol_nombre_visible text, foto_perfil_url text, total_count bigint, puede_ver boolean)
 language plpgsql
 security definer
as $function$
DECLARE
  usuario_rol text;
  usuario_interno_id uuid;
  query_base text;
  query_where text := '';
  query_final text;
  total_registros bigint;
BEGIN
  SELECT u.id, rs.nombre_interno
  INTO usuario_interno_id, usuario_rol
  FROM usuarios u
  JOIN usuario_roles ur ON u.id = ur.usuario_id
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  WHERE u.auth_id = p_auth_id
  LIMIT 1;

  IF usuario_interno_id IS NULL THEN
    RETURN;
  END IF;

  query_base := '
    SELECT DISTINCT
      u.id,
      u.nombre,
      u.apellido,
      u.email,
      u.telefono,
      u.cedula,
      u.fecha_registro,
      rs.nombre_interno as rol_nombre_interno,
      rs.nombre_visible as rol_nombre_visible,
      u.foto_perfil_url,
      true as puede_ver
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
    LEFT JOIN roles_sistema rs ON ur.rol_id = rs.id
  ';

  CASE usuario_rol
    WHEN 'admin', 'pastor' THEN
      query_where := ' WHERE 1=1 ';
    WHEN 'director-general' THEN
      IF p_contexto_relacion THEN
        query_where := ' WHERE 1=1 ';
      ELSE
        query_where := format('
          WHERE u.id IN (
            SELECT DISTINCT gm.usuario_id
            FROM grupo_miembros gm
            JOIN grupos g ON gm.grupo_id = g.id
            WHERE g.id IN (SELECT public.gdv_dg_grupos_visibles(%L))
              AND g.activo = true
              AND COALESCE(g.eliminado, false) = false
              AND gm.fecha_salida IS NULL
          )
        ', usuario_interno_id);
      END IF;
    WHEN 'director-etapa' THEN
      IF p_contexto_relacion THEN
        query_where := ' WHERE 1=1 ';
      ELSE
        query_where := format('
          WHERE u.id IN (
            SELECT DISTINCT gm.usuario_id
            FROM director_etapa_grupos deg
            JOIN segmento_lideres sl ON deg.director_etapa_id = sl.id AND sl.usuario_id = %L AND sl.tipo_lider = ''director_etapa''
            JOIN grupo_miembros gm ON gm.grupo_id = deg.grupo_id AND gm.fecha_salida IS NULL
          )
        ', usuario_interno_id);
      END IF;
    WHEN 'lider' THEN
      IF p_contexto_relacion THEN
        query_where := ' WHERE 1=1 ';
      ELSE
        query_where := format('
          WHERE u.id IN (
            SELECT DISTINCT gm.usuario_id
            FROM grupo_miembros gm
            JOIN grupo_miembros gm_lider ON gm.grupo_id = gm_lider.grupo_id
            WHERE gm_lider.usuario_id = %L
              AND gm_lider.rol = ''Líder''
              AND gm_lider.fecha_salida IS NULL
              AND gm.fecha_salida IS NULL
          )
        ', usuario_interno_id);
      END IF;
    WHEN 'miembro' THEN
      query_where := format('
        WHERE (
          u.familia_id = (SELECT familia_id FROM usuarios WHERE id = %L)
          OR u.id IN (
            SELECT CASE
              WHEN ru.usuario1_id = %L THEN ru.usuario2_id
              ELSE ru.usuario1_id
            END
            FROM relaciones_usuarios ru
            WHERE ru.usuario1_id = %L OR ru.usuario2_id = %L
          )
          OR u.id = %L
        )
      ', usuario_interno_id, usuario_interno_id, usuario_interno_id, usuario_interno_id, usuario_interno_id);
    ELSE
      query_where := ' WHERE 1=0 ';
  END CASE;

  IF p_busqueda IS NOT NULL AND p_busqueda != '' THEN
    query_where := query_where || format('
      AND (
        u.nombre ILIKE ''%%%s%%''
        OR u.apellido ILIKE ''%%%s%%''
        OR u.email ILIKE ''%%%s%%''
        OR u.cedula ILIKE ''%%%s%%''
      )
    ', p_busqueda, p_busqueda, p_busqueda, p_busqueda);
  END IF;

  IF p_roles_filtro IS NOT NULL AND array_length(p_roles_filtro, 1) > 0 THEN
    query_where := query_where || format('
      AND rs.nombre_interno = ANY(%L)
    ', p_roles_filtro);
  END IF;

  IF p_con_email IS NOT NULL THEN
    IF p_con_email THEN
      query_where := query_where || ' AND u.email IS NOT NULL AND u.email != '''' ';
    ELSE
      query_where := query_where || ' AND (u.email IS NULL OR u.email = '''') ';
    END IF;
  END IF;

  IF p_con_telefono IS NOT NULL THEN
    IF p_con_telefono THEN
      query_where := query_where || ' AND u.telefono IS NOT NULL AND u.telefono != '''' ';
    ELSE
      query_where := query_where || ' AND (u.telefono IS NULL OR u.telefono = '''') ';
    END IF;
  END IF;

  IF p_en_grupo IS NOT NULL THEN
    IF p_en_grupo THEN
      query_where := query_where || ' AND EXISTS (SELECT 1 FROM grupo_miembros gm2 WHERE gm2.usuario_id = u.id AND gm2.fecha_salida IS NULL) ';
    ELSE
      query_where := query_where || ' AND NOT EXISTS (SELECT 1 FROM grupo_miembros gm2 WHERE gm2.usuario_id = u.id AND gm2.fecha_salida IS NULL) ';
    END IF;
  END IF;

  query_final := query_base || query_where || '
    ORDER BY u.nombre, u.apellido
    LIMIT ' || p_limite || ' OFFSET ' || p_offset;

  EXECUTE 'SELECT COUNT(DISTINCT u.id) FROM (' || query_base || query_where || ') u'
  INTO total_registros;

  RETURN QUERY EXECUTE format('
    SELECT
      sub.id,
      sub.nombre,
      sub.apellido,
      sub.email,
      sub.telefono,
      sub.cedula,
      sub.fecha_registro,
      sub.rol_nombre_interno,
      sub.rol_nombre_visible,
      sub.foto_perfil_url,
      %L::bigint as total_count,
      sub.puede_ver
    FROM (%s) sub
  ', total_registros, query_final);
END;
$function$;

-- Director general clause. Before: the users with an account who are members of a
-- group of one of the person's director_general_segmentos segments. Now: the same
-- users, for the groups in gdv_dg_grupos_visibles(v_usuario_id). The director de
-- etapa branch is left as it was.
-- The function belongs to the pastoral module, which is not installed in every
-- environment: it is replaced only where it already exists, never created here.
do $guard$
begin
  if to_regprocedure('public.get_personas_under_me(uuid)') is not null then
    execute $ddl$
create or replace function public.get_personas_under_me(p_auth_id uuid)
 returns table(persona_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$ DECLARE v_usuario_id uuid; BEGIN IF auth.role() <> 'service_role' AND p_auth_id IS DISTINCT FROM auth.uid() THEN RETURN; END IF; SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id=p_auth_id; IF v_usuario_id IS NULL THEN RETURN; END IF; IF EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id=rs.id WHERE ur.usuario_id=v_usuario_id AND rs.nombre_interno IN ('admin','pastor')) THEN RETURN QUERY SELECT u.id FROM public.usuarios u WHERE u.auth_id IS NOT NULL; RETURN; END IF; IF EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id=rs.id WHERE ur.usuario_id=v_usuario_id AND rs.nombre_interno='director-general') THEN RETURN QUERY SELECT DISTINCT u.id FROM public.usuarios u JOIN public.grupo_miembros gm ON gm.usuario_id=u.id JOIN public.grupos g ON g.id=gm.grupo_id WHERE g.id IN (SELECT public.gdv_dg_grupos_visibles(v_usuario_id)) AND u.auth_id IS NOT NULL; RETURN; END IF; IF EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id=rs.id WHERE ur.usuario_id=v_usuario_id AND rs.nombre_interno='director-etapa') THEN RETURN QUERY SELECT DISTINCT u.id FROM public.usuarios u JOIN public.grupo_miembros gm ON gm.usuario_id=u.id JOIN public.grupos g ON g.id=gm.grupo_id JOIN public.director_etapa_grupos deg ON deg.grupo_id=g.id WHERE deg.director_etapa_id=v_usuario_id AND u.auth_id IS NOT NULL; RETURN; END IF; IF EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id=rs.id WHERE ur.usuario_id=v_usuario_id AND rs.nombre_interno IN ('lider','colider')) THEN RETURN QUERY SELECT DISTINCT u.id FROM public.usuarios u JOIN public.grupo_miembros gm ON gm.usuario_id=u.id WHERE gm.grupo_id IN (SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id=v_usuario_id) AND u.auth_id IS NOT NULL; RETURN; END IF; RETURN QUERY SELECT v_usuario_id; END; $function$
    $ddl$;
  end if;
end
$guard$;

-- Director general clause. Before: the role was grouped with admin and pastor
-- (v_es_superior), so the campus overload counted every group for a director
-- general. Now: v_es_superior is admin and pastor only, and a director general
-- counts the groups in gdv_dg_grupos_visibles(v_usuario_id) (v_es_dg is new).
create or replace function public.obtener_kpis_grupos_para_usuario(p_auth_id uuid, p_campus_id uuid default null::uuid)
 returns table(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_es_superior boolean;
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
    -- NUEVO: filtro campus
    AND (p_campus_id IS NULL OR v.grupo_id IN (
      SELECT g.id FROM public.grupos g WHERE g.campus_id = p_campus_id
    ))
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;
$function$;
