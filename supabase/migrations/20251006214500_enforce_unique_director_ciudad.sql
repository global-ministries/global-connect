-- Enforce single city assignment per director_etapa dentro de un segmento
-- Cambia la restricción de (director_etapa_id, segmento_ubicacion_id) a solo director_etapa_id
-- y actualiza la lógica del RPC para hacer upsert (reemplazo) en lugar de permitir múltiples filas.

BEGIN;

-- Drop previous composite unique constraint if exists
ALTER TABLE public.director_etapa_ubicaciones
  DROP CONSTRAINT IF EXISTS director_etapa_ubicaciones_director_etapa_id_segmento_ubicacion_id_key;

-- Add new unique constraint enforcing max 1 ciudad por director
ALTER TABLE public.director_etapa_ubicaciones
  ADD CONSTRAINT director_etapa_ubicaciones_director_unique UNIQUE (director_etapa_id);

-- Replace function with upsert semantics
DROP FUNCTION IF EXISTS public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_ubicacion(
  p_auth_id uuid,
  p_director_etapa_id uuid,
  p_segmento_ubicacion_id uuid,
  p_accion text
) RETURNS TABLE(
  id uuid,
  director_etapa_id uuid,
  segmento_ubicacion_id uuid
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_es_superior boolean := false;
  v_tipo text;
BEGIN
  IF p_auth_id IS NULL OR p_director_etapa_id IS NULL OR p_segmento_ubicacion_id IS NULL OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  SELECT TRUE INTO v_es_superior FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general') LIMIT 1;
  IF NOT v_es_superior THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  SELECT tipo_lider INTO v_tipo FROM public.segmento_lideres WHERE id = p_director_etapa_id;
  IF v_tipo IS DISTINCT FROM 'director_etapa' THEN RAISE EXCEPTION 'No es director_etapa'; END IF;

  IF p_accion = 'agregar' THEN
    INSERT INTO public.director_etapa_ubicaciones(director_etapa_id, segmento_ubicacion_id)
    VALUES(p_director_etapa_id, p_segmento_ubicacion_id)
    ON CONFLICT (director_etapa_id) DO UPDATE SET segmento_ubicacion_id = EXCLUDED.segmento_ubicacion_id;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida';
  END IF;

  RETURN QUERY SELECT id, director_etapa_id, segmento_ubicacion_id FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id;
END;$$;
REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) TO authenticated, service_role;

COMMIT;
