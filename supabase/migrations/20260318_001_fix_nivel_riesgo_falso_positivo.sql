-- Fix: DOS bugs en v_salud_miembros_grupo
-- 
-- Bug 1: Miembros con 100% asistencia marcados como 'atencion'.
--   Causa: semanas_ausente mide semanas calendario desde última asistencia,
--   no ausencias reales. Fix: si total_ausencias = 0, siempre 'normal'.
--
-- Bug 2: Regresión del JOIN de configuración.
--   20260314_010 tenía COALESCE fallback para campus_id NULL.
--   20260317_001 lo eliminó usando JOIN directo que no matchea.
--   Fix: restaurar CROSS JOIN con subselect COALESCE para thresholds.

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
      FLOOR(EXTRACT(EPOCH FROM age(now(), ua.ultima_vez_presente)) / 604800)::int,
      99
    ) AS semanas_ausente
  FROM grupo_miembros gm
  LEFT JOIN ultima_asistencia ua
    ON ua.usuario_id = gm.usuario_id AND ua.grupo_id = gm.grupo_id
  WHERE gm.estado = 'activo'
),
config_efectiva AS (
  SELECT
    g.id AS grupo_id,
    COALESCE(
      (SELECT c2.umbral_atencion FROM configuracion_grupos_vida c2 WHERE c2.campus_id = g.campus_id),
      (SELECT c2.umbral_atencion FROM configuracion_grupos_vida c2 WHERE c2.campus_id IS NULL),
      2
    ) AS umbral_atencion,
    COALESCE(
      (SELECT c2.umbral_riesgo FROM configuracion_grupos_vida c2 WHERE c2.campus_id = g.campus_id),
      (SELECT c2.umbral_riesgo FROM configuracion_grupos_vida c2 WHERE c2.campus_id IS NULL),
      4
    ) AS umbral_riesgo,
    COALESCE(
      (SELECT c2.umbral_critico FROM configuracion_grupos_vida c2 WHERE c2.campus_id = g.campus_id),
      (SELECT c2.umbral_critico FROM configuracion_grupos_vida c2 WHERE c2.campus_id IS NULL),
      8
    ) AS umbral_critico
  FROM grupos g
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
    -- Si no tiene ausencias reales y tiene eventos registrados, siempre es 'normal'
    WHEN COALESCE(ua.total_ausencias, 0) = 0 AND COALESCE(ua.total_eventos, 0) > 0 THEN 'normal'
    -- Si tiene ausencias o no tiene eventos, usar semanas_ausente + umbrales
    WHEN COALESCE(sw.semanas_ausente, 99) >= ce.umbral_critico THEN 'critico'
    WHEN COALESCE(sw.semanas_ausente, 99) >= ce.umbral_riesgo THEN 'riesgo'
    WHEN COALESCE(sw.semanas_ausente, 99) >= ce.umbral_atencion THEN 'atencion'
    ELSE 'normal'
  END AS nivel_riesgo
FROM grupo_miembros gm
JOIN usuarios u ON u.id = gm.usuario_id
JOIN grupos g ON g.id = gm.grupo_id
LEFT JOIN config_efectiva ce ON ce.grupo_id = gm.grupo_id
LEFT JOIN ultima_asistencia ua ON ua.usuario_id = gm.usuario_id AND ua.grupo_id = gm.grupo_id
LEFT JOIN semanas_sin_ir sw ON sw.usuario_id = gm.usuario_id AND sw.grupo_id = gm.grupo_id
WHERE gm.estado = 'activo';

COMMENT ON VIEW v_salud_miembros_grupo IS 'Vista de salud por miembro: asistencia, semanas ausente, nivel de riesgo dinámico. Usa COALESCE para config campus y solo marca riesgo con ausencias reales.';
