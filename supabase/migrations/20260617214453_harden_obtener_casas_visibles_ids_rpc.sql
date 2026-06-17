-- Harden legacy Casas visibility RPC against caller-supplied auth_id spoofing.
-- This migration only replaces the RPC definition and tightens anon execution.

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
  v_tiene_des boolean := false;
  v_result uuid[];
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth_id_required' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'auth_id_spoofed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN RETURN '{}'; END IF;

  SELECT
    COALESCE(bool_or(rs.nombre_interno = 'admin'), false),
    COALESCE(bool_or(rs.nombre_interno = 'pastor'), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-general'), false),
    COALESCE(bool_or(rs.nombre_interno = 'director-etapa'), false),
    COALESCE(bool_or(rs.nombre_interno = 'lider'), false)
  INTO v_es_admin, v_es_pastor, v_es_dg, v_es_de, v_es_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON ur.rol_id = rs.id
  WHERE ur.usuario_id = v_user_id;

  IF v_es_admin OR v_es_pastor THEN
    SELECT array_agg(ca.id)
    INTO v_result
    FROM public.casas_anfitrionas ca;
    RETURN COALESCE(v_result, '{}');
  END IF;

  v_result := '{}';

  IF v_es_dg THEN
    SELECT EXISTS (
      SELECT 1 FROM public.dg_directores_etapa dde WHERE dde.dg_usuario_id = v_user_id
    ) INTO v_tiene_des;

    IF v_tiene_des THEN
      SELECT array_agg(DISTINCT ca.id)
      INTO v_result
      FROM public.casas_anfitrionas ca
      WHERE ca.usuario_id IN (
        SELECT gm.usuario_id
        FROM public.grupo_miembros gm
        JOIN public.grupos g ON g.id = gm.grupo_id
        WHERE g.id IN (
          SELECT deg.grupo_id
          FROM public.director_etapa_grupos deg
          JOIN public.dg_directores_etapa dde ON dde.segmento_lider_id = deg.director_etapa_id
          WHERE dde.dg_usuario_id = v_user_id
        )
        AND g.activo = true AND g.eliminado = false
      )
      OR ca.usuario_id = v_user_id;
    ELSE
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
      OR ca.usuario_id = v_user_id;
    END IF;
    RETURN COALESCE(v_result, '{}');
  END IF;

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

  SELECT array_agg(ca.id)
  INTO v_result
  FROM public.casas_anfitrionas ca
  WHERE ca.usuario_id = v_user_id;

  RETURN COALESCE(v_result, '{}');
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_casas_visibles_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_casas_visibles_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.obtener_casas_visibles_ids(uuid) TO authenticated, service_role;
