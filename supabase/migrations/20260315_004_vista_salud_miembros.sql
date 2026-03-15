-- Migración: Vista materializada v_salud_miembros_grupo
-- Calcula: asistencia, semanas ausente, nivel de riesgo dinámico por umbrales de config

CREATE OR REPLACE VIEW v_salud_miembros_grupo AS
WITH ultima_asistencia AS (
  SELECT
    a.usuario_id,
    eg.grupo_id,
    MAX(eg.fecha) FILTER (WHERE a.tipo_presencia IN ('presente', 'tarde')) AS ultima_vez_presente,
    COUNT(*) FILTER (WHERE a.tipo_presencia IN ('presente', 'tarde')) AS total_presencias,
    COUNT(*) FILTER (WHERE a.tipo_presencia = 'ausente') AS total_ausencias,
    COUNT(*) AS total_eventos
  FROM asistencia a
  JOIN eventos_grupo eg ON eg.id = a.evento_grupo_id
  WHERE eg.tipo = 'regular' AND NOT eg.no_hubo_reunion
  GROUP BY a.usuario_id, eg.grupo_id
),
semanas_sin_ir AS (
  SELECT
    gm.usuario_id,
    gm.grupo_id,
    COALESCE(
      EXTRACT(WEEK FROM age(now(), ua.ultima_vez_presente))::int,
      99
    ) AS semanas_ausente
  FROM grupo_miembros gm
  LEFT JOIN ultima_asistencia ua
    ON ua.usuario_id = gm.usuario_id AND ua.grupo_id = gm.grupo_id
  WHERE gm.estado = 'activo'
)
SELECT
  gm.usuario_id,
  gm.grupo_id,
  gm.rol,
  u.nombre || ' ' || u.apellido AS nombre_completo,
  COALESCE(ua.ultima_vez_presente, NULL) AS ultima_vez_presente,
  COALESCE(ua.total_presencias, 0) AS total_presencias,
  COALESCE(ua.total_ausencias, 0) AS total_ausencias,
  COALESCE(ua.total_eventos, 0) AS total_eventos,
  CASE WHEN COALESCE(ua.total_eventos, 0) > 0
    THEN ROUND(ua.total_presencias::numeric / ua.total_eventos * 100, 1)
    ELSE 0
  END AS pct_asistencia,
  COALESCE(sw.semanas_ausente, 99) AS semanas_ausente,
  CASE
    WHEN COALESCE(sw.semanas_ausente, 99) >= c.umbral_critico THEN 'critico'
    WHEN sw.semanas_ausente >= c.umbral_riesgo THEN 'riesgo'
    WHEN sw.semanas_ausente >= c.umbral_atencion THEN 'atencion'
    ELSE 'normal'
  END AS nivel_riesgo
FROM grupo_miembros gm
JOIN usuarios u ON u.id = gm.usuario_id
JOIN grupos g ON g.id = gm.grupo_id
LEFT JOIN configuracion_grupos_vida c ON c.campus_id = g.campus_id
LEFT JOIN ultima_asistencia ua ON ua.usuario_id = gm.usuario_id AND ua.grupo_id = gm.grupo_id
LEFT JOIN semanas_sin_ir sw ON sw.usuario_id = gm.usuario_id AND sw.grupo_id = gm.grupo_id
WHERE gm.estado = 'activo';

COMMENT ON VIEW v_salud_miembros_grupo IS 'Vista de salud por miembro: asistencia, semanas ausente, nivel de riesgo dinámico';
