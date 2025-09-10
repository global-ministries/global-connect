-- Función RPC corregida para estadísticas usando estructura existente
-- Usa segmento_lideres, grupo_miembros, familias y relaciones_usuarios

CREATE OR REPLACE FUNCTION public.obtener_estadisticas_usuarios_con_permisos(
  p_auth_id uuid
)
RETURNS TABLE (
  total_usuarios bigint,
  con_email bigint,
  con_telefono bigint,
  registrados_hoy bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  usuario_rol text;
  usuario_interno_id uuid;
  query_base text;
  query_where text := '';
BEGIN
  -- Obtener el ID interno del usuario y su rol
  SELECT u.id, rs.nombre_interno
  INTO usuario_interno_id, usuario_rol
  FROM usuarios u
  JOIN usuario_roles ur ON u.id = ur.usuario_id
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  WHERE u.auth_id = p_auth_id
  LIMIT 1;

  -- Si no se encuentra el usuario, retornar ceros
  IF usuario_interno_id IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  -- Query base común
  query_base := '
    SELECT DISTINCT u.id, u.email, u.telefono, u.fecha_registro
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
    LEFT JOIN roles_sistema rs ON ur.rol_id = rs.id
  ';

  -- Construir WHERE según el rol del usuario
  CASE usuario_rol
    WHEN 'admin', 'pastor', 'director-general' THEN
      -- Pueden ver todos los usuarios
      query_where := ' WHERE 1=1 ';
      
    WHEN 'director-etapa' THEN
      -- Solo usuarios de grupos en sus segmentos asignados
      query_where := format('
        WHERE u.id IN (
          SELECT DISTINCT gm.usuario_id
          FROM grupo_miembros gm
          JOIN grupos g ON gm.grupo_id = g.id
          JOIN segmento_lideres sl ON g.segmento_id = sl.segmento_id
          WHERE sl.usuario_id = %L
            AND sl.tipo_lider = ''director_etapa''
            AND gm.fecha_salida IS NULL
        )
      ', usuario_interno_id);
      
    WHEN 'lider' THEN
      -- Solo usuarios de grupos donde es líder (rol = 'Líder')
      query_where := format('
        WHERE u.id IN (
          SELECT DISTINCT gm.usuario_id
          FROM grupo_miembros gm
          JOIN grupo_miembros gm_lider ON gm.grupo_id = gm_lider.grupo_id
          WHERE gm_lider.usuario_id = %L
            AND gm_lider.rol = ''Líder''
            AND gm_lider.fecha_salida IS NULL
            AND gm.fecha_salida IS NULL
        )
      ', usuario_interno_id);
      
    WHEN 'miembro' THEN
      -- Solo usuarios de su familia y relaciones familiares
      query_where := format('
        WHERE (
          u.familia_id = (SELECT familia_id FROM usuarios WHERE id = %L)
          OR u.id IN (
            SELECT CASE 
              WHEN ru.usuario1_id = %L THEN ru.usuario2_id
              ELSE ru.usuario1_id
            END
            FROM relaciones_usuarios ru
            WHERE ru.usuario1_id = %L OR ru.usuario2_id = %L
          )
          OR u.id = %L
        )
      ', usuario_interno_id, usuario_interno_id, usuario_interno_id, usuario_interno_id, usuario_interno_id);
      
    ELSE
      -- Rol no reconocido, no puede ver nada
      query_where := ' WHERE 1=0 ';
  END CASE;

  -- Ejecutar consulta y calcular estadísticas
  RETURN QUERY EXECUTE format('
    SELECT 
      COUNT(*)::bigint as total_usuarios,
      COUNT(CASE WHEN email IS NOT NULL AND email != '''' THEN 1 END)::bigint as con_email,
      COUNT(CASE WHEN telefono IS NOT NULL AND telefono != '''' THEN 1 END)::bigint as con_telefono,
      COUNT(CASE WHEN DATE(fecha_registro) = CURRENT_DATE THEN 1 END)::bigint as registrados_hoy
    FROM (%s %s) usuarios_permitidos
  ', query_base, query_where);

END;
$$;

-- Dar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos IS 
'Obtiene estadísticas de usuarios según permisos del rol. Usa estructura existente de la base de datos.';
