-- RPC: Obtener ranking de asistencia de miembros de un grupo
-- Retorna todos los miembros con su conteo de asistencias y ausencias
-- ordenados según el modo solicitado (constantes o ausentes)

CREATE OR REPLACE FUNCTION public.obtener_ranking_asistencia_grupo(
  p_grupo_id uuid,
  p_auth_id uuid,
  p_modo text DEFAULT 'constantes', -- 'constantes' o 'ausentes'
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
BEGIN
  -- 1. Obtener user_id interno
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- 2. Validar permisos
  SELECT public.puede_ver_grupo(v_user_id, p_grupo_id) INTO v_puede_ver;

  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object('error', 'Sin permisos para ver este grupo');
  END IF;

  -- 3. Fechas por defecto (últimos 6 meses)
  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '6 months';
  END IF;

  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  -- 4. Calcular ranking
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
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.obtener_ranking_asistencia_grupo(uuid, uuid, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_asistencia_grupo(uuid, uuid, text, date, date) TO authenticated, service_role;
