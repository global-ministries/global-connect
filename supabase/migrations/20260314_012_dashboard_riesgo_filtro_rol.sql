-- Migración: Filtro por rol en obtener_dashboard_riesgo y obtener_miembros_en_riesgo
-- - admin/pastor: ven todo
-- - director-general: ve grupos de sus segmentos asignados
-- - director-etapa: ve solo sus grupos asignados
-- - líder: sin acceso (bloqueado en frontend)

-- =============================================
-- 1. obtener_dashboard_riesgo con filtro por rol
-- =============================================
CREATE OR REPLACE FUNCTION obtener_dashboard_riesgo(
  p_auth_id uuid,
  p_campus_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rol text;
  v_resultado jsonb;
BEGIN
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- Determinar el rol más alto del usuario
  SELECT rs.nombre_interno INTO v_rol
  FROM usuario_roles ur
  JOIN roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY
    CASE rs.nombre_interno
      WHEN 'admin' THEN 1
      WHEN 'pastor' THEN 2
      WHEN 'director-general' THEN 3
      WHEN 'director-etapa' THEN 4
    END
  LIMIT 1;

  IF v_rol IS NULL THEN
    RETURN jsonb_build_object('error', 'Sin permisos');
  END IF;

  WITH grupos_visibles AS (
    SELECT g.id AS grupo_id
    FROM grupos g
    WHERE g.activo = true
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
      AND (
        -- admin/pastor: todo
        v_rol IN ('admin', 'pastor')
        -- director-general: grupos de sus segmentos
        OR (v_rol = 'director-general' AND g.segmento_id IN (
          SELECT dgs.segmento_id FROM director_general_segmentos dgs
          WHERE dgs.usuario_id = v_user_id
        ))
        -- director-etapa: grupos asignados explícitamente
        OR (v_rol = 'director-etapa' AND g.id IN (
          SELECT deg.grupo_id FROM director_etapa_grupos deg
          JOIN segmento_lideres sl ON deg.director_etapa_id = sl.id
          WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
        ))
      )
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT gv.grupo_id) AS total_grupos,
      COUNT(DISTINCT gv.grupo_id) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM eventos_grupo eg
          WHERE eg.grupo_id = gv.grupo_id
          AND eg.fecha >= (CURRENT_DATE - interval '7 days')
        )
      ) AS grupos_sin_reunion_esta_semana,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'critico') AS miembros_criticos,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'riesgo') AS miembros_en_riesgo,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'atencion') AS miembros_en_atencion,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'normal') AS miembros_sanos,
      COUNT(DISTINCT v.usuario_id) AS total_miembros,
      (SELECT COUNT(*) FROM solicitudes_grupo sg
       WHERE sg.grupo_id IN (SELECT grupo_id FROM grupos_visibles)
       AND sg.estado = 'pendiente') AS solicitudes_pendientes,
      COALESCE(SUM(eg2.conteo_visitantes) FILTER (
        WHERE eg2.fecha >= date_trunc('month', now())
      ), 0) AS visitantes_del_mes
    FROM grupos_visibles gv
    LEFT JOIN v_salud_miembros_grupo v ON v.grupo_id = gv.grupo_id
    LEFT JOIN eventos_grupo eg2 ON eg2.grupo_id = gv.grupo_id
  ),
  distribucion AS (
    SELECT jsonb_agg(jsonb_build_object(
      'nivel', sub.nivel,
      'cantidad', sub.cantidad,
      'porcentaje', CASE WHEN sub.total > 0 THEN ROUND(sub.cantidad::numeric / sub.total * 100, 1) ELSE 0 END
    )) AS datos
    FROM (
      SELECT
        unnest(ARRAY['normal', 'atencion', 'riesgo', 'critico']) AS nivel,
        unnest(ARRAY[
          COUNT(*) FILTER (WHERE v.nivel_riesgo = 'normal'),
          COUNT(*) FILTER (WHERE v.nivel_riesgo = 'atencion'),
          COUNT(*) FILTER (WHERE v.nivel_riesgo = 'riesgo'),
          COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico')
        ]) AS cantidad,
        COUNT(*) AS total
      FROM v_salud_miembros_grupo v
      WHERE v.grupo_id IN (SELECT grupo_id FROM grupos_visibles)
    ) sub
  ),
  top_riesgo AS (
    SELECT jsonb_agg(sub ORDER BY sub.criticos DESC, sub.riesgo_total DESC) AS top_5
    FROM (
      SELECT
        g.id AS grupo_id,
        g.nombre AS grupo_nombre,
        COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico') AS criticos,
        COUNT(*) FILTER (WHERE v.nivel_riesgo IN ('riesgo', 'critico')) AS riesgo_total,
        COUNT(*) AS total_miembros
      FROM grupos g
      JOIN v_salud_miembros_grupo v ON v.grupo_id = g.id
      WHERE g.id IN (SELECT grupo_id FROM grupos_visibles)
      GROUP BY g.id, g.nombre
      HAVING COUNT(*) FILTER (WHERE v.nivel_riesgo IN ('riesgo', 'critico')) > 0
      ORDER BY criticos DESC, riesgo_total DESC
      LIMIT 5
    ) sub
  ),
  miembros_crit AS (
    SELECT jsonb_agg(jsonb_build_object(
      'usuario_id', v.usuario_id,
      'nombre', v.nombre_completo,
      'grupo_nombre', g.nombre,
      'grupo_id', g.id,
      'semanas_ausente', v.semanas_ausente,
      'pct_asistencia', v.pct_asistencia,
      'nivel_riesgo', v.nivel_riesgo
    ) ORDER BY v.semanas_ausente DESC, v.pct_asistencia ASC) AS datos
    FROM (
      SELECT * FROM v_salud_miembros_grupo
      WHERE nivel_riesgo IN ('critico', 'riesgo')
        AND grupo_id IN (SELECT grupo_id FROM grupos_visibles)
      ORDER BY semanas_ausente DESC, pct_asistencia ASC
      LIMIT 10
    ) v
    JOIN grupos g ON g.id = v.grupo_id
  ),
  segmentos_riesgo AS (
    SELECT jsonb_agg(jsonb_build_object(
      'segmento_nombre', sub.segmento_nombre,
      'criticos', sub.criticos,
      'riesgo', sub.en_riesgo,
      'atencion', sub.en_atencion,
      'normal', sub.normales,
      'total', sub.total_seg
    ) ORDER BY sub.criticos DESC, sub.en_riesgo DESC) AS datos
    FROM (
      SELECT
        COALESCE(s.nombre, 'Sin segmento') AS segmento_nombre,
        COUNT(*) FILTER (WHERE v.nivel_riesgo = 'critico') AS criticos,
        COUNT(*) FILTER (WHERE v.nivel_riesgo = 'riesgo') AS en_riesgo,
        COUNT(*) FILTER (WHERE v.nivel_riesgo = 'atencion') AS en_atencion,
        COUNT(*) FILTER (WHERE v.nivel_riesgo = 'normal') AS normales,
        COUNT(*) AS total_seg
      FROM v_salud_miembros_grupo v
      JOIN grupos g ON g.id = v.grupo_id
      LEFT JOIN segmentos s ON s.id = g.segmento_id
      WHERE g.id IN (SELECT grupo_id FROM grupos_visibles)
      GROUP BY s.nombre
    ) sub
  ),
  sin_reunion AS (
    SELECT jsonb_agg(jsonb_build_object(
      'grupo_id', sub.grupo_id,
      'grupo_nombre', sub.grupo_nombre,
      'lider_nombre', sub.lider_nombre
    ) ORDER BY sub.grupo_nombre) AS datos
    FROM (
      SELECT
        g.id AS grupo_id,
        g.nombre AS grupo_nombre,
        COALESCE(
          (SELECT u.nombre || ' ' || u.apellido
           FROM grupo_miembros gm
           JOIN usuarios u ON u.id = gm.usuario_id
           WHERE gm.grupo_id = g.id AND gm.rol = 'Líder' AND gm.estado = 'activo'
           LIMIT 1),
          'Sin líder'
        ) AS lider_nombre
      FROM grupos g
      WHERE g.id IN (SELECT grupo_id FROM grupos_visibles)
      AND NOT EXISTS (
        SELECT 1 FROM eventos_grupo eg
        WHERE eg.grupo_id = g.id
        AND eg.fecha >= (CURRENT_DATE - interval '7 days')
      )
      ORDER BY g.nombre
      LIMIT 10
    ) sub
  ),
  tendencia AS (
    SELECT jsonb_agg(jsonb_build_object(
      'semana', to_char(semana, 'DD Mon'),
      'pct', CASE WHEN total > 0 THEN ROUND(presentes::numeric / total * 100, 1) ELSE 0 END
    ) ORDER BY semana) AS datos
    FROM (
      SELECT
        date_trunc('week', eg.fecha)::date AS semana,
        COUNT(*) FILTER (WHERE a.tipo_presencia IN ('presente', 'tarde')) AS presentes,
        COUNT(*) AS total
      FROM asistencia a
      JOIN eventos_grupo eg ON eg.id = a.evento_grupo_id
      WHERE eg.fecha >= now() - interval '4 weeks'
        AND eg.grupo_id IN (SELECT grupo_id FROM grupos_visibles)
      GROUP BY 1
    ) sub
  )
  SELECT jsonb_build_object(
    'total_grupos', s.total_grupos,
    'grupos_sin_reunion_esta_semana', s.grupos_sin_reunion_esta_semana,
    'miembros_criticos', s.miembros_criticos,
    'miembros_en_riesgo', s.miembros_en_riesgo,
    'miembros_en_atencion', s.miembros_en_atencion,
    'miembros_sanos', s.miembros_sanos,
    'total_miembros', s.total_miembros,
    'solicitudes_pendientes', s.solicitudes_pendientes,
    'visitantes_del_mes', s.visitantes_del_mes,
    'top_5_grupos_riesgo', COALESCE(tr.top_5, '[]'::jsonb),
    'tendencia_asistencia_4_semanas', COALESCE(t.datos, '[]'::jsonb),
    'distribucion_riesgo', COALESCE(dr.datos, '[]'::jsonb),
    'miembros_criticos_detalle', COALESCE(mc.datos, '[]'::jsonb),
    'segmentos_riesgo', COALESCE(sr.datos, '[]'::jsonb),
    'grupos_sin_reunion_detalle', COALESCE(snr.datos, '[]'::jsonb)
  ) INTO v_resultado
  FROM stats s
  CROSS JOIN top_riesgo tr
  CROSS JOIN tendencia t
  CROSS JOIN distribucion dr
  CROSS JOIN miembros_crit mc
  CROSS JOIN segmentos_riesgo sr
  CROSS JOIN sin_reunion snr;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION obtener_dashboard_riesgo(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION obtener_dashboard_riesgo(uuid, uuid) TO authenticated, service_role;


-- =============================================
-- 2. obtener_miembros_en_riesgo con filtro por rol
-- =============================================
CREATE OR REPLACE FUNCTION obtener_miembros_en_riesgo(p_auth_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rol text;
  v_result jsonb;
BEGIN
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Determinar el rol más alto
  SELECT rs.nombre_interno INTO v_rol
  FROM usuario_roles ur
  JOIN roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY
    CASE rs.nombre_interno
      WHEN 'admin' THEN 1
      WHEN 'pastor' THEN 2
      WHEN 'director-general' THEN 3
      WHEN 'director-etapa' THEN 4
    END
  LIMIT 1;

  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Sin permisos para acceder a este recurso';
  END IF;

  WITH grupos_visibles AS (
    SELECT g.id AS grupo_id
    FROM grupos g
    WHERE g.activo = true
      AND (
        v_rol IN ('admin', 'pastor')
        OR (v_rol = 'director-general' AND g.segmento_id IN (
          SELECT dgs.segmento_id FROM director_general_segmentos dgs
          WHERE dgs.usuario_id = v_user_id
        ))
        OR (v_rol = 'director-etapa' AND g.id IN (
          SELECT deg.grupo_id FROM director_etapa_grupos deg
          JOIN segmento_lideres sl ON deg.director_etapa_id = sl.id
          WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
        ))
      )
  )
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.semanas_ausente DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      v.usuario_id,
      v.nombre_completo,
      v.grupo_id,
      g.nombre AS grupo_nombre,
      v.rol,
      v.semanas_ausente,
      v.pct_asistencia,
      v.nivel_riesgo,
      v.ultima_vez_presente
    FROM v_salud_miembros_grupo v
    JOIN grupos g ON g.id = v.grupo_id
    WHERE v.nivel_riesgo != 'normal'
      AND v.grupo_id IN (SELECT grupo_id FROM grupos_visibles)
    ORDER BY
      CASE v.nivel_riesgo
        WHEN 'critico' THEN 1
        WHEN 'riesgo' THEN 2
        WHEN 'atencion' THEN 3
      END,
      v.semanas_ausente DESC
    LIMIT 500
  ) q;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION obtener_miembros_en_riesgo(uuid) FROM public;
GRANT EXECUTE ON FUNCTION obtener_miembros_en_riesgo(uuid) TO authenticated, service_role;
