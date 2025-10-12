-- Fix: Re-crear función obtener_kpis_grupos_para_usuario asegurando coincidencia exacta de columnas
-- Motivo: error runtime "structure of query does not match function result type" probablemente por versión previa distinta.

DROP FUNCTION IF EXISTS public.obtener_kpis_grupos_para_usuario(uuid);

CREATE OR REPLACE FUNCTION public.obtener_kpis_grupos_para_usuario(p_auth_id uuid)
RETURNS TABLE (
  total_grupos integer,
  total_con_lider integer,
  pct_con_lider numeric,
  total_aprobados integer,
  pct_aprobados numeric,
  promedio_miembros numeric,
  desviacion_miembros numeric,
  total_sin_director integer,
  pct_sin_director numeric,
  fecha_ultima_actualizacion timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_es_superior boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = p_auth_id AND r.nombre_interno IN ('admin','pastor','director-general')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = p_auth_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = p_auth_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = p_auth_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = p_auth_id AND gm2.rol = 'Líder'
      ))
    )
  ), agregados AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL) AS con_lider,
      COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado') AS aprobados,
      COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL) AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;$$;

REVOKE ALL ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) TO authenticated, service_role;
