-- RPC: Obtener eventos recientes con notas de líderes
-- Para dashboard de roles superiores (director etapa, director general, pastor, admin)
-- Retorna los últimos 10 eventos que tienen notas no vacías
-- Admin/Pastor: ven TODOS los grupos
-- Director General/Etapa: ven solo sus grupos asignados (via puede_ver_grupo)

CREATE OR REPLACE FUNCTION public.obtener_eventos_con_notas(
  p_auth_id uuid,
  p_limite int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin_pastor boolean := false;
  v_is_director boolean := false;
  v_result jsonb;
BEGIN
  -- 1. Obtener user_id interno
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 2. Verificar rol: admin/pastor ven TODO
  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) INTO v_is_admin_pastor;

  -- 3. Verificar si es director (etapa o general)
  IF NOT v_is_admin_pastor THEN
    SELECT EXISTS(
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_user_id
        AND rs.nombre_interno IN ('director-general', 'director-etapa')
    ) INTO v_is_director;

    IF NOT v_is_director THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  -- 4. Obtener eventos con notas
  -- Admin/Pastor: todos los grupos
  -- Directors: solo los que puede_ver_grupo les permite
  SELECT COALESCE(jsonb_agg(row_data ORDER BY fecha DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'evento_id', eg.id,
      'grupo_id', g.id,
      'grupo_nombre', g.nombre,
      'fecha', eg.fecha,
      'hora', eg.hora,
      'tema', COALESCE(eg.tema, 'Sin tema'),
      'notas', eg.notas,
      'lider_nombre', COALESCE(
        (SELECT u.nombre || ' ' || u.apellido
         FROM public.grupo_miembros gm
         JOIN public.usuarios u ON u.id = gm.usuario_id
         WHERE gm.grupo_id = g.id AND gm.rol::text = 'Líder'
         LIMIT 1),
        'Sin líder'
      ),
      'presentes', (SELECT COUNT(*) FILTER (WHERE a.presente = true) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id),
      'total', (SELECT COUNT(*) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
    ) AS row_data,
    eg.fecha
    FROM public.eventos_grupo eg
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE eg.notas IS NOT NULL
      AND TRIM(eg.notas) != ''
      AND eg.fecha >= CURRENT_DATE - INTERVAL '30 days'
      AND (
        v_is_admin_pastor
        OR public.puede_ver_grupo(v_user_id, g.id)
      )
    ORDER BY eg.fecha DESC
    LIMIT p_limite
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_eventos_con_notas(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_eventos_con_notas(uuid, int) TO authenticated, service_role;
