CREATE OR REPLACE FUNCTION public.obtener_grupos_para_usuario(p_auth_id uuid)
RETURNS TABLE(
    id uuid,
    nombre text,
    activo boolean,
    segmento_nombre text,
    temporada_nombre text,
    municipio_id uuid,
    municipio_nombre text,
    parroquia_id uuid,
    parroquia_nombre text,
    lideres json
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
BEGIN
  -- Obtener el ID interno del usuario a partir del auth_id
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;

  -- Si no se encuentra un perfil, no devolver nada
  IF internal_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Verificar si el usuario es administrador
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'admin'
  ) INTO is_admin;

  -- Devolver la consulta de grupos
  RETURN QUERY
  SELECT
    g.id,
    g.nombre,
    g.activo,
    s.nombre AS segmento_nombre,
    t.nombre AS temporada_nombre,
    m.id AS municipio_id,
    m.nombre AS municipio_nombre,
    p.id AS parroquia_id,
    p.nombre AS parroquia_nombre,
    lideres_info.lideres_data AS lideres
  FROM
    public.grupos g
  LEFT JOIN
    public.segmentos s ON g.segmento_id = s.id
  LEFT JOIN
    public.temporadas t ON g.temporada_id = t.id
  LEFT JOIN
    public.direcciones d ON g.direccion_anfitrion_id = d.id
  LEFT JOIN
    public.parroquias p ON d.parroquia_id = p.id
  LEFT JOIN
    public.municipios m ON p.municipio_id = m.id
  LEFT JOIN (
    SELECT 
        gm.grupo_id,
        json_agg(json_build_object('id', u.id, 'nombre_completo', u.nombre_completo)) AS lideres_data
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON gm.usuario_id = u.id
    WHERE gm.rol IN ('Líder', 'Colíder')
    GROUP BY gm.grupo_id
  ) AS lideres_info ON g.id = lideres_info.grupo_id
  WHERE
    -- Si es admin, devuelve todos los grupos; si no, verifica el permiso
    is_admin OR public.puede_ver_grupo(internal_user_id, g.id) = true;

END;
$$;
