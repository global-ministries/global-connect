-- Ajuste: KPI total_miembros_asistentes debe contar personas únicas (COUNT(DISTINCT a.usuario_id))
-- Reemplaza la función obtener_reporte_semanal_asistencia manteniendo la lógica previa y modificando solo el cálculo de asistentes

DROP FUNCTION IF EXISTS public.obtener_reporte_semanal_asistencia(uuid, date, boolean);

CREATE OR REPLACE FUNCTION public.obtener_reporte_semanal_asistencia(
  p_auth_id uuid,
  p_fecha_semana date DEFAULT NULL,
  p_incluir_todos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_rol_nombre text;
  v_es_superior boolean := false;
  v_es_director_etapa boolean := false;
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
  -- Usuario y permisos
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  SELECT rs.nombre_interno INTO v_rol_nombre
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
  LIMIT 1;

  IF v_rol_nombre IN ('admin','pastor','director-general') THEN
    v_es_superior := true;
  ELSIF v_rol_nombre = 'director-etapa' THEN
    v_es_director_etapa := true;
  ELSE
    RAISE EXCEPTION 'No tienes permisos para ver este reporte';
  END IF;

  -- Fechas (ISO: lunes a domingo)
  IF p_fecha_semana IS NULL THEN p_fecha_semana := CURRENT_DATE; END IF;
  v_fecha_inicio := p_fecha_semana - (((EXTRACT(ISODOW FROM p_fecha_semana)::int + 6) % 7));
  v_fecha_fin := v_fecha_inicio + INTERVAL '6 days';
  v_numero_semana := EXTRACT(WEEK FROM v_fecha_inicio)::int;
  v_fecha_inicio_anterior := v_fecha_inicio - INTERVAL '7 days';
  v_fecha_fin_anterior := v_fecha_fin - INTERVAL '7 days';

  -- Base común (KPIs)
  WITH grupos_activos AS (
    SELECT g.id, g.segmento_id
    FROM public.grupos g
    WHERE g.activo = true
      AND (
        v_es_superior = true OR (
          v_es_director_etapa = true AND EXISTS (
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        )
      )
  ),
  eventos_semana AS (
    SELECT eg.id AS evento_id, eg.grupo_id, g.segmento_id,
           COUNT(a.id) AS total_registros,
           COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
    FROM public.eventos_grupo eg
    JOIN grupos_activos ga ON ga.id = eg.grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.fecha >= v_fecha_inicio AND eg.fecha <= v_fecha_fin
    GROUP BY eg.id, eg.grupo_id, g.segmento_id
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
      -- Ajuste a DISTINCT: asistentes únicos en la semana
      (
        SELECT COUNT(DISTINCT a.usuario_id)
        FROM public.asistencia a
        JOIN public.eventos_grupo eg2 ON eg2.id = a.evento_grupo_id
        JOIN grupos_activos ga2 ON ga2.id = eg2.grupo_id
        WHERE eg2.fecha >= v_fecha_inicio AND eg2.fecha <= v_fecha_fin AND a.presente = true
      ) AS total_miembros_asistentes,
      (
        SELECT COUNT(DISTINCT gm.usuario_id)
        FROM public.grupo_miembros gm
        JOIN grupos_activos ga3 ON ga3.id = gm.grupo_id
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

  -- El resto de cálculos (tendencia, por segmento, perfectos, riesgo) se mantienen igual
  -- Tendencia 8 semanas (resumen)
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
            WHERE g.activo = true AND (
              v_es_superior = true OR (
                v_es_director_etapa = true AND EXISTS (
                  SELECT 1 FROM public.director_etapa_grupos deg
                  JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                  WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
                )
              )
            )
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
      LEFT JOIN public.eventos_grupo eg ON eg.fecha >= s.semana_inicio AND eg.fecha <= s.semana_fin
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      GROUP BY s.semana_inicio, s.semana_fin
      ORDER BY s.semana_inicio
    )
    SELECT jsonb_agg(jsonb_build_object('semana_inicio', semana_inicio, 'porcentaje', porcentaje)) FROM trend
  );

  -- Por segmento
  v_por_segmento := (
    WITH grupos_perm AS (
      SELECT g.id, g.segmento_id
      FROM public.grupos g
      WHERE g.activo = true AND (
        v_es_superior = true OR (
          v_es_director_etapa = true AND EXISTS (
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        )
      )
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

  -- Grupos perfectos
  v_grupos_perfectos := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true AND (
        v_es_superior = true OR (
          v_es_director_etapa = true AND EXISTS (
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        )
      )
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

  -- Grupos en riesgo TOP 5 (sin 0%)
  v_grupos_riesgo := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true AND (
        v_es_superior = true OR (
          v_es_director_etapa = true AND EXISTS (
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        )
      )
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
      FROM public.grupos g2
      RIGHT JOIN grupos_perm gp ON gp.id = g2.id
      LEFT JOIN eventos_agreg e ON e.grupo_id = gp.id
    )
    SELECT jsonb_agg(jsonb_build_object('id', o.grupo_id, 'nombre', g.nombre, 'porcentaje_asistencia', o.porcentaje, 'lideres', COALESCE(l.lideres,'Sin líderes asignados')))
    FROM (
      SELECT grupo_id, porcentaje
      FROM pct
      WHERE (p_incluir_todos = true OR total_registros > 0)
        AND porcentaje > 0
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

  -- Grupos en riesgo (todos <100%)
  v_grupos_riesgo_todos := (
    WITH grupos_perm AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true AND (
        v_es_superior = true OR (
          v_es_director_etapa = true AND EXISTS (
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        )
      )
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
        AND porcentaje < 100
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

  -- Resultado
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
$$;

REVOKE ALL ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date, boolean) TO authenticated, service_role;
