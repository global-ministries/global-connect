-- Añade parámetro p_contexto_relacion para ampliar visibilidad de líderes en contexto relaciones
DROP FUNCTION IF EXISTS public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, int, int);
CREATE OR REPLACE FUNCTION public.listar_usuarios_con_permisos(
  p_auth_id uuid,
  p_busqueda text DEFAULT '',
  p_roles_filtro text[] DEFAULT '{}',
  p_con_email boolean DEFAULT NULL,
  p_con_telefono boolean DEFAULT NULL,
  p_en_grupo boolean DEFAULT NULL,
  p_limite int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_contexto_relacion boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  cedula text,
  fecha_registro timestamptz,
  rol_nombre_interno text,
  rol_nombre_visible text,
  foto_perfil_url text,
  total_count bigint,
  puede_ver boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  usuario_rol text;
  usuario_interno_id uuid;
  query_base text;
  query_where text := '';
  query_final text;
  total_registros bigint;
BEGIN
  SELECT u.id, rs.nombre_interno
  INTO usuario_interno_id, usuario_rol
  FROM usuarios u
  JOIN usuario_roles ur ON u.id = ur.usuario_id
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  WHERE u.auth_id = p_auth_id
  LIMIT 1;

  IF usuario_interno_id IS NULL THEN
    RETURN;
  END IF;

  query_base := '
    SELECT DISTINCT
      u.id,
      u.nombre,
      u.apellido,
      u.email,
      u.telefono,
      u.cedula,
      u.fecha_registro,
      rs.nombre_interno as rol_nombre_interno,
      rs.nombre_visible as rol_nombre_visible,
      u.foto_perfil_url,
      true as puede_ver
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
    LEFT JOIN roles_sistema rs ON ur.rol_id = rs.id
  ';

  CASE usuario_rol
    WHEN 'admin', 'pastor', 'director-general' THEN
      query_where := ' WHERE 1=1 ';
    WHEN 'director-etapa' THEN
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
      IF p_contexto_relacion THEN
        query_where := ' WHERE 1=1 ';
      ELSE
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
      END IF;
    WHEN 'miembro' THEN
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
      query_where := ' WHERE 1=0 ';
  END CASE;

  IF p_busqueda IS NOT NULL AND p_busqueda != '' THEN
    query_where := query_where || format('
      AND (
        u.nombre ILIKE ''%%%s%%'' 
        OR u.apellido ILIKE ''%%%s%%''
        OR u.email ILIKE ''%%%s%%''
        OR u.cedula ILIKE ''%%%s%%''
      )
    ', p_busqueda, p_busqueda, p_busqueda, p_busqueda);
  END IF;

  IF p_roles_filtro IS NOT NULL AND array_length(p_roles_filtro, 1) > 0 THEN
    query_where := query_where || format('
      AND rs.nombre_interno = ANY(%L)
    ', p_roles_filtro);
  END IF;

  IF p_con_email IS NOT NULL THEN
    IF p_con_email THEN
      query_where := query_where || ' AND u.email IS NOT NULL AND u.email != '''' ';
    ELSE
      query_where := query_where || ' AND (u.email IS NULL OR u.email = '''') ';
    END IF;
  END IF;

  IF p_con_telefono IS NOT NULL THEN
    IF p_con_telefono THEN
      query_where := query_where || ' AND u.telefono IS NOT NULL AND u.telefono != '''' ';
    ELSE
      query_where := query_where || ' AND (u.telefono IS NULL OR u.telefono = '''') ';
    END IF;
  END IF;

  IF p_en_grupo IS NOT NULL THEN
    IF p_en_grupo THEN
      query_where := query_where || ' AND EXISTS (SELECT 1 FROM grupo_miembros gm2 WHERE gm2.usuario_id = u.id AND gm2.fecha_salida IS NULL) ';
    ELSE
      query_where := query_where || ' AND NOT EXISTS (SELECT 1 FROM grupo_miembros gm2 WHERE gm2.usuario_id = u.id AND gm2.fecha_salida IS NULL) ';
    END IF;
  END IF;

  query_final := query_base || query_where || '
    ORDER BY u.nombre, u.apellido
    LIMIT ' || p_limite || ' OFFSET ' || p_offset;

  EXECUTE 'SELECT COUNT(DISTINCT u.id) FROM (' || query_base || query_where || ') u' 
  INTO total_registros;

  RETURN QUERY EXECUTE format('
    SELECT 
      sub.id,
      sub.nombre,
      sub.apellido,
      sub.email,
      sub.telefono,
      sub.cedula,
      sub.fecha_registro,
      sub.rol_nombre_interno,
      sub.rol_nombre_visible,
      sub.foto_perfil_url,
      %L::bigint as total_count,
      sub.puede_ver
    FROM (%s) sub
  ', total_registros, query_final);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_permisos TO authenticated;
