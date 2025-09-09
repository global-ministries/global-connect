-- Devuelve los segmentos donde el usuario (por auth_id) es director de etapa
CREATE OR REPLACE FUNCTION public.obtener_segmentos_para_director(p_auth_id uuid)
RETURNS TABLE(id uuid, nombre text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT s.id, s.nombre
  FROM public.usuarios u
  JOIN public.segmento_lideres sl ON sl.usuario_id = u.id AND sl.tipo_lider = 'director_etapa'
  JOIN public.segmentos s ON s.id = sl.segmento_id
  WHERE u.auth_id = p_auth_id
  ORDER BY s.nombre;
$$;

REVOKE ALL ON FUNCTION public.obtener_segmentos_para_director(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_segmentos_para_director(uuid) TO anon, authenticated, service_role;
