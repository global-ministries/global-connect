-- Añade el campo 'rol' dentro del JSON de lideres y NO incluye colíderes como líderes principales en cliente
-- Mantiene compatibilidad ampliando el objeto JSON.
DROP FUNCTION IF EXISTS public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int);

CREATE FUNCTION public.obtener_grupos_para_usuario(
  p_auth_id uuid,
  p_segmento_id uuid DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_activo boolean DEFAULT NULL,
  p_municipio_id uuid DEFAULT NULL,
  p_parroquia_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  nombre text,
  activo boolean,
  segmento_nombre text,
  temporada_nombre text,
  fecha_creacion timestamptz,
  municipio_id uuid,
  municipio_nombre text,
  parroquia_id uuid,
  parroquia_nombre text,
  lideres json,
  miembros_count integer,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
BEGIN
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'admin'
  ) INTO is_admin;

  RETURN QUERY
  WITH base AS (
    SELECT g.*, s.nombre AS seg_nombre, t.nombre AS temp_nombre,
           m.id AS muni_id, m.nombre AS muni_nombre,
           p.id AS parr_id, p.nombre AS parr_nombre
    FROM public.grupos g
    LEFT JOIN public.segmentos s ON g.segmento_id = s.id
    LEFT JOIN public.temporadas t ON g.temporada_id = t.id
    LEFT JOIN public.direcciones d ON g.direccion_anfitrion_id = d.id
    LEFT JOIN public.parroquias p ON d.parroquia_id = p.id
    LEFT JOIN public.municipios m ON p.municipio_id = m.id
    WHERE (is_admin OR public.puede_ver_grupo(internal_user_id, g.id) = true)
      AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
      AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
      AND (p_activo IS NULL OR g.activo = p_activo)
      AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
      AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
  ), counted AS (
    SELECT b.*, (SELECT count(*) FROM base) AS total_count FROM base b
  ), leaders AS (
    SELECT gm.grupo_id,
           json_agg(json_build_object(
             'id', u.id,
             'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
             'rol', gm.rol
           )) AS lideres_data
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON gm.usuario_id = u.id
    WHERE gm.rol IN ('Líder','Colíder')
    GROUP BY gm.grupo_id
  ), members AS (
    SELECT grupo_id, count(*)::int AS total_miembros
    FROM public.grupo_miembros
    GROUP BY grupo_id
  )
  SELECT c.id, c.nombre, c.activo, c.seg_nombre AS segmento_nombre,
         c.temp_nombre AS temporada_nombre, c.fecha_creacion,
         c.muni_id AS municipio_id, c.muni_nombre AS municipio_nombre,
         c.parr_id AS parroquia_id, c.parr_nombre AS parroquia_nombre,
         l.lideres_data AS lideres, m.total_miembros AS miembros_count,
         c.total_count
  FROM counted c
  LEFT JOIN leaders l ON l.grupo_id = c.id
  LEFT JOIN members m ON m.grupo_id = c.id
  ORDER BY c.fecha_creacion DESC NULLS LAST, c.nombre ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario TO authenticated;
