-- Migración: Mejora RPC obtener_dashboard_riesgo con datos enriquecidos
-- Agrega: distribución de riesgo, detalle de miembros críticos, segmentos, grupos sin reunión

CREATE OR REPLACE FUNCTION obtener_dashboard_riesgo(
  p_auth_id uuid,
  p_campus_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id uuid;
  v_resultado jsonb;
BEGIN
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  WITH stats AS (
    SELECT
      COUNT(DISTINCT g.id) AS total_grupos,
      COUNT(DISTINCT g.id) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM eventos_grupo eg
          WHERE eg.grupo_id = g.id
          AND eg.fecha >= (CURRENT_DATE - interval '7 days')
        )
      ) AS grupos_sin_reunion_esta_semana,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'critico') AS miembros_criticos,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'riesgo') AS miembros_en_riesgo,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'atencion') AS miembros_en_atencion,
      COUNT(DISTINCT v.usuario_id) FILTER (WHERE v.nivel_riesgo = 'normal') AS miembros_sanos,
      COUNT(DISTINCT v.usuario_id) AS total_miembros,
      (SELECT COUNT(*) FROM solicitudes_grupo sg
       JOIN grupos g2 ON g2.id = sg.grupo_id
       WHERE sg.estado = 'pendiente'
       AND (p_campus_id IS NULL OR g2.campus_id = p_campus_id)) AS solicitudes_pendientes,
      COALESCE(SUM(eg2.conteo_visitantes) FILTER (
        WHERE eg2.fecha >= date_trunc('month', now())
      ), 0) AS visitantes_del_mes
    FROM grupos g
    LEFT JOIN v_salud_miembros_grupo v ON v.grupo_id = g.id
    LEFT JOIN eventos_grupo eg2 ON eg2.grupo_id = g.id
    WHERE g.activo = true
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  -- Distribución de riesgo para donut chart
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
      JOIN grupos g ON g.id = v.grupo_id
      WHERE g.activo = true
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    ) sub
  ),
  -- Top 5 grupos con mayor riesgo
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
      WHERE g.activo = true
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
      GROUP BY g.id, g.nombre
      HAVING COUNT(*) FILTER (WHERE v.nivel_riesgo IN ('riesgo', 'critico')) > 0
      ORDER BY criticos DESC, riesgo_total DESC
      LIMIT 5
    ) sub
  ),
  -- Detalle de miembros críticos (top 10)
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
      ORDER BY semanas_ausente DESC, pct_asistencia ASC
      LIMIT 10
    ) v
    JOIN grupos g ON g.id = v.grupo_id
    WHERE g.activo = true
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  -- Riesgo por segmento
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
      WHERE g.activo = true
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
      GROUP BY s.nombre
    ) sub
  ),
  -- Grupos sin reunión esta semana (detalle)
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
      WHERE g.activo = true
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
      AND NOT EXISTS (
        SELECT 1 FROM eventos_grupo eg
        WHERE eg.grupo_id = g.id
        AND eg.fecha >= (CURRENT_DATE - interval '7 days')
      )
      ORDER BY g.nombre
      LIMIT 10
    ) sub
  ),
  -- Tendencia 4 semanas
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
      JOIN grupos g ON g.id = eg.grupo_id
      WHERE eg.fecha >= now() - interval '4 weeks'
      AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
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
