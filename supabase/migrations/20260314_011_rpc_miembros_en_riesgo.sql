-- RPC: devuelve todos los miembros con nivel_riesgo != 'normal'
-- Incluye el nombre del grupo para mostrar en la página de listado completo.
CREATE OR REPLACE FUNCTION obtener_miembros_en_riesgo(p_auth_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Verificar que el usuario tiene un rol de director/admin
  IF NOT EXISTS (
    SELECT 1
    FROM usuario_roles ur
    JOIN usuarios u ON u.id = ur.usuario_id
    JOIN roles_sistema r ON r.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND r.nombre_interno IN ('admin', 'pastor', 'director-etapa', 'director-general')
  ) THEN
    RAISE EXCEPTION 'Sin permisos para acceder a este recurso';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.semanas_ausente DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      v.usuario_id,
      v.nombre_completo,
      v.grupo_id,
      g.nombre AS grupo_nombre,
      v.rol,
      v.semanas_ausente,
      v.pct_asistencia,
      v.nivel_riesgo,
      v.ultima_vez_presente
    FROM v_salud_miembros_grupo v
    JOIN grupos g ON g.id = v.grupo_id
    WHERE v.nivel_riesgo != 'normal'
    ORDER BY
      CASE v.nivel_riesgo
        WHEN 'critico' THEN 1
        WHEN 'riesgo' THEN 2
        WHEN 'atencion' THEN 3
      END,
      v.semanas_ausente DESC
    LIMIT 500
  ) q;

  RETURN v_result;
END;
$$;
