-- Define o reemplaza la función para verificar si un usuario puede crear un grupo
-- Reglas:
--  - Admin/Pastor/Director General: puede crear en cualquier segmento
--  - Director de Etapa: puede crear solo en segmentos que supervisa (segmento_lideres)
--  - Líder/Colíder/Miembro: NO pueden crear
-- Firma usa auth_id para comodidad desde el frontend

CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid; -- id interno en tabla usuarios
  v_es_admin_o_equivalente boolean := false;
  v_es_director_etapa boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_segmento_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mapear auth_id a id interno
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor/Director General -> permitido
  SELECT TRUE INTO v_es_admin_o_equivalente
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_es_admin_o_equivalente THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa: solo en segmentos que supervisa
  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_es_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_user_id
        AND sl.tipo_lider = 'director_etapa'
        AND sl.segmento_id = p_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Cualquier otro rol no puede crear
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_crear_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_crear_grupo(uuid, uuid) TO anon, authenticated, service_role;
