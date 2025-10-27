-- RPC para obtener reporte consolidado de asistencia semanal
-- Incluye KPIs globales, tendencias, comparativas por segmento y grupos destacados/en riesgo
-- Respeta el alcance de datos según el rol del usuario

CREATE OR REPLACE FUNCTION public.obtener_reporte_semanal_asistencia(
  p_auth_id uuid,
  p_fecha_semana date DEFAULT NULL
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
BEGIN
  -- 1. Obtener el user_id interno y rol del solicitante
  SELECT u.id INTO v_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Obtener el rol principal del usuario
  SELECT rs.nombre_interno INTO v_rol_nombre
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
  LIMIT 1;

  -- 2. Validar permisos
  IF v_rol_nombre IN ('admin', 'pastor', 'director-general') THEN
    v_es_superior := true;
  ELSIF v_rol_nombre = 'director-etapa' THEN
    v_es_director_etapa := true;
  ELSE
    RAISE EXCEPTION 'No tienes permisos para ver este reporte';
  END IF;

  -- 3. Calcular el rango de fechas de la semana (domingo a sábado)
  IF p_fecha_semana IS NULL THEN
    p_fecha_semana := CURRENT_DATE;
  END IF;

  -- Calcular inicio de semana (domingo)
  v_fecha_inicio := p_fecha_semana - (EXTRACT(DOW FROM p_fecha_semana)::int);
  v_fecha_fin := v_fecha_inicio + INTERVAL '6 days';
  
  -- Número de semana del año
  v_numero_semana := EXTRACT(WEEK FROM v_fecha_inicio)::int;

  -- Calcular semana anterior para comparación
  v_fecha_inicio_anterior := v_fecha_inicio - INTERVAL '7 days';
  v_fecha_fin_anterior := v_fecha_fin - INTERVAL '7 days';

  -- 4. Base de eventos de la semana: se usará como subconsulta en los cálculos
  -- 5. Calcular KPIs globales
  WITH eventos_semana_anterior AS (
    SELECT 
      COUNT(a.id) FILTER (WHERE a.presente = true)::numeric AS total_presentes,
      COUNT(a.id)::numeric AS total_registros
    FROM public.eventos_grupo eg
    LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
    WHERE eg.fecha >= v_fecha_inicio_anterior
      AND eg.fecha <= v_fecha_fin_anterior
      AND EXISTS (
        SELECT 1 FROM public.grupos g
        WHERE g.id = eg.grupo_id
          AND g.activo = true
          AND (
            v_es_superior = true
            OR (
              v_es_director_etapa = true
              AND EXISTS (
                SELECT 1 FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                WHERE deg.grupo_id = g.id 
                  AND sl.usuario_id = v_user_id 
                  AND sl.tipo_lider = 'director_etapa'
              )
            )
          )
      )
  ),
  kpis AS (
    SELECT
      COALESCE(
        ROUND(
          (SUM(total_presentes)::numeric / NULLIF(SUM(total_registros), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia_global,
      COUNT(DISTINCT evento_id) AS total_reuniones_registradas,
      COUNT(DISTINCT grupo_id) AS total_grupos_con_reunion
    FROM (
      SELECT 
        eg.id AS evento_id,
        eg.grupo_id,
        eg.fecha,
        g.nombre AS grupo_nombre,
        g.segmento_id,
        s.nombre AS segmento_nombre,
        COUNT(a.id) AS total_registros,
        COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
      FROM public.eventos_grupo eg
      JOIN public.grupos g ON g.id = eg.grupo_id
      LEFT JOIN public.segmentos s ON s.id = g.segmento_id
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.fecha >= v_fecha_inicio
        AND eg.fecha <= v_fecha_fin
        AND g.activo = true
        AND (
          v_es_superior = true
          OR (
            v_es_director_etapa = true
            AND EXISTS (
              SELECT 1 FROM public.director_etapa_grupos deg
              JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
              WHERE deg.grupo_id = g.id 
                AND sl.usuario_id = v_user_id 
                AND sl.tipo_lider = 'director_etapa'
            )
          )
        )
      GROUP BY eg.id, eg.grupo_id, eg.fecha, g.nombre, g.segmento_id, s.nombre
    ) es
  ),
  porcentaje_anterior AS (
    SELECT
      COALESCE(
        ROUND(
          (SUM(total_presentes) / NULLIF(SUM(total_registros), 0)) * 100,
          1
        ),
        0
      ) AS porcentaje
    FROM eventos_semana_anterior
  )
  SELECT jsonb_build_object(
    'porcentaje_asistencia_global', k.porcentaje_asistencia_global,
    'variacion_semana_anterior', ROUND(k.porcentaje_asistencia_global - pa.porcentaje, 1),
    'total_reuniones_registradas', k.total_reuniones_registradas,
    'total_grupos_con_reunion', k.total_grupos_con_reunion
  )
  INTO v_kpis_globales
  FROM kpis k, porcentaje_anterior pa;

  -- 6. Calcular tendencia de las últimas 8 semanas
  v_tendencia := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'semana_inicio', semana_inicio,
        'porcentaje', porcentaje
      )
    )
    FROM (
      SELECT 
        s.semana_inicio,
        COALESCE(
          ROUND(
            (COUNT(a.id) FILTER (WHERE a.presente = true)::numeric / 
             NULLIF(COUNT(a.id), 0)::numeric) * 100,
            1
          ),
          0
        ) AS porcentaje
      FROM (
        SELECT 
          v_fecha_inicio - (n * INTERVAL '7 days') AS semana_inicio,
          v_fecha_fin - (n * INTERVAL '7 days') AS semana_fin
        FROM generate_series(0, 7) AS n
      ) s
      LEFT JOIN public.eventos_grupo eg ON eg.fecha >= s.semana_inicio AND eg.fecha <= s.semana_fin
      LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
      WHERE eg.id IS NULL OR EXISTS (
        SELECT 1 FROM public.grupos g
        WHERE g.id = eg.grupo_id
          AND g.activo = true
          AND (
            v_es_superior = true
            OR (
              v_es_director_etapa = true
              AND EXISTS (
                SELECT 1 FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                WHERE deg.grupo_id = g.id 
                  AND sl.usuario_id = v_user_id 
                  AND sl.tipo_lider = 'director_etapa'
              )
            )
          )
      )
      GROUP BY s.semana_inicio
      ORDER BY s.semana_inicio ASC
    ) tendencia_data
  );

  -- 7. Asistencia por segmento
  v_por_segmento := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', segmento_id,
        'nombre', COALESCE(segmento_nombre, 'Sin segmento'),
        'porcentaje_asistencia', COALESCE(
          ROUND((presentes::numeric / NULLIF(registros, 0)::numeric) * 100, 1),
          0
        ),
        'total_reuniones', total_reuniones
      )
      ORDER BY (presentes::numeric / NULLIF(registros, 0)::numeric) DESC
    )
    FROM (
      SELECT 
        segmento_id,
        segmento_nombre,
        SUM(total_presentes) AS presentes,
        SUM(total_registros) AS registros,
        COUNT(DISTINCT evento_id) AS total_reuniones
      FROM (
        SELECT 
          eg.id AS evento_id,
          eg.grupo_id,
          eg.fecha,
          g.nombre AS grupo_nombre,
          g.segmento_id,
          s.nombre AS segmento_nombre,
          COUNT(a.id) AS total_registros,
          COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
        FROM public.eventos_grupo eg
        JOIN public.grupos g ON g.id = eg.grupo_id
        LEFT JOIN public.segmentos s ON s.id = g.segmento_id
        LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
        WHERE eg.fecha >= v_fecha_inicio
          AND eg.fecha <= v_fecha_fin
          AND g.activo = true
          AND (
            v_es_superior = true
            OR (
              v_es_director_etapa = true
              AND EXISTS (
                SELECT 1 FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                WHERE deg.grupo_id = g.id 
                  AND sl.usuario_id = v_user_id 
                  AND sl.tipo_lider = 'director_etapa'
              )
            )
          )
        GROUP BY eg.id, eg.grupo_id, eg.fecha, g.nombre, g.segmento_id, s.nombre
      ) es
      WHERE segmento_id IS NOT NULL
      GROUP BY segmento_id, segmento_nombre
    ) segmento_stats
  );

  -- 8. Top 5 grupos con 100% de asistencia
  v_grupos_perfectos := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', grupo_id,
        'nombre', grupo_nombre,
        'lideres', COALESCE(lideres, 'Sin líderes asignados')
      )
    )
    FROM (
      SELECT 
        es.grupo_id,
        es.grupo_nombre,
        ROUND((SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros), 0)::numeric) * 100, 1) AS porcentaje,
        STRING_AGG(
          DISTINCT u.nombre || ' ' || u.apellido,
          ', '
          ORDER BY u.nombre || ' ' || u.apellido
        ) AS lideres
      FROM (
        SELECT 
          eg.id AS evento_id,
          eg.grupo_id,
          eg.fecha,
          g.nombre AS grupo_nombre,
          g.segmento_id,
          s.nombre AS segmento_nombre,
          COUNT(a.id) AS total_registros,
          COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
        FROM public.eventos_grupo eg
        JOIN public.grupos g ON g.id = eg.grupo_id
        LEFT JOIN public.segmentos s ON s.id = g.segmento_id
        LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
        WHERE eg.fecha >= v_fecha_inicio
          AND eg.fecha <= v_fecha_fin
          AND g.activo = true
          AND (
            v_es_superior = true
            OR (
              v_es_director_etapa = true
              AND EXISTS (
                SELECT 1 FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                WHERE deg.grupo_id = g.id 
                  AND sl.usuario_id = v_user_id 
                  AND sl.tipo_lider = 'director_etapa'
              )
            )
          )
        GROUP BY eg.id, eg.grupo_id, eg.fecha, g.nombre, g.segmento_id, s.nombre
      ) es
      LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = es.grupo_id AND gm.rol = 'Líder'
      LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
      GROUP BY es.grupo_id, es.grupo_nombre
        HAVING ROUND((SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros), 0)::numeric) * 100, 1) = 100
        ORDER BY es.grupo_nombre
        LIMIT 5
    ) grupos_perfectos
  );

  -- 9. Top 5 grupos en riesgo (menor asistencia)
  v_grupos_riesgo := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', grupo_id,
        'nombre', grupo_nombre,
        'porcentaje_asistencia', porcentaje_asistencia,
        'lideres', COALESCE(lideres, 'Sin líderes asignados')
      )
    )
    FROM (
      SELECT 
        es.grupo_id,
        es.grupo_nombre,
        ROUND((SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros), 0)::numeric) * 100, 1) AS porcentaje_asistencia,
        STRING_AGG(
          DISTINCT u.nombre || ' ' || u.apellido,
          ', '
          ORDER BY u.nombre || ' ' || u.apellido
        ) AS lideres
      FROM (
        SELECT 
          eg.id AS evento_id,
          eg.grupo_id,
          eg.fecha,
          g.nombre AS grupo_nombre,
          g.segmento_id,
          s.nombre AS segmento_nombre,
          COUNT(a.id) AS total_registros,
          COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
        FROM public.eventos_grupo eg
        JOIN public.grupos g ON g.id = eg.grupo_id
        LEFT JOIN public.segmentos s ON s.id = g.segmento_id
        LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
        WHERE eg.fecha >= v_fecha_inicio
          AND eg.fecha <= v_fecha_fin
          AND g.activo = true
          AND (
            v_es_superior = true
            OR (
              v_es_director_etapa = true
              AND EXISTS (
                SELECT 1 FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                WHERE deg.grupo_id = g.id 
                  AND sl.usuario_id = v_user_id 
                  AND sl.tipo_lider = 'director_etapa'
              )
            )
          )
        GROUP BY eg.id, eg.grupo_id, eg.fecha, g.nombre, g.segmento_id, s.nombre
      ) es
      LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = es.grupo_id AND gm.rol = 'Líder'
      LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
      GROUP BY es.grupo_id, es.grupo_nombre
      HAVING SUM(es.total_registros) > 0
      ORDER BY (SUM(es.total_presentes)::numeric / NULLIF(SUM(es.total_registros), 0)::numeric) ASC
      LIMIT 5
    ) grupos_riesgo
  );

  -- Fin de cálculos

  -- 10. Construir resultado final
  v_result := jsonb_build_object(
    'semana', jsonb_build_object(
      'inicio', v_fecha_inicio,
      'fin', v_fecha_fin,
      'numero', v_numero_semana
    ),
    'kpis_globales', v_kpis_globales,
    'tendencia_asistencia_global', COALESCE(v_tendencia, '[]'::jsonb),
    'asistencia_por_segmento', COALESCE(v_por_segmento, '[]'::jsonb),
    'top_5_grupos_perfectos', COALESCE(v_grupos_perfectos, '[]'::jsonb),
    'top_5_grupos_en_riesgo', COALESCE(v_grupos_riesgo, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_semanal_asistencia(uuid, date) TO authenticated, service_role;

-- Comentario
COMMENT ON FUNCTION public.obtener_reporte_semanal_asistencia IS 'Genera reporte consolidado de asistencia semanal con KPIs, tendencias y análisis por segmento. Respeta permisos: admin/pastor/director-general ven todos los datos, director-etapa solo sus grupos asignados.';
