-- Reemplaza y amplía obtener_detalle_grupo para incluir 'puede_gestionar_miembros'
-- y crea RPCs para buscar usuarios y agregar miembros con validaciones de permiso.

-- Asegurar esquema público
SET search_path = public;

-- 1) Detalle del grupo enriquecido
DROP FUNCTION IF EXISTS public.obtener_detalle_grupo(uuid, uuid);
CREATE OR REPLACE FUNCTION public.obtener_detalle_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validación de visibilidad básica
  IF NOT public.puede_ver_grupo(p_auth_id, p_grupo_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', g.id,
    'nombre', g.nombre,
    'segmento_id', g.segmento_id,
    'temporada_id', g.temporada_id,
    'segmento_nombre', s.nombre,
    'temporada_nombre', t.nombre,
    'dia_reunion', g.dia_reunion,
    'hora_reunion', g.hora_reunion,
    'activo', g.activo,
    'notas_privadas', g.notas_privadas,
    'direccion', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', d.id,
      'calle', d.calle,
      'barrio', d.barrio,
      'codigo_postal', d.codigo_postal,
      'referencia', d.referencia,
      'latitud', d.latitud,
      'longitud', d.longitud,
      'parroquia', CASE WHEN pa.id IS NULL THEN NULL ELSE jsonb_build_object('id', pa.id, 'nombre', pa.nombre) END
    ) END,
    'miembros', COALESCE(miembros_data.lista, '[]'::jsonb),
    'puede_gestionar_miembros', public.puede_gestionar_miembros(p_auth_id, p_grupo_id)
  )
  INTO result
  FROM public.grupos g
  LEFT JOIN public.segmentos s ON s.id = g.segmento_id
  LEFT JOIN public.temporadas t ON t.id = g.temporada_id
  LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
  LEFT JOIN public.parroquias pa ON pa.id = d.parroquia_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'nombre', u.nombre,
        'apellido', u.apellido,
        'email', u.email,
        'telefono', u.telefono,
        'rol', gm.rol
      )
      ORDER BY CASE WHEN gm.rol = 'Líder' THEN 1 WHEN gm.rol = 'Colíder' THEN 2 ELSE 3 END, u.nombre, u.apellido
    ) AS lista
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE gm.grupo_id = g.id
  ) miembros_data ON TRUE
  WHERE g.id = p_grupo_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) TO anon, authenticated;

-- 2) Buscar usuarios para añadir a un grupo
DROP FUNCTION IF EXISTS public.buscar_usuarios_para_grupo(uuid, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.buscar_usuarios_para_grupo(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  ya_es_miembro boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.nombre,
    u.apellido,
    u.email,
    u.telefono,
    EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = u.id
    ) AS ya_es_miembro
  FROM public.usuarios u
  WHERE (
    p_query IS NULL OR p_query = '' OR
    u.nombre ILIKE '%' || p_query || '%' OR
    u.apellido ILIKE '%' || p_query || '%' OR
    u.email ILIKE '%' || p_query || '%' OR
    u.telefono ILIKE '%' || p_query || '%'
  )
  ORDER BY u.nombre, u.apellido
  LIMIT COALESCE(p_limit, 10);
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) TO anon, authenticated;

-- 3) Agregar/actualizar miembro en un grupo
DROP FUNCTION IF EXISTS public.agregar_miembro_a_grupo(uuid, uuid, uuid, public.enum_rol_grupo);
CREATE OR REPLACE FUNCTION public.agregar_miembro_a_grupo(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_usuario_id uuid,
  p_rol public.enum_rol_grupo DEFAULT 'Miembro'::public.enum_rol_grupo
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
  VALUES (p_grupo_id, p_usuario_id, p_rol)
  ON CONFLICT (grupo_id, usuario_id)
  DO UPDATE SET rol = EXCLUDED.rol;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.agregar_miembro_a_grupo(uuid, uuid, uuid, public.enum_rol_grupo) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agregar_miembro_a_grupo(uuid, uuid, uuid, public.enum_rol_grupo) TO anon, authenticated;
