-- Migración: RPC obtener_reporte_crecimiento_neto
-- Calcula timeline de crecimiento: ingresos - egresos por mes

CREATE OR REPLACE FUNCTION obtener_reporte_crecimiento_neto(
  p_auth_id uuid,
  p_grupo_id uuid DEFAULT NULL,
  p_campus_id uuid DEFAULT NULL,
  p_meses integer DEFAULT 6
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

  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now() - (p_meses || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS mes
  ),
  ingresos AS (
    SELECT
      date_trunc('month', gm.creado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.creado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  ),
  egresos AS (
    SELECT
      date_trunc('month', gm.actualizado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.estado = 'inactivo'
    AND gm.actualizado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'timeline', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'etiqueta', to_char(m.mes, 'Mon YYYY'),
        'ingresos', COALESCE(i.total, 0),
        'egresos', COALESCE(e.total, 0),
        'neto', COALESCE(i.total, 0) - COALESCE(e.total, 0)
      ) ORDER BY m.mes)
      FROM meses m
      LEFT JOIN ingresos i ON i.mes = m.mes
      LEFT JOIN egresos e ON e.mes = m.mes),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) TO authenticated, service_role;
