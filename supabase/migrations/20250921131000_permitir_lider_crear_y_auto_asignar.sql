-- Excepción temporal: permitir a usuarios con rol de sistema 'lider' crear grupos
-- y autoasignarlos como 'Líder' del grupo recién creado.

-- 1) Actualizar regla de permiso
CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid; -- id interno en tabla usuarios
  v_es_admin_o_equivalente boolean := false;
  v_es_director_etapa boolean := false;
  v_es_lider boolean := false; -- excepción temporal
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

  -- Excepción temporal: permitir a usuarios con rol de sistema 'lider'
  SELECT TRUE INTO v_es_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'lider'
  LIMIT 1;

  IF v_es_lider THEN
    RETURN TRUE;
  END IF;

  -- Cualquier otro rol no puede crear
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.puede_crear_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_crear_grupo(uuid, uuid) TO anon, authenticated, service_role;

-- 2) Auto-asignar como 'Líder' al creador del grupo
CREATE OR REPLACE FUNCTION public.crear_grupo(
  p_auth_id uuid,
  p_nombre text,
  p_temporada_id uuid,
  p_segmento_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo_id uuid;
  v_user_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_nombre IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  -- Validar permiso a nivel DB
  IF NOT public.puede_crear_grupo(p_auth_id, p_segmento_id) THEN
    RAISE EXCEPTION 'Permiso denegado para crear grupo en el segmento indicado';
  END IF;

  -- Resolver usuario interno
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  INSERT INTO public.grupos (nombre, temporada_id, segmento_id, activo)
  VALUES (p_nombre, p_temporada_id, p_segmento_id, TRUE)
  RETURNING id INTO v_nuevo_id;

  -- Auto-asignar como líder del nuevo grupo (idempotente)
  INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
  VALUES (v_nuevo_id, v_user_id, 'Líder')
  ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol;

  RETURN v_nuevo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid) TO authenticated, anon, service_role;
