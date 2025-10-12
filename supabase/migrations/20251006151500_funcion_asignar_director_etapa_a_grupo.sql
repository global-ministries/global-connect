-- Crear función para asignar / quitar director(es) de etapa a un grupo específico
-- Solo roles superiores: admin, pastor, director-general
-- También permite re-listar directores actuales del grupo

CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_grupo(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_segmento_lider_id uuid, -- id de la fila en segmento_lideres que representa al director de etapa
  p_accion text -- 'agregar' | 'quitar'
)
RETURNS TABLE(
  director_etapa_grupo_id uuid,
  grupo_id uuid,
  director_etapa_id uuid,
  usuario_id uuid,
  segmento_id uuid
) AS $$
DECLARE
  v_user_id uuid;
  v_es_superior boolean := false;
  v_grupo_segmento uuid;
  v_director_segmento uuid;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL OR p_segmento_lider_id IS NULL OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  SELECT TRUE INTO v_es_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF NOT v_es_superior THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  -- Validar que el grupo exista y tomar su segmento
  SELECT g.segmento_id INTO v_grupo_segmento FROM public.grupos g WHERE g.id = p_grupo_id;
  IF v_grupo_segmento IS NULL THEN
    RAISE EXCEPTION 'Grupo no encontrado';
  END IF;

  -- Validar que el segmento_lider_id corresponde a un director de etapa y segmento compatible
  SELECT sl.segmento_id INTO v_director_segmento FROM public.segmento_lideres sl
  WHERE sl.id = p_segmento_lider_id AND sl.tipo_lider = 'director_etapa';

  IF v_director_segmento IS NULL THEN
    RAISE EXCEPTION 'Director de etapa no válido';
  END IF;

  IF v_director_segmento <> v_grupo_segmento THEN
    RAISE EXCEPTION 'Director de etapa pertenece a otro segmento';
  END IF;

  IF p_accion = 'agregar' THEN
    INSERT INTO public.director_etapa_grupos (id, director_etapa_id, grupo_id)
    VALUES (gen_random_uuid(), p_segmento_lider_id, p_grupo_id)
    ON CONFLICT (director_etapa_id, grupo_id) DO NOTHING;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_grupos
    WHERE director_etapa_id = p_segmento_lider_id AND grupo_id = p_grupo_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida. Use agregar|quitar';
  END IF;

  RETURN QUERY
  SELECT deg.id, deg.grupo_id, deg.director_etapa_id, sl.usuario_id, sl.segmento_id
  FROM public.director_etapa_grupos deg
  JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
  WHERE deg.grupo_id = p_grupo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_grupo(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_grupo(uuid, uuid, uuid, text) TO authenticated, service_role;
