-- RPC para obtener reporte analítico de asistencia de un usuario específico
-- Incluye KPIs, series temporales (agrupadas por mes) y lista de eventos históricos
-- Requiere validación de permisos: el solicitante debe poder ver al usuario

CREATE OR REPLACE FUNCTION public.obtener_reporte_asistencia_usuario(
  p_usuario_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id uuid;
  v_puede_ver boolean := false;
  v_es_admin boolean := false;
  v_result jsonb;
  v_kpis jsonb;
  v_series_temporales jsonb;
  v_historial_eventos jsonb;
BEGIN
  -- 1. Obtener el user_id interno desde auth_id del solicitante
  SELECT id INTO v_auth_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario solicitante no encontrado');
  END IF;

  -- 2. Validar permisos: el solicitante puede ver el reporte si:
  
  -- 2a. Es el mismo usuario
  IF v_auth_user_id = p_usuario_id THEN
    v_puede_ver := true;
  END IF;

  -- 2b. Es un rol superior (admin, pastor, director-general)
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_auth_user_id
        AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
    ) INTO v_es_admin;
    
    IF v_es_admin THEN
      v_puede_ver := true;
    END IF;
  END IF;

  -- 2c. Es líder de un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 
      FROM public.grupo_miembros gm_lider
      JOIN public.grupo_miembros gm_miembro ON gm_miembro.grupo_id = gm_lider.grupo_id
      WHERE gm_lider.usuario_id = v_auth_user_id
        AND gm_lider.rol = 'Líder'
        AND gm_miembro.usuario_id = p_usuario_id
    ) INTO v_puede_ver;
  END IF;

  -- 2d. Es director de etapa asignado a un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.grupo_miembros gm ON gm.grupo_id = deg.grupo_id
      WHERE deg.usuario_id = v_auth_user_id
        AND gm.usuario_id = p_usuario_id
    ) INTO v_puede_ver;
  END IF;

  -- 2e. Es familiar directo
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.relaciones_usuarios ru
      WHERE (ru.usuario_id = v_auth_user_id AND ru.relacionado_id = p_usuario_id)
         OR (ru.usuario_id = p_usuario_id AND ru.relacionado_id = v_auth_user_id)
    ) INTO v_puede_ver;
  END IF;

  -- Si no tiene permisos, retornar error con debug info
  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object(
      'error', 'Sin permisos para ver este reporte',
      'debug', jsonb_build_object(
        'v_auth_user_id', v_auth_user_id,
        'p_usuario_id', p_usuario_id,
        'v_es_admin', v_es_admin
      )
    );
  END IF;

  -- 3. Establecer fechas por defecto si no se proporcionan (últimos 12 meses)
  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '12 months';
  END IF;
  
  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  -- 4. Calcular KPIs
  WITH eventos_usuario AS (
    SELECT 
      a.id,
      a.presente,
      a.evento_grupo_id,
      eg.grupo_id,
      eg.fecha,
      g.nombre AS grupo_nombre
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  kpis_calc AS (
    SELECT
      -- Porcentaje de asistencia general
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia_general,
      -- Total de grupos activos (grupos donde ha tenido al menos un evento)
      COUNT(DISTINCT grupo_id) AS total_grupos_activos,
      -- Grupo más frecuente
      (
        SELECT jsonb_build_object(
          'id', grupo_id,
          'nombre', grupo_nombre
        )
        FROM eventos_usuario
        GROUP BY grupo_id, grupo_nombre
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS grupo_mas_frecuente,
      -- Última fecha de asistencia
      (
        SELECT MAX(fecha)
        FROM eventos_usuario
        WHERE presente = true
      ) AS ultima_asistencia_fecha
    FROM eventos_usuario
  )
  SELECT jsonb_build_object(
    'porcentaje_asistencia_general', porcentaje_asistencia_general,
    'total_grupos_activos', total_grupos_activos,
    'grupo_mas_frecuente', COALESCE(grupo_mas_frecuente, jsonb_build_object('id', null, 'nombre', 'N/D')),
    'ultima_asistencia_fecha', ultima_asistencia_fecha
  )
  INTO v_kpis
  FROM kpis_calc;

  -- 5. Calcular series temporales (agrupadas por mes)
  WITH eventos_con_mes AS (
    SELECT 
      DATE_TRUNC('month', eg.fecha::timestamp)::date AS mes,
      a.presente
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  series_mensuales AS (
    SELECT
      mes,
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia
    FROM eventos_con_mes
    GROUP BY mes
    ORDER BY mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', mes,
      'porcentaje_asistencia', porcentaje_asistencia
    )
  )
  INTO v_series_temporales
  FROM series_mensuales;

  -- 6. Obtener historial de eventos
  WITH historial AS (
    SELECT 
      eg.fecha,
      g.nombre AS grupo_nombre,
      g.id AS grupo_id,
      eg.tema,
      CASE WHEN a.presente THEN 'Presente' ELSE 'Ausente' END AS estado
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    ORDER BY eg.fecha DESC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'grupo_nombre', grupo_nombre,
      'grupo_id', grupo_id,
      'tema', COALESCE(tema, 'Sin tema'),
      'estado', estado,
      'motivo_ausencia', null
    )
  )
  INTO v_historial_eventos
  FROM historial;

  -- 7. Construir el resultado final
  v_result := jsonb_build_object(
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'series_temporales', COALESCE(v_series_temporales, '[]'::jsonb),
    'historial_eventos', COALESCE(v_historial_eventos, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.obtener_reporte_asistencia_usuario(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_asistencia_usuario(uuid, uuid, date, date) TO authenticated, service_role;
