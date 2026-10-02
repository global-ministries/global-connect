-- Identity guard for the risk and attendance reports that take the caller as an
-- argument (security phase 2, batch 2).
--
-- What was wrong in the live functions:
--   * They are SECURITY DEFINER and take the caller's identity as p_auth_id, but
--     never compared it with the session. Any logged-in person who knew another
--     person's auth id could read the reports that person can read: the risk
--     dashboard and the list of members at risk (names, absences), the weekly
--     attendance report, and the attendance report and ranking of any group the
--     other person can see.
--   * obtener_reporte_crecimiento_neto and obtener_reporte_retencion check only
--     that the identity exists in usuarios, never what the person may see, so
--     the identity guard is the only gate they can have without changing what
--     an own-identity call returns.
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, SECURITY DEFINER and owner are unchanged, so the app needs no
-- change):
--   * Identity: p_auth_id must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000 and 20261002100000.
--     The guard is the first statement of each body; the rest of every body is
--     the live text.
--   * search_path is pinned to public on the four functions that had none
--     (ranking, group report, net growth, retention). Every unqualified table
--     they use (usuarios, grupos, grupo_miembros, temporadas) lives in public
--     and the rest are pg_catalog built-ins, so the pin changes no resolution.
--   * Grants: anon and PUBLIC lose execute (they already hold nothing since the
--     anon lock-down); authenticated and service_role keep it. The grants are
--     restated at the end of the file.
--
-- Exit for another person's identity or no session (decision D3: the same shape
-- the function already uses for "unknown user / no permission"):
--   obtener_dashboard_riesgo            RETURN {"error": "Usuario no encontrado"}
--   obtener_miembros_en_riesgo          RAISE 'Usuario no encontrado'
--   obtener_ranking_asistencia_grupo    RETURN {"error": "Usuario no encontrado"}
--   obtener_reporte_asistencia_grupo    RETURN {"error": "Usuario no encontrado"}
--   obtener_reporte_crecimiento_neto    RETURN {"error": "Usuario no encontrado"}
--   obtener_reporte_retencion           RETURN {"error": "Usuario no encontrado"}
--   obtener_reporte_semanal_asistencia  RAISE 'No tienes permisos para ver este
--                                       reporte'
--
-- Blast radius: the app and the planner call these functions with the session
-- client and the person's own id (the guard lets that through).
-- obtener_datos_dashboard calls obtener_reporte_semanal_asistencia with its own
-- p_auth_id, which is already compared with the session there. Scripts use the
-- service client, which stays exempt. Only a caller that passes somebody else's
-- id, or no session, changes, and that is the point.
--
-- Rollback: recreate the previous definitions. The latest migration that defined
-- each function is:
--   obtener_dashboard_riesgo            20260326_003_actualizar_rpcs_dg_filtro_de.sql
--   obtener_miembros_en_riesgo          20260326_003_actualizar_rpcs_dg_filtro_de.sql
--   obtener_ranking_asistencia_grupo    20260314_006_rpc_ranking_asistencia_miembros.sql
--   obtener_reporte_asistencia_grupo    20251027140000_obtener_reporte_asistencia_grupo.sql
--   obtener_reporte_crecimiento_neto    20260315_008_rpc_reporte_crecimiento.sql
--   obtener_reporte_retencion           20260315_007_rpc_reporte_retencion.sql
--   obtener_reporte_semanal_asistencia  20260619000353_harden_round3_remaining_blockers.sql
-- Some of those files were later overridden by a live edit, so production keeps
-- a backup table of the live definitions that the operator creates before
-- applying this file; restore from that table.

