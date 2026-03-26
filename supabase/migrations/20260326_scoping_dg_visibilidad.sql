-- Migración: Scoping de visibilidad para Directores Generales
-- Objetivo: Un DG solo ve grupos cuyos segmentos tiene asignados en director_general_segmentos
-- Impacto: Solo lógica de funciones, NO toca datos existentes

-- ============================================================
-- 1. puede_ver_grupo: DG ya no es "admin", se scopa por segmento
-- ============================================================

CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_superior boolean := false;
  v_is_dg boolean := false;
  v_is_director_etapa boolean := false;
  v_is_grupo_futuro boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor: acceso total (incluye grupos inactivos/futuros)
  SELECT TRUE INTO v_is_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;

  IF v_is_superior THEN
    RETURN TRUE;
  END IF;

  -- Director General: acceso solo a grupos dentro de sus segmentos asignados
  SELECT TRUE INTO v_is_dg
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;

  IF v_is_dg THEN
    IF EXISTS (
      SELECT 1
      FROM public.grupos g
      JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
      WHERE g.id = p_grupo_id
        AND dgs.usuario_id = p_user_id
    ) THEN
      RETURN TRUE;
    END IF;
    -- DG sin segmento asignado para este grupo: denegar
    -- (no caer al chequeo de miembro/líder)
    RETURN FALSE;
  END IF;

  -- Director de Etapa: acceso si está asignado explícitamente al grupo (incluye futuros)
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro: solo si pertenece al grupo Y el grupo NO es futuro
  SELECT EXISTS (
    SELECT 1 FROM public.grupos g
    JOIN public.temporadas t ON t.id = g.temporada_id
    WHERE g.id = p_grupo_id AND t.fecha_inicio > CURRENT_DATE
  ) INTO v_is_grupo_futuro;

  IF v_is_grupo_futuro THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.grupos g
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.id = p_grupo_id
        AND g.activo IS TRUE
        AND t.activa IS TRUE
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.puede_ver_grupo(uuid, uuid) IS 'Verifica si un usuario puede ver un grupo. DG solo ve grupos de sus segmentos asignados. Líderes/miembros NO ven grupos futuros.';


-- ============================================================
-- 2. obtener_grupos_para_usuario: DG scopeado por segmentos
-- ============================================================

DROP FUNCTION IF EXISTS public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean, text, boolean);

CREATE FUNCTION public.obtener_grupos_para_usuario(
  p_auth_id uuid,
  p_segmento_id uuid DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_activo boolean DEFAULT NULL,
  p_municipio_id uuid DEFAULT NULL,
  p_parroquia_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_eliminado boolean DEFAULT false,
  p_estado_temporal text DEFAULT NULL,
  p_solo_mios boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  nombre text,
  activo boolean,
  eliminado boolean,
  segmento_nombre text,
  temporada_nombre text,
  fecha_creacion timestamptz,
  municipio_id uuid,
  municipio_nombre text,
  parroquia_id uuid,
  parroquia_nombre text,
  lideres json,
  miembros_count integer,
  supervisado_por_mi boolean,
  soy_miembro boolean,
  soy_lider boolean,
  hay_mis_grupos boolean,
  estado_temporal text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
  is_dg boolean;
BEGIN
  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN RETURN; END IF;

  -- Admin/Pastor: acceso total
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor')
  ) INTO is_admin;

  -- Director General: scopeado por segmentos asignados
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'director-general'
  ) INTO is_dg;

  RETURN QUERY WITH base AS (
    SELECT 
      g.id AS id,
      g.nombre AS nombre,
      g.activo AS activo,
      g.eliminado AS eliminado,
      s.nombre AS segmento_nombre,
      t.nombre AS temporada_nombre,
      g.fecha_creacion AS fecha_creacion,
      m.id AS municipio_id,
      m.nombre AS municipio_nombre,
      p.id AS parroquia_id,
      p.nombre AS parroquia_nombre,
      (
        SELECT json_agg(json_build_object(
          'id', u.id,
          'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
          'rol', gm.rol
        ) ORDER BY gm.rol, u.apellido)
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
        WHERE gm.grupo_id = g.id AND gm.rol IN ('Líder','Colíder')
      ) AS lideres,
      (SELECT count(*)::int FROM public.grupo_miembros gm2 WHERE gm2.grupo_id = g.id) AS miembros_count,
      (
        SELECT EXISTS(
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
          WHERE deg.grupo_id = g.id AND sl.usuario_id = internal_user_id AND sl.tipo_lider = 'director_etapa'
        )
      ) AS supervisado_por_mi,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm3 WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
        )
      ) AS soy_miembro,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm4
          WHERE gm4.grupo_id = g.id AND gm4.usuario_id = internal_user_id AND gm4.rol IN ('Líder','Colíder')
        )
      ) AS soy_lider,
      CASE
        WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
        WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
        ELSE 'pasado'
      END AS estado_temporal
    FROM public.grupos g
    LEFT JOIN public.segmentos s ON s.id = g.segmento_id
    LEFT JOIN public.temporadas t ON t.id = g.temporada_id
    LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
    LEFT JOIN public.parroquias p ON p.id = d.parroquia_id
    LEFT JOIN public.municipios m ON m.id = p.municipio_id
    WHERE
      (
        is_admin
        OR (is_dg AND g.segmento_id IN (
          SELECT dgs.segmento_id FROM public.director_general_segmentos dgs
          WHERE dgs.usuario_id = internal_user_id
        ))
        OR public.puede_ver_grupo(internal_user_id, g.id)
      )
      AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
      AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
      AND (p_activo IS NULL OR g.activo = p_activo)
      AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
      AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
      AND (g.eliminado = COALESCE(p_eliminado, false))
      AND (NOT p_solo_mios OR EXISTS (
            SELECT 1 FROM public.grupo_miembros gm3
            WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
          ))
      AND (
        p_estado_temporal IS NULL OR (
          CASE
            WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
            WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
            ELSE 'pasado'
          END
        ) = p_estado_temporal
      )
  ), stats AS (
    SELECT coalesce(bool_or(b.soy_miembro), false) AS hay_mis_grupos FROM base b
  ), counted AS (
    SELECT b.*, count(*) OVER() AS total_count FROM base b
  )
  SELECT
    c.id,
    c.nombre,
    c.activo,
    c.eliminado,
    c.segmento_nombre,
    c.temporada_nombre,
    c.fecha_creacion,
    c.municipio_id,
    c.municipio_nombre,
    c.parroquia_id,
    c.parroquia_nombre,
    c.lideres,
    c.miembros_count,
    c.supervisado_por_mi,
    c.soy_miembro,
    c.soy_lider,
    s.hay_mis_grupos,
    c.estado_temporal,
    c.total_count
  FROM counted c
  CROSS JOIN stats s
  ORDER BY c.fecha_creacion DESC NULLS LAST, c.nombre ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, int, int, boolean, text, boolean) IS 'Lista grupos para usuario. DG scopeado por director_general_segmentos. Admin/Pastor ven todo.';


-- ============================================================
-- 3. obtener_kpis_grupos_para_usuario: DG scopeado por segmentos
-- ============================================================

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
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  -- Admin/Pastor: acceso total
  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  -- Director General: scopeado por segmentos
  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT g.id FROM public.grupos g
        JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
        WHERE dgs.usuario_id = v_usuario_id
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
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
