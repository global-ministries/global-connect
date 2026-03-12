-- Migración: RPC obtener_dashboard_riesgo
-- Dashboard KPIs globales para directores: riesgo, retención, tendencias

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
    'solicitudes_pendientes', s.solicitudes_pendientes,
    'visitantes_del_mes', s.visitantes_del_mes,
    'top_5_grupos_riesgo', COALESCE(tr.top_5, '[]'::jsonb),
    'tendencia_asistencia_4_semanas', COALESCE(t.datos, '[]'::jsonb)
  ) INTO v_resultado
  FROM stats s
  CROSS JOIN top_riesgo tr
  CROSS JOIN tendencia t;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION obtener_dashboard_riesgo(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION obtener_dashboard_riesgo(uuid, uuid) TO authenticated, service_role;
