-- Migración: RPC obtener_reporte_retencion
-- Calcula retención entre temporadas: miembros que continúan, nuevos, y no renovaron

CREATE OR REPLACE FUNCTION obtener_reporte_retencion(
  p_auth_id uuid,
  p_temporada_actual_id uuid,
  p_temporada_anterior_id uuid DEFAULT NULL,
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
  v_anterior_id uuid;
BEGIN
  -- Resolver usuario y verificar permisos
  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- Si no se especifica temporada anterior, buscar la más reciente antes de la actual
  IF p_temporada_anterior_id IS NULL THEN
    SELECT t2.id INTO v_anterior_id
    FROM temporadas t1
    JOIN temporadas t2 ON t2.fecha_inicio < t1.fecha_inicio
    WHERE t1.id = p_temporada_actual_id
    ORDER BY t2.fecha_inicio DESC
    LIMIT 1;
  ELSE
    v_anterior_id := p_temporada_anterior_id;
  END IF;

  -- Si no hay temporada anterior, retornar vacío
  IF v_anterior_id IS NULL THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  WITH miembros_anterior AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = v_anterior_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  miembros_actual AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = p_temporada_actual_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  continuaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    INNER JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
  ),
  no_renovaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    LEFT JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
    WHERE mc.usuario_id IS NULL
  ),
  nuevos AS (
    SELECT mc.usuario_id
    FROM miembros_actual mc
    LEFT JOIN miembros_anterior ma ON mc.usuario_id = ma.usuario_id
    WHERE ma.usuario_id IS NULL
  )
  SELECT jsonb_build_object(
    'miembros_que_continuaron', (SELECT COUNT(*) FROM continuaron),
    'miembros_anteriores', (SELECT COUNT(*) FROM miembros_anterior),
    'miembros_nuevos', (SELECT COUNT(*) FROM nuevos),
    'miembros_no_renovaron', (SELECT COUNT(*) FROM no_renovaron),
    'pct_retencion', CASE
      WHEN (SELECT COUNT(*) FROM miembros_anterior) > 0
      THEN ROUND((SELECT COUNT(*) FROM continuaron)::numeric / (SELECT COUNT(*) FROM miembros_anterior) * 100, 1)
      ELSE 0
    END,
    'detalle_no_renovaron', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'usuario_id', nr.usuario_id,
        'nombre', u.nombre || ' ' || u.apellido
      ))
      FROM no_renovaron nr
      JOIN usuarios u ON u.id = nr.usuario_id
      LIMIT 50),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION obtener_reporte_retencion(uuid, uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION obtener_reporte_retencion(uuid, uuid, uuid, uuid) TO authenticated, service_role;
