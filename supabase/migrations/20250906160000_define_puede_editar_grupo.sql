-- Permiso para editar la información de un grupo
-- Reglas:
--  - Miembro/Colíder: NO pueden editar
--  - Líder: puede editar los grupos que lidera
--  - Director de Etapa: puede editar los grupos de su segmento
--  - Director General / Pastor / Admin: puede editar cualquier grupo

CREATE OR REPLACE FUNCTION public.puede_editar_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_es_admin_o_equivalente boolean := false;
  v_es_director_etapa boolean := false;
  v_segmento_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Resolver id interno de usuario a partir de auth_id
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor/Director General -> puede editar cualquier grupo
  SELECT TRUE INTO v_es_admin_o_equivalente
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_es_admin_o_equivalente THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa -> sólo grupos de sus segmentos
  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_es_director_etapa THEN
    SELECT g.segmento_id INTO v_segmento_id FROM public.grupos g WHERE g.id = p_grupo_id;
    IF v_segmento_id IS NULL THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_user_id
        AND sl.tipo_lider = 'director_etapa'
        AND sl.segmento_id = v_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder del grupo -> puede editar (Colíder/Miembro no)
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = v_user_id AND gm.rol = 'Líder'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_editar_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_editar_grupo(uuid, uuid) TO anon, authenticated, service_role;
