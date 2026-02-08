-- Migración: 20260208180000_ordenar_miembros_por_parejas.sql
-- Objetivo: Ordenar miembros del grupo por parejas matrimoniales (esposo primero, esposa después)
-- Mantiene jerarquía de roles: Líder → Colíder → Miembro

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
        'rol', gm.rol,
        'foto_perfil_url', u.foto_perfil_url
      )
      ORDER BY 
        -- 1. Jerarquía de rol
        CASE WHEN gm.rol = 'Líder' THEN 1 
             WHEN gm.rol = 'Colíder' THEN 2 
             ELSE 3 END,
        -- 2. ID de pareja (agrupa cónyuges juntos usando el menor ID como identificador)
        COALESCE(
          LEAST(u.id, (
            SELECT CASE 
              WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
              ELSE ru.usuario1_id 
            END
            FROM public.relaciones_usuarios ru
            WHERE ru.tipo_relacion = 'conyuge'
              AND (ru.usuario1_id = u.id OR ru.usuario2_id = u.id)
              -- Verificar que el cónyuge también es miembro del grupo
              AND EXISTS (
                SELECT 1 FROM public.grupo_miembros gm2
                WHERE gm2.grupo_id = g.id
                  AND gm2.usuario_id = CASE 
                    WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
                    ELSE ru.usuario1_id 
                  END
              )
            LIMIT 1
          )),
          u.id  -- Si no tiene cónyuge en el grupo, usa su propio ID
        ),
        -- 3. Género (Masculino primero para que el esposo aparezca antes)
        CASE WHEN u.genero = 'Masculino' THEN 1 
             WHEN u.genero = 'Femenino' THEN 2 
             ELSE 3 END,
        -- 4. Fallback alfabético
        u.nombre, 
        u.apellido
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
