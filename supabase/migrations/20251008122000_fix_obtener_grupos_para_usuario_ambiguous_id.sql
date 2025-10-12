-- Fix: Error 42702 (column reference "id" is ambiguous) en obtener_grupos_para_usuario
-- Causa: uso de g.* + columnas derivadas y luego counted.* provocando ambigüedad al proyectar id en CTE counted.
-- Solución: seleccionar columnas explícitas, sin g.*; nombrar todas consistentemente y evitar colisiones.

DROP FUNCTION IF EXISTS public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean);

CREATE FUNCTION public.obtener_grupos_para_usuario(
  p_auth_id uuid,
  p_segmento_id uuid DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_activo boolean DEFAULT NULL,
  p_municipio_id uuid DEFAULT NULL,
  p_parroquia_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_eliminado boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  nombre text,
  activo boolean,
  eliminado boolean,
  segmento_nombre text,
  temporada_nombre text,
  fecha_creacion timestamptz,
  municipio_id uuid,
  municipio_nombre text,
  parroquia_id uuid,
  parroquia_nombre text,
  lideres json,
  miembros_count integer,
  supervisado_por_mi boolean,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_es_superior boolean;
BEGIN
  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  ) INTO v_es_superior;

  RETURN QUERY WITH base AS (
      SELECT 
        g.id AS g_id,
        g.nombre AS g_nombre,
        g.activo AS g_activo,
        g.eliminado AS g_eliminado,
        s.nombre AS g_segmento_nombre,
        t.nombre AS g_temporada_nombre,
        g.fecha_creacion AS g_fecha_creacion,
        m.id AS g_municipio_id,
        m.nombre AS g_municipio_nombre,
        p.id AS g_parroquia_id,
        p.nombre AS g_parroquia_nombre,
        (
          SELECT json_agg(json_build_object(
            'id', u.id,
            'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
            'rol', gm.rol
          ) ORDER BY gm.rol, u.apellido)
          FROM public.grupo_miembros gm
          JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE gm.grupo_id = g.id AND gm.rol IN ('Líder','Colíder')
        ) AS g_lideres,
        (SELECT count(*) FROM public.grupo_miembros gm2 WHERE gm2.grupo_id = g.id) AS g_miembros_count,
        (
          SELECT EXISTS(
            SELECT 1 FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            WHERE deg.grupo_id = g.id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
          )
        ) AS g_supervisado_por_mi
      FROM public.grupos g
      LEFT JOIN public.segmentos s ON s.id = g.segmento_id
      LEFT JOIN public.temporadas t ON t.id = g.temporada_id
      LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
      LEFT JOIN public.parroquias p ON p.id = d.parroquia_id
      LEFT JOIN public.municipios m ON m.id = p.municipio_id
      WHERE (v_es_superior OR public.puede_ver_grupo(v_user_id, g.id))
        AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
        AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
        AND (p_activo IS NULL OR g.activo = p_activo)
        AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
        AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
        AND (g.eliminado = COALESCE(p_eliminado, false))
    ), counted AS (
      SELECT 
        b.g_id,
        b.g_nombre,
        b.g_activo,
        b.g_eliminado,
        b.g_segmento_nombre,
        b.g_temporada_nombre,
        b.g_fecha_creacion,
        b.g_municipio_id,
        b.g_municipio_nombre,
        b.g_parroquia_id,
        b.g_parroquia_nombre,
        b.g_lideres,
        b.g_miembros_count,
        b.g_supervisado_por_mi,
        count(*) OVER() AS g_total_count
      FROM base b
    )
    SELECT 
      g_id AS id,
      g_nombre AS nombre,
      g_activo AS activo,
      g_eliminado AS eliminado,
      g_segmento_nombre AS segmento_nombre,
      g_temporada_nombre AS temporada_nombre,
      g_fecha_creacion AS fecha_creacion,
      g_municipio_id AS municipio_id,
      g_municipio_nombre AS municipio_nombre,
      g_parroquia_id AS parroquia_id,
      g_parroquia_nombre AS parroquia_nombre,
      g_lideres AS lideres,
      g_miembros_count AS miembros_count,
      g_supervisado_por_mi AS supervisado_por_mi,
      g_total_count AS total_count
    FROM counted
    ORDER BY g_fecha_creacion DESC NULLS LAST, g_nombre ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) TO authenticated;

COMMENT ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) IS 'Lista grupos visibles con soporte papelera y supervisión (sin ambigüedades).';