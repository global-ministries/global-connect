-- Migración: RPC para obtener IDs de casas anfitrionas visibles según rol del usuario
-- Reglas de visibilidad:
-- 1. admin / pastor → todas las casas
-- 2. director-general → casas cuyos dueños sean miembros de grupos en sus segmentos asignados
-- 3. director-etapa → casas cuyos dueños sean miembros de grupos en sus segmentos + temporadas activas
-- 4. lider → casas cuyos dueños sean miembros de grupos activos que lidera
-- El resultado se devuelve como array de UUIDs para ser usado con un .in() filter.

CREATE OR REPLACE FUNCTION public.obtener_casas_visibles_ids(p_auth_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_pastor boolean := false;
  v_es_dg boolean := false;
  v_es_de boolean := false;
  v_es_lider boolean := false;
  v_result uuid[];
BEGIN
  -- Obtener usuario interno
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN RETURN '{}'; END IF;

  -- Determinar roles
  SELECT
    bool_or(rs.nombre_interno = 'admin') OR bool_or(rs.nombre_interno = 'pastor'),
    bool_or(rs.nombre_interno = 'admin') OR bool_or(rs.nombre_interno = 'pastor'),
    bool_or(rs.nombre_interno = 'director-general'),
    bool_or(rs.nombre_interno = 'director-etapa'),
    bool_or(rs.nombre_interno = 'lider')
  INTO v_es_admin, v_es_pastor, v_es_dg, v_es_de, v_es_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON ur.rol_id = rs.id
  WHERE ur.usuario_id = v_user_id;

  -- Admin / Pastor → todas las casas
  IF v_es_admin OR v_es_pastor THEN
    SELECT array_agg(ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca;
    RETURN COALESCE(v_result, '{}');
  END IF;

  -- Recopilar IDs de casas visibles
  v_result := '{}';

  -- Director General: casas cuyos dueños son miembros de grupos en sus segmentos
  IF v_es_dg THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      WHERE g.segmento_id IN (
        SELECT dgs.segmento_id
        FROM public.director_general_segmentos dgs
        WHERE dgs.usuario_id = v_user_id
      )
      AND g.activo = true AND g.eliminado = false
    )
    -- También incluir casas propias del DG
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  -- Director de Etapa: casas cuyos dueños son miembros de grupos en sus segmentos + temporadas activas
  IF v_es_de THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.segmento_id IN (
        SELECT sl.segmento_id
        FROM public.segmento_lideres sl
        WHERE sl.usuario_id = v_user_id
          AND sl.tipo_lider = 'director_etapa'
      )
      AND t.activa = true
      AND g.activo = true AND g.eliminado = false
    )
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  -- Líder: casas cuyos dueños son miembros de grupos que lidera (activos)
  IF v_es_lider THEN
    SELECT array_agg(DISTINCT ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca
    WHERE ca.usuario_id IN (
      SELECT gm2.usuario_id
      FROM public.grupo_miembros gm2
      WHERE gm2.grupo_id IN (
        SELECT gm.grupo_id
        FROM public.grupo_miembros gm
        JOIN public.grupos g ON g.id = gm.grupo_id
        WHERE gm.usuario_id = v_user_id
          AND gm.rol = 'Líder'
          AND g.activo = true AND g.eliminado = false
          AND g.estado_ciclo = 'activo'
      )
    )
    OR ca.usuario_id = v_user_id;
    RETURN COALESCE(v_result, '{}');
  END IF;

  -- Sin rol relevante: solo su propia casa
  SELECT array_agg(ca.id)
  INTO v_result
  FROM public.casas_anfitrionas ca
  WHERE ca.usuario_id = v_user_id;

  RETURN COALESCE(v_result, '{}');
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_casas_visibles_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_casas_visibles_ids(uuid) TO authenticated, service_role;
