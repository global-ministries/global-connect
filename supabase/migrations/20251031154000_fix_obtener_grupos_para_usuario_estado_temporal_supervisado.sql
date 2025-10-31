-- Fix: corregir referencia de supervisado_por_mi y mantener estado_temporal

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
  estado_temporal text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
BEGIN
  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  ) INTO is_admin;

  RETURN QUERY WITH base AS (
    SELECT g.*,
           s.nombre AS segmento_nombre,
           t.nombre AS temporada_nombre,
           g.fecha_creacion,
           p.id AS parroquia_id,
           p.nombre AS parroquia_nombre,
           m.id AS municipio_id,
           m.nombre AS municipio_nombre,
           (
             SELECT json_agg(json_build_object(
               'id', u.id,
               'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
               'rol', gm.rol
             ) ORDER BY gm.rol, u.apellido)
             FROM public.grupo_miembros gm
             JOIN public.usuarios u ON u.id = gm.usuario_id
             WHERE gm.grupo_id = g.id AND gm.rol IN ('Líder','Colíder')
           ) AS lideres,
           (
             SELECT count(*) FROM public.grupo_miembros gm2 WHERE gm2.grupo_id = g.id
           ) AS miembros_count,
           (
             SELECT EXISTS(
               SELECT 1
               FROM public.director_etapa_grupos deg
               JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
               WHERE deg.grupo_id = g.id AND sl.usuario_id = internal_user_id AND sl.tipo_lider = 'director_etapa'
             )
           ) AS supervisado_por_mi,
           CASE
             WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
             WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
             ELSE 'pasado'
           END AS estado_temporal
    FROM public.grupos g
    LEFT JOIN public.segmentos s ON s.id = g.segmento_id
    LEFT JOIN public.temporadas t ON t.id = g.temporada_id
    LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
    LEFT JOIN public.parroquias p ON p.id = d.parroquia_id
    LEFT JOIN public.municipios m ON m.id = p.municipio_id
    WHERE
      (is_admin OR public.puede_ver_grupo(internal_user_id, g.id))
      AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
      AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
      AND (p_activo IS NULL OR g.activo = p_activo)
      AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
      AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
      AND (g.eliminado = COALESCE(p_eliminado, false))
  ), counted AS (
    SELECT *, count(*) OVER() AS total_count FROM base
  )
  SELECT
    id, nombre, activo, eliminado, segmento_nombre, temporada_nombre, fecha_creacion,
    municipio_id, municipio_nombre, parroquia_id, parroquia_nombre, lideres, miembros_count,
    supervisado_por_mi, estado_temporal, total_count
  FROM counted
  ORDER BY fecha_creacion DESC NULLS LAST, nombre ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) TO authenticated;

COMMENT ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean) IS 'Lista grupos visibles para usuario; incluye estado_temporal y flag supervisado_por_mi.';
