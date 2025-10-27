-- RPC para obtener reporte analítico de asistencia de un grupo
-- Incluye KPIs, series temporales (agrupadas por semana) y lista de eventos históricos
-- Requiere permiso para ver el grupo (puede_ver_grupo)

CREATE OR REPLACE FUNCTION public.obtener_reporte_asistencia_grupo(
  p_grupo_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_puede_ver boolean;
  v_result jsonb;
  v_kpis jsonb;
  v_series_temporales jsonb;
  v_eventos_historial jsonb;
BEGIN
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
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.obtener_reporte_asistencia_grupo(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_asistencia_grupo(uuid, uuid, date, date) TO authenticated, service_role;
