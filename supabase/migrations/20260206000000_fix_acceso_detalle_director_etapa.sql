-- Migración: 20260206000000_fix_acceso_detalle_director_etapa.sql
-- Objetivo: Sincronizar permisos de roles superiores en el detalle del grupo y asegurar visibilidad para directores de etapa

-- 1. Asegurar que puede_ver_grupo sea robusta y SECURITY DEFINER
-- NOTA: No se usa DROP porque hay policies RLS que dependen de esta función
CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_superior boolean := false;
  v_is_director_etapa boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor/Director General: acceso total (incluye grupos inactivos/futuros)
  SELECT TRUE INTO v_is_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_is_superior THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa: acceso si está asignado explícitamente al grupo
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro: solo si pertenece al grupo
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Actualizar obtener_detalle_grupo para incluir a todos los roles superiores en el bypass
DROP FUNCTION IF EXISTS public.obtener_detalle_grupo(uuid, uuid);
CREATE OR REPLACE FUNCTION public.obtener_detalle_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_superior boolean := false;
  result jsonb;
BEGIN
  -- Mapear auth_id al id interno del usuario
  IF p_auth_id IS NOT NULL THEN
    SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    IF internal_user_id IS NOT NULL THEN
      -- Sincronizado con obtener_grupos_para_usuario: admin, pastor, director-general
      SELECT EXISTS (
        SELECT 1 FROM public.usuario_roles ur
        JOIN public.roles_sistema rs ON ur.rol_id = rs.id
        WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
      ) INTO is_superior;
    END IF;
  END IF;

  -- Validación de visibilidad (roles superiores o permiso explícito vía puede_ver_grupo)
  IF NOT (is_superior OR public.puede_ver_grupo(internal_user_id, p_grupo_id) = true) THEN
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
    'puede_gestionar_miembros', public.puede_gestionar_miembros(p_auth_id, p_grupo_id),
    'rol_en_grupo', (
      SELECT gm.rol FROM public.grupo_miembros gm
      WHERE gm.grupo_id = g.id AND gm.usuario_id = internal_user_id
      LIMIT 1
    )
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
