-- Reemplaza la función cambiando la firma (drop + create)
DROP FUNCTION IF EXISTS public.obtener_grupos_para_usuario(uuid);

CREATE FUNCTION public.obtener_grupos_para_usuario(p_auth_id uuid)
RETURNS TABLE(
    id uuid,
    nombre text,
    activo boolean,
    segmento_nombre text,
    temporada_nombre text,
    fecha_creacion timestamp with time zone,
    municipio_id uuid,
    municipio_nombre text,
    parroquia_id uuid,
    parroquia_nombre text,
    lideres json,
    miembros_count integer
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
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'admin'
  ) INTO is_admin;

  RETURN QUERY
  SELECT
    g.id,
    g.nombre,
    g.activo,
    s.nombre AS segmento_nombre,
    t.nombre AS temporada_nombre,
    g.fecha_creacion,
    m.id AS municipio_id,
    m.nombre AS municipio_nombre,
    p.id AS parroquia_id,
    p.nombre AS parroquia_nombre,
    lideres_info.lideres_data AS lideres,
    mc.total_miembros AS miembros_count
  FROM
    public.grupos g
  LEFT JOIN public.segmentos s ON g.segmento_id = s.id
  LEFT JOIN public.temporadas t ON g.temporada_id = t.id
  LEFT JOIN public.direcciones d ON g.direccion_anfitrion_id = d.id
  LEFT JOIN public.parroquias p ON d.parroquia_id = p.id
  LEFT JOIN public.municipios m ON p.municipio_id = m.id
  LEFT JOIN (
    SELECT 
      gm.grupo_id,
      json_agg(
        json_build_object(
          'id', u.id,
          'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,''))
        )
      ) AS lideres_data
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON gm.usuario_id = u.id
    WHERE gm.rol IN ('Líder', 'Colíder')
    GROUP BY gm.grupo_id
  ) AS lideres_info ON g.id = lideres_info.grupo_id
  LEFT JOIN (
    SELECT grupo_id, count(*)::int AS total_miembros
    FROM public.grupo_miembros
    GROUP BY grupo_id
  ) AS mc ON mc.grupo_id = g.id
  WHERE is_admin OR public.puede_ver_grupo(internal_user_id, g.id) = true;
END;
$$;
