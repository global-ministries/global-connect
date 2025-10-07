-- Tabla de ubicaciones lógicas de un segmento (ej: Barquisimeto, Cabudare)
CREATE TABLE IF NOT EXISTS public.segmento_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento_id uuid NOT NULL REFERENCES public.segmentos(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (nombre IN ('Barquisimeto','Cabudare')),
  UNIQUE(segmento_id, nombre)
);
COMMENT ON TABLE public.segmento_ubicaciones IS 'Ubicaciones lógicas dentro de un segmento (no dirección física anfitrión).';

-- Relación grupos -> ubicacion (muchos grupos en una ubicación)
ALTER TABLE public.grupos ADD COLUMN IF NOT EXISTS segmento_ubicacion_id uuid NULL REFERENCES public.segmento_ubicaciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_grupos_segmento_ubicacion ON public.grupos(segmento_ubicacion_id);

-- Tabla director_etapa_municipios (ciudades asignadas a director de etapa)
CREATE TABLE IF NOT EXISTS public.director_etapa_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  director_etapa_id uuid NOT NULL REFERENCES public.segmento_lideres(id) ON DELETE CASCADE,
  segmento_ubicacion_id uuid NOT NULL REFERENCES public.segmento_ubicaciones(id) ON DELETE CASCADE,
  UNIQUE(director_etapa_id, segmento_ubicacion_id)
);
COMMENT ON TABLE public.director_etapa_ubicaciones IS 'Asocia un director de etapa a una ubicación (ciudad) del segmento.';

CREATE INDEX IF NOT EXISTS idx_director_ubicaciones_director ON public.director_etapa_ubicaciones(director_etapa_id);
CREATE INDEX IF NOT EXISTS idx_director_ubicaciones_ubicacion ON public.director_etapa_ubicaciones(segmento_ubicacion_id);

-- RPC para asignar/quitar ubicaciones a director de etapa
DROP FUNCTION IF EXISTS public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_ubicacion(
  p_auth_id uuid,
  p_director_etapa_id uuid, -- id de segmento_lideres (tipo director_etapa)
  p_segmento_ubicacion_id uuid,
  p_accion text -- 'agregar' | 'quitar'
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
    VALUES(p_director_etapa_id, p_segmento_ubicacion_id) ON CONFLICT DO NOTHING;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id AND segmento_ubicacion_id = p_segmento_ubicacion_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida';
  END IF;
  RETURN QUERY SELECT id, director_etapa_id, segmento_ubicacion_id FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id;
END;$$;
REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) TO authenticated, service_role;

-- Vista auxiliar para listado de directores con sus ciudades
DROP VIEW IF EXISTS public.v_directores_etapa_segmento;
CREATE VIEW public.v_directores_etapa_segmento AS
SELECT 
  sl.id AS director_etapa_segmento_lider_id,
  sl.usuario_id,
  u.nombre, u.apellido,
  sl.segmento_id,
  array_agg(su.nombre ORDER BY su.nombre) FILTER (WHERE su.id IS NOT NULL) AS ciudades
FROM public.segmento_lideres sl
JOIN public.usuarios u ON u.id = sl.usuario_id
LEFT JOIN public.director_etapa_ubicaciones deu ON deu.director_etapa_id = sl.id
LEFT JOIN public.segmento_ubicaciones su ON su.id = deu.segmento_ubicacion_id
WHERE sl.tipo_lider = 'director_etapa'
GROUP BY sl.id, u.id;

COMMENT ON VIEW public.v_directores_etapa_segmento IS 'Directores de etapa por segmento con ciudades agregadas.';

-- (Opcional) Ajustar obtener_grupos_para_usuario para filtrar por ubicacion futura
-- (Pendiente: se evaluará si se restringe visibilidad por ciudad además de asignaciones específicas)