CREATE OR REPLACE FUNCTION public.obtener_dashboard_riesgo(p_auth_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid; v_rol text; v_resultado jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

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

CREATE OR REPLACE FUNCTION public.obtener_miembros_en_riesgo(p_auth_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_rol text; v_result jsonb;
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

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

CREATE OR REPLACE FUNCTION public.obtener_ranking_asistencia_grupo(p_grupo_id uuid, p_auth_id uuid, p_modo text DEFAULT 'constantes'::text, p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_puede_ver boolean;
  v_result jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT public.puede_ver_grupo(v_user_id, p_grupo_id) INTO v_puede_ver;

  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object('error', 'Sin permisos para ver este grupo');
  END IF;

  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '6 months';
  END IF;

  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  WITH eventos_filtrados AS (
    SELECT eg.id
    FROM public.eventos_grupo eg
    WHERE eg.grupo_id = p_grupo_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  total_eventos AS (
    SELECT COUNT(*) AS total FROM eventos_filtrados
  ),
  ranking AS (
    SELECT
      u.id,
      u.nombre || ' ' || u.apellido AS nombre_completo,
      u.email,
      COUNT(a.id) FILTER (WHERE a.presente = true) AS asistencias,
      COUNT(a.id) FILTER (WHERE a.presente = false) AS ausencias,
      COUNT(a.id) AS total_registros,
      CASE
        WHEN COUNT(a.id) > 0
        THEN ROUND((COUNT(a.id) FILTER (WHERE a.presente = true)::numeric / COUNT(a.id)::numeric) * 100, 1)
        ELSE 0
      END AS porcentaje_asistencia
    FROM public.asistencia a
    JOIN public.usuarios u ON u.id = a.usuario_id
    WHERE a.evento_grupo_id IN (SELECT id FROM eventos_filtrados)
    GROUP BY u.id, u.nombre, u.apellido, u.email
    ORDER BY
      CASE WHEN p_modo = 'constantes'
        THEN COUNT(a.id) FILTER (WHERE a.presente = true)
        ELSE COUNT(a.id) FILTER (WHERE a.presente = false)
      END DESC,
      u.nombre ASC
  )
  SELECT jsonb_build_object(
    'total_eventos', (SELECT total FROM total_eventos),
    'miembros', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre_completo,
          'email', r.email,
          'asistencias', r.asistencias,
          'ausencias', r.ausencias,
          'total_registros', r.total_registros,
          'porcentaje', r.porcentaje_asistencia
        )
      ) FROM ranking r),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_reporte_asistencia_grupo(p_grupo_id uuid, p_auth_id uuid, p_fecha_inicio date DEFAULT NULL::date, p_fecha_fin date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_puede_ver boolean;
  v_result jsonb;
  v_kpis jsonb;
  v_series_temporales jsonb;
  v_eventos_historial jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- 1. Obtener el user_id interno desde auth_id
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- 2. Validar permisos con puede_ver_grupo
  SELECT public.puede_ver_grupo(v_user_id, p_grupo_id) INTO v_puede_ver;
  
  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object('error', 'Sin permisos para ver este grupo');
  END IF;

  -- 3. Establecer fechas por defecto si no se proporcionan (últimos 6 meses)
  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '6 months';
  END IF;
  
  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  -- 4. Calcular KPIs
  WITH eventos_filtrados AS (
    SELECT 
      eg.id,
      eg.fecha,
      eg.tema,
      COUNT(a.id) AS total_miembros,
      COUNT(a.id) FILTER (WHERE a.presente = true) AS presentes
    FROM public.eventos_grupo eg
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.grupo_id = p_grupo_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    GROUP BY eg.id, eg.fecha, eg.tema
  ),
  kpis_calc AS (
    SELECT
      COALESCE(
        ROUND(
          AVG(
            CASE 
              WHEN total_miembros > 0 
              THEN (presentes::numeric / total_miembros::numeric) * 100 
              ELSE 0 
            END
          ), 1
        ), 0
      ) AS asistencia_promedio,
      COUNT(*) AS total_reuniones,
      -- Miembro más constante
      (
        SELECT jsonb_build_object(
          'id', u.id,
          'nombre', u.nombre || ' ' || u.apellido,
          'asistencias', COUNT(a.id) FILTER (WHERE a.presente = true)
        )
        FROM public.asistencia a
        JOIN public.usuarios u ON u.id = a.usuario_id
        WHERE a.evento_grupo_id IN (SELECT id FROM eventos_filtrados)
        GROUP BY u.id, u.nombre, u.apellido
        ORDER BY COUNT(a.id) FILTER (WHERE a.presente = true) DESC
        LIMIT 1
      ) AS miembro_mas_constante,
      -- Miembro con más ausencias
      (
        SELECT jsonb_build_object(
          'id', u.id,
          'nombre', u.nombre || ' ' || u.apellido,
          'ausencias', COUNT(a.id) FILTER (WHERE a.presente = false)
        )
        FROM public.asistencia a
        JOIN public.usuarios u ON u.id = a.usuario_id
        WHERE a.evento_grupo_id IN (SELECT id FROM eventos_filtrados)
        GROUP BY u.id, u.nombre, u.apellido
        ORDER BY COUNT(a.id) FILTER (WHERE a.presente = false) DESC
        LIMIT 1
      ) AS miembro_mas_ausencias
    FROM eventos_filtrados
  )
  SELECT jsonb_build_object(
    'asistencia_promedio', asistencia_promedio,
    'total_reuniones', total_reuniones,
    'miembro_mas_constante', COALESCE(miembro_mas_constante, jsonb_build_object('id', null, 'nombre', 'N/D', 'asistencias', 0)),
    'miembro_mas_ausencias', COALESCE(miembro_mas_ausencias, jsonb_build_object('id', null, 'nombre', 'N/D', 'ausencias', 0))
  )
  INTO v_kpis
  FROM kpis_calc;

  -- 5. Calcular series temporales (agrupadas por semana)
  WITH eventos_con_semana AS (
    SELECT 
      eg.id,
      eg.fecha,
      DATE_TRUNC('week', eg.fecha::timestamp)::date AS semana,
      COUNT(a.id) AS total_miembros,
      COUNT(a.id) FILTER (WHERE a.presente = true) AS presentes
    FROM public.eventos_grupo eg
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.grupo_id = p_grupo_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    GROUP BY eg.id, eg.fecha
  ),
  series_semanales AS (
    SELECT
      semana,
      COALESCE(
        ROUND(
          AVG(
            CASE 
              WHEN total_miembros > 0 
              THEN (presentes::numeric / total_miembros::numeric) * 100 
              ELSE 0 
            END
          ), 1
        ), 0
      ) AS porcentaje_promedio
    FROM eventos_con_semana
    GROUP BY semana
    ORDER BY semana
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'semana', semana,
      'porcentaje', porcentaje_promedio
    )
  )
  INTO v_series_temporales
  FROM series_semanales;

  -- 6. Obtener lista de eventos históricos
  WITH eventos_detalle AS (
    SELECT 
      eg.id,
      eg.fecha,
      eg.tema,
      COUNT(a.id) AS total,
      COUNT(a.id) FILTER (WHERE a.presente = true) AS presentes,
      CASE 
        WHEN COUNT(a.id) > 0 
        THEN ROUND((COUNT(a.id) FILTER (WHERE a.presente = true)::numeric / COUNT(a.id)::numeric) * 100, 1)
        ELSE 0 
      END AS porcentaje
    FROM public.eventos_grupo eg
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.grupo_id = p_grupo_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    GROUP BY eg.id, eg.fecha, eg.tema
    ORDER BY eg.fecha DESC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'fecha', fecha,
      'tema', COALESCE(tema, 'Sin tema'),
      'presentes', presentes,
      'total', total,
      'porcentaje', porcentaje
    )
  )
  INTO v_eventos_historial
  FROM eventos_detalle;

  -- 7. Construir el resultado final
  v_result := jsonb_build_object(
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'series_temporales', COALESCE(v_series_temporales, '[]'::jsonb),
    'eventos_historial', COALESCE(v_eventos_historial, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_reporte_crecimiento_neto(p_auth_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid, p_meses integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now() - (p_meses || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS mes
  ),
  ingresos AS (
    SELECT
      date_trunc('month', gm.creado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.creado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  ),
  egresos AS (
    SELECT
      date_trunc('month', gm.actualizado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.estado = 'inactivo'
    AND gm.actualizado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'timeline', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'etiqueta', to_char(m.mes, 'Mon YYYY'),
        'ingresos', COALESCE(i.total, 0),
        'egresos', COALESCE(e.total, 0),
        'neto', COALESCE(i.total, 0) - COALESCE(e.total, 0)
      ) ORDER BY m.mes)
      FROM meses m
      LEFT JOIN ingresos i ON i.mes = m.mes
      LEFT JOIN egresos e ON e.mes = m.mes),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_reporte_retencion(p_auth_id uuid, p_temporada_actual_id uuid, p_temporada_anterior_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
  v_anterior_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  IF p_temporada_anterior_id IS NULL THEN
    SELECT t2.id INTO v_anterior_id
    FROM temporadas t1
    JOIN temporadas t2 ON t2.fecha_inicio < t1.fecha_inicio
    WHERE t1.id = p_temporada_actual_id
    ORDER BY t2.fecha_inicio DESC
    LIMIT 1;
  ELSE
    v_anterior_id := p_temporada_anterior_id;
  END IF;

  IF v_anterior_id IS NULL THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  WITH miembros_anterior AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = v_anterior_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  miembros_actual AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = p_temporada_actual_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  continuaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    INNER JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
  ),
  no_renovaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    LEFT JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
    WHERE mc.usuario_id IS NULL
  ),
  nuevos AS (
    SELECT mc.usuario_id
    FROM miembros_actual mc
    LEFT JOIN miembros_anterior ma ON mc.usuario_id = ma.usuario_id
    WHERE ma.usuario_id IS NULL
  )
  SELECT jsonb_build_object(
    'miembros_que_continuaron', (SELECT COUNT(*) FROM continuaron),
    'miembros_anteriores', (SELECT COUNT(*) FROM miembros_anterior),
    'miembros_nuevos', (SELECT COUNT(*) FROM nuevos),
    'miembros_no_renovaron', (SELECT COUNT(*) FROM no_renovaron),
    'pct_retencion', CASE
      WHEN (SELECT COUNT(*) FROM miembros_anterior) > 0
      THEN ROUND((SELECT COUNT(*) FROM continuaron)::numeric / (SELECT COUNT(*) FROM miembros_anterior) * 100, 1)
      ELSE 0
    END,
    'detalle_no_renovaron', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'usuario_id', nr.usuario_id,
        'nombre', u.nombre || ' ' || u.apellido
      ))
      FROM no_renovaron nr
      JOIN usuarios u ON u.id = nr.usuario_id
      LIMIT 50),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_reporte_semanal_asistencia(p_auth_id uuid, p_fecha_semana date DEFAULT NULL::date, p_incluir_todos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_rol_nombre text;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_numero_semana int;
  v_fecha_inicio_anterior date;
  v_fecha_fin_anterior date;
  v_result jsonb;
  v_kpis_globales jsonb;
  v_tendencia jsonb;
  v_por_segmento jsonb;
  v_grupos_perfectos jsonb;
  v_grupos_riesgo jsonb;
  v_grupos_riesgo_todos jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'No tienes permisos para ver este reporte';
  END IF;

  SELECT u.id, rs.nombre_interno
  INTO v_user_id, v_rol_nombre
  FROM public.usuarios u
  JOIN public.usuario_roles ur ON ur.usuario_id = u.id
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE u.auth_id = p_auth_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY CASE rs.nombre_interno
    WHEN 'admin' THEN 1
    WHEN 'pastor' THEN 2
    WHEN 'director-general' THEN 3
    WHEN 'director-etapa' THEN 4
    ELSE 99
  END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No tienes permisos para ver este reporte';
  END IF;

  IF p_fecha_semana IS NULL THEN p_fecha_semana := CURRENT_DATE; END IF;
  v_fecha_inicio := p_fecha_semana - (((EXTRACT(ISODOW FROM p_fecha_semana)::int + 6) % 7));
  v_fecha_fin := v_fecha_inicio + INTERVAL '6 days';
  v_numero_semana := EXTRACT(WEEK FROM v_fecha_inicio)::int;
  v_fecha_inicio_anterior := v_fecha_inicio - INTERVAL '7 days';
  v_fecha_fin_anterior := v_fecha_fin - INTERVAL '7 days';

  WITH grupos_activos AS (
    SELECT g.id, g.segmento_id
    FROM public.grupos g
    WHERE g.activo = true
      AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
  ),
  eventos_semana AS (
    SELECT eg.id AS evento_id, eg.grupo_id, ga.segmento_id,
           COUNT(a.id) AS total_registros,
           COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
    FROM public.eventos_grupo eg
    JOIN grupos_activos ga ON ga.id = eg.grupo_id
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
    GROUP BY eg.id, eg.grupo_id, ga.segmento_id
  ),
  eventos_por_grupo AS (
    SELECT es.grupo_id, es.segmento_id,
           SUM(es.total_registros) AS total_registros,
           SUM(es.total_presentes) AS total_presentes,
           COUNT(DISTINCT es.evento_id) AS total_eventos
    FROM eventos_semana es
    GROUP BY es.grupo_id, es.segmento_id
  ),
  base_grupos_semana AS (
    SELECT ga.id AS grupo_id, ga.segmento_id,
           COALESCE(eg.total_registros,0) AS total_registros,
           COALESCE(eg.total_presentes,0) AS total_presentes,
           COALESCE(eg.total_eventos,0) AS total_eventos
    FROM grupos_activos ga
    LEFT JOIN eventos_por_grupo eg ON eg.grupo_id = ga.id
  ),
  kpis AS (
    SELECT
      CASE WHEN p_incluir_todos = false THEN
        COALESCE(ROUND((SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros),0)::numeric) * 100, 1), 0)
      ELSE
        COALESCE(ROUND(AVG(CASE WHEN bgs.total_registros>0 THEN (bgs.total_presentes::numeric / bgs.total_registros::numeric)*100 ELSE 0 END), 1), 0)
      END AS porcentaje_asistencia_global,
      SUM(CASE WHEN p_incluir_todos = false THEN es.total_eventos ELSE bgs.total_eventos END) AS total_reuniones_registradas,
      SUM(CASE WHEN p_incluir_todos = false THEN CASE WHEN es.total_eventos>0 THEN 1 ELSE 0 END ELSE CASE WHEN bgs.total_eventos>0 THEN 1 ELSE 0 END END) AS total_grupos_con_reunion,
      (SELECT COUNT(*) FROM grupos_activos) AS total_grupos_activos,
      COALESCE(SUM(bgs.total_presentes), 0) AS total_miembros_asistentes,
      (
        SELECT COUNT(*)
        FROM public.grupo_miembros gm
        JOIN grupos_activos ga2 ON ga2.id = gm.grupo_id
      ) AS total_miembros_en_grupos
    FROM eventos_por_grupo es
    FULL JOIN base_grupos_semana bgs ON bgs.grupo_id = es.grupo_id
  ),
  eventos_semana_ant AS (
    SELECT eg.id AS evento_id, eg.grupo_id,
           COUNT(a.id) AS total_registros,
           COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
    FROM public.eventos_grupo eg
    JOIN grupos_activos ga ON ga.id = eg.grupo_id
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.fecha >= v_fecha_inicio_anterior AND eg.fecha <= v_fecha_fin_anterior
    GROUP BY eg.id, eg.grupo_id
  ),
  eventos_por_grupo_ant AS (
    SELECT es.grupo_id,
           SUM(es.total_registros) AS total_registros,
           SUM(es.total_presentes) AS total_presentes
    FROM eventos_semana_ant es
    GROUP BY es.grupo_id
  ),
  base_grupos_semana_ant AS (
    SELECT ga.id AS grupo_id,
           COALESCE(eg.total_registros,0) AS total_registros,
           COALESCE(eg.total_presentes,0) AS total_presentes
    FROM grupos_activos ga
    LEFT JOIN eventos_por_grupo_ant eg ON eg.grupo_id = ga.id
  ),
  kpis_ant AS (
    SELECT
      CASE WHEN p_incluir_todos = false THEN
        COALESCE(ROUND((SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros),0)::numeric) * 100, 1), 0)
      ELSE
        COALESCE(ROUND(AVG(CASE WHEN bga.total_registros>0 THEN (bga.total_presentes::numeric/bga.total_registros::numeric)*100 ELSE 0 END),1),0)
      END AS porcentaje
    FROM eventos_por_grupo_ant es
    FULL JOIN base_grupos_semana_ant bga ON bga.grupo_id = es.grupo_id
  )
  SELECT jsonb_build_object(
    'porcentaje_asistencia_global', k.porcentaje_asistencia_global,
    'variacion_semana_anterior', ROUND(k.porcentaje_asistencia_global - ka.porcentaje, 1),
    'total_reuniones_registradas', k.total_reuniones_registradas,
    'total_grupos_con_reunion', k.total_grupos_con_reunion,
    'total_grupos_activos', k.total_grupos_activos,
    'total_miembros_asistentes', k.total_miembros_asistentes,
    'total_miembros_en_grupos', k.total_miembros_en_grupos
  ) INTO v_kpis_globales
  FROM kpis k, kpis_ant ka;

  v_tendencia := (
    WITH semanas AS (
      SELECT v_fecha_inicio - (n * INTERVAL '7 days') AS semana_inicio,
             v_fecha_fin - (n * INTERVAL '7 days') AS semana_fin
      FROM generate_series(0,7) AS n
    ),
    trend AS (
      SELECT s.semana_inicio,
        CASE WHEN p_incluir_todos = false THEN
          COALESCE(ROUND((COUNT(a.id) FILTER (WHERE a.presente = true)::numeric / NULLIF(COUNT(a.id),0)::numeric) * 100, 1), 0)
        ELSE (
          SELECT COALESCE(ROUND(AVG(CASE WHEN epg.total_registros>0 THEN (epg.total_presentes::numeric/epg.total_registros::numeric)*100 ELSE 0 END),1),0)
          FROM (
            SELECT g.id AS grupo_id
            FROM public.grupos g
            WHERE g.activo = true
              AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
          ) gperm
          LEFT JOIN (
            SELECT eg.grupo_id,
                   COUNT(a.id) AS total_registros,
                   COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
            FROM public.eventos_grupo eg
            LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
            WHERE eg.fecha >= s.semana_inicio AND eg.fecha <= s.semana_fin
            GROUP BY eg.grupo_id
          ) epg ON epg.grupo_id = gperm.grupo_id
        ) END AS porcentaje
      FROM semanas s
      LEFT JOIN public.eventos_grupo eg
        ON eg.fecha >= s.semana_inicio
       AND eg.fecha <= s.semana_fin
       AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, eg.grupo_id)
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      GROUP BY s.semana_inicio, s.semana_fin
      ORDER BY s.semana_inicio
    )
    SELECT jsonb_agg(jsonb_build_object('semana_inicio', semana_inicio, 'porcentaje', porcentaje)) FROM trend
  );

  v_por_segmento := (
    WITH grupos_perm AS (
      SELECT g.id, g.segmento_id
      FROM public.grupos g
      WHERE g.activo = true
        AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
    ),
    eventos_agreg AS (
      SELECT eg.grupo_id,
             COUNT(a.id) AS total_registros,
             COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
      FROM public.eventos_grupo eg
      JOIN grupos_perm gp ON gp.id = eg.grupo_id
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
      GROUP BY eg.grupo_id
    ),
    grupo_stats AS (
      SELECT gp.segmento_id, gp.id AS grupo_id,
             COALESCE(e.total_registros,0) AS total_registros,
             COALESCE(e.total_presentes,0) AS total_presentes,
             CASE WHEN COALESCE(e.total_registros,0)>0 THEN (COALESCE(e.total_presentes,0)::numeric/COALESCE(e.total_registros,0)::numeric)*100 ELSE 0 END AS pct_grupo
      FROM grupos_perm gp
      LEFT JOIN eventos_agreg e ON e.grupo_id = gp.id
    ),
    seg AS (
      SELECT segmento_id,
        CASE WHEN p_incluir_todos = true THEN ROUND(AVG(pct_grupo),1)
             ELSE COALESCE(ROUND((SUM(total_presentes)::numeric/NULLIF(SUM(total_registros),0)::numeric)*100,1),0)
        END AS porcentaje,
        SUM(total_registros) AS registros
      FROM grupo_stats
      GROUP BY segmento_id
    ),
    eventos_por_segmento AS (
      SELECT gp.segmento_id, COUNT(DISTINCT eg.id) AS total_reuniones
      FROM public.eventos_grupo eg
      JOIN grupos_perm gp ON gp.id = eg.grupo_id
      WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
      GROUP BY gp.segmento_id
    )
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.segmento_id,
      'nombre', COALESCE(se.nombre,'Sin segmento'),
      'porcentaje_asistencia', s.porcentaje,
      'total_reuniones', COALESCE(eps.total_reuniones,0)
    ) ORDER BY s.porcentaje DESC)
    FROM seg s
    LEFT JOIN public.segmentos se ON se.id = s.segmento_id
    LEFT JOIN eventos_por_segmento eps ON eps.segmento_id = s.segmento_id
  );

  v_grupos_perfectos := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true
        AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
    ),
    eventos_agreg AS (
      SELECT eg.grupo_id,
             COUNT(a.id) AS total_registros,
             COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
      FROM public.eventos_grupo eg
      JOIN grupos_perm gp ON gp.id = eg.grupo_id
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
      GROUP BY eg.grupo_id
    )
    SELECT jsonb_agg(jsonb_build_object('id', x.grupo_id, 'nombre', g.nombre, 'lideres', COALESCE(l.lideres,'Sin líderes asignados')))
    FROM (
      SELECT grupo_id
      FROM eventos_agreg
      GROUP BY grupo_id
      HAVING ROUND((SUM(total_presentes)::numeric / NULLIF(SUM(total_registros),0)::numeric) * 100,1) = 100
      ORDER BY grupo_id
      LIMIT 5
    ) x
    JOIN public.grupos g ON g.id = x.grupo_id
    LEFT JOIN (
      SELECT gm.grupo_id, STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre||' '||u.apellido) AS lideres
      FROM public.grupo_miembros gm
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE gm.rol = 'Líder'
      GROUP BY gm.grupo_id
    ) l ON l.grupo_id = x.grupo_id
  );

  v_grupos_riesgo := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true
        AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
    ),
    eventos_agreg AS (
      SELECT eg.grupo_id,
             COUNT(a.id) AS total_registros,
             COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
      FROM public.eventos_grupo eg
      JOIN grupos_perm gp ON gp.id = eg.grupo_id
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
      GROUP BY eg.grupo_id
    ),
    pct AS (
      SELECT gp.id AS grupo_id,
             COALESCE(ROUND((CASE WHEN COALESCE(e.total_registros,0)>0 THEN (COALESCE(e.total_presentes,0)::numeric/COALESCE(e.total_registros,0)::numeric)*100 ELSE 0 END),1),0) AS porcentaje,
             COALESCE(e.total_registros,0) AS total_registros
      FROM grupos_perm gp
      LEFT JOIN eventos_agreg e ON e.grupo_id = gp.id
    )
    SELECT jsonb_agg(jsonb_build_object('id', o.grupo_id, 'nombre', g.nombre, 'porcentaje_asistencia', o.porcentaje, 'lideres', COALESCE(l.lideres,'Sin líderes asignados')))
    FROM (
      SELECT grupo_id, porcentaje
      FROM pct
      WHERE (p_incluir_todos = true OR total_registros > 0)
        AND porcentaje > 0
        AND porcentaje < 70
      ORDER BY porcentaje ASC, grupo_id
      LIMIT 5
    ) o
    JOIN public.grupos g ON g.id = o.grupo_id
    LEFT JOIN (
      SELECT gm.grupo_id, STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre||' '||u.apellido) AS lideres
      FROM public.grupo_miembros gm
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE gm.rol = 'Líder'
      GROUP BY gm.grupo_id
    ) l ON l.grupo_id = o.grupo_id
  );

  v_grupos_riesgo_todos := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true
        AND public.puede_ver_grupo_reporte_asistencia(p_auth_id, g.id)
    ),
    eventos_agreg AS (
      SELECT eg.grupo_id,
             COUNT(a.id) AS total_registros,
             COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
      FROM public.eventos_grupo eg
      JOIN grupos_perm gp ON gp.id = eg.grupo_id
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
      GROUP BY eg.grupo_id
    ),
    pct AS (
      SELECT gp.id AS grupo_id,
             COALESCE(ROUND((CASE WHEN COALESCE(e.total_registros,0)>0 THEN (COALESCE(e.total_presentes,0)::numeric/COALESCE(e.total_registros,0)::numeric)*100 ELSE 0 END),1),0) AS porcentaje,
             COALESCE(e.total_registros,0) AS total_registros
      FROM grupos_perm gp
      LEFT JOIN eventos_agreg e ON e.grupo_id = gp.id
    )
    SELECT jsonb_agg(jsonb_build_object('id', o.grupo_id, 'nombre', g.nombre, 'porcentaje_asistencia', o.porcentaje, 'lideres', COALESCE(l.lideres,'Sin líderes asignados')))
    FROM (
      SELECT grupo_id, porcentaje
      FROM pct
      WHERE (p_incluir_todos = true OR total_registros > 0)
        AND porcentaje < 70
      ORDER BY porcentaje ASC, grupo_id
    ) o
    JOIN public.grupos g ON g.id = o.grupo_id
    LEFT JOIN (
      SELECT gm.grupo_id, STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre||' '||u.apellido) AS lideres
      FROM public.grupo_miembros gm
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE gm.rol = 'Líder'
      GROUP BY gm.grupo_id
    ) l ON l.grupo_id = o.grupo_id
  );

  v_result := jsonb_build_object(
    'semana', jsonb_build_object('inicio', v_fecha_inicio, 'fin', v_fecha_fin, 'numero', v_numero_semana),
    'kpis_globales', v_kpis_globales,
    'tendencia_asistencia_global', COALESCE(v_tendencia, '[]'::jsonb),
    'asistencia_por_segmento', COALESCE(v_por_segmento, '[]'::jsonb),
    'top_5_grupos_perfectos', COALESCE(v_grupos_perfectos, '[]'::jsonb),
    'top_5_grupos_en_riesgo', COALESCE(v_grupos_riesgo, '[]'::jsonb),
    'grupos_en_riesgo_todos', COALESCE(v_grupos_riesgo_todos, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_dashboard_riesgo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_miembros_en_riesgo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_ranking_asistencia_grupo(uuid, uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_asistencia_grupo(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.obtener_dashboard_riesgo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_miembros_en_riesgo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_asistencia_grupo(uuid, uuid, text, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_asistencia_grupo(uuid, uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date, boolean) TO authenticated, service_role;
