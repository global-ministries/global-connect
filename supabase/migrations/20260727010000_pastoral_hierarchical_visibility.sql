CREATE OR REPLACE FUNCTION public.get_personas_under_me(p_auth_id uuid)
RETURNS TABLE(persona_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  SELECT u.id
  INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_usuario_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) THEN
    RETURN QUERY
      SELECT u.id
      FROM public.usuarios u
      WHERE u.auth_id IS NOT NULL;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno = 'director-general'
  ) THEN
    RETURN QUERY
      SELECT DISTINCT u.id
      FROM public.usuarios u
      JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
      WHERE dgs.usuario_id = v_usuario_id
        AND u.auth_id IS NOT NULL;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno = 'director-etapa'
  ) THEN
    RETURN QUERY
      SELECT DISTINCT u.id
      FROM public.usuarios u
      JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
      JOIN public.grupos g ON g.id = gm.grupo_id
      JOIN public.director_etapa_grupos deg ON deg.grupo_id = g.id
      WHERE deg.director_etapa_id = v_usuario_id
        AND u.auth_id IS NOT NULL;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_usuario_id
      AND rs.nombre_interno IN ('lider', 'colider')
  ) THEN
    RETURN QUERY
      SELECT DISTINCT u.id
      FROM public.usuarios u
      JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
      WHERE gm.grupo_id IN (
        SELECT gm2.grupo_id
        FROM public.grupo_miembros gm2
        WHERE gm2.usuario_id = v_usuario_id
      )
        AND u.auth_id IS NOT NULL;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_usuario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_personas_under_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_personas_under_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_personas_under_me(uuid) TO service_role;
