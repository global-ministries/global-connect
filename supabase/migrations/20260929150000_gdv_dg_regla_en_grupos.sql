-- Grupos de Vida — the group functions use the single director general rule.
--
-- Six functions scoped the director general on their own, and not the same way:
-- most showed the whole segment, es_director_general_de_grupo filtered by the
-- directores de etapa listed in dg_directores_etapa whenever the person had any.
-- Each one is recreated from its LIVE definition (pg_get_functiondef on staging)
-- with ONLY the director general clause replaced by gdv_dg_ve_grupo /
-- gdv_dg_grupos_visibles (see 20260929140000_gdv_dg_alcance.sql). Every other
-- branch, filter, ordering and comment is as it was; language, volatility,
-- security definer, search_path, signature, return type and grants are unchanged.
--
-- Behavior notes:
--   * With alcance = 'segmento' (every existing row) the answer for the whole
--     segment is the same as before, except es_director_general_de_grupo, which
--     no longer applies the implicit dg_directores_etapa filter.
--   * puede_ver_grupo still returns FALSE at once for a director general whose
--     scope does not match; it never falls through to the member check.
--   * obtener_kpis_grupos_para_usuario(uuid, uuid) (the campus overload) is not
--     touched: it does not scope the director general (it treats the role like
--     admin), so it has no clause to replace.

-- Director general clause. Before: a row in director_general_segmentos for the
-- group's segment. Now: gdv_dg_ve_grupo(p_user_id, p_grupo_id).
create or replace function public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
 returns boolean
 language plpgsql
 security definer
as $function$
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

  -- Director General: acceso solo a los grupos que le da la regla única (gdv_dg_ve_grupo)
  SELECT TRUE INTO v_is_dg
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;

  IF v_is_dg THEN
    IF public.gdv_dg_ve_grupo(p_user_id, p_grupo_id) THEN
      RETURN TRUE;
    END IF;
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
$function$;

-- Director general clause. Before: a director-general role plus a row in
-- director_general_segmentos for the group's segment (joined with grupos).
-- Now: the same role check plus gdv_dg_ve_grupo(v_user_id, p_grupo_id).
create or replace function public.puede_editar_grupo(p_auth_id uuid, p_grupo_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.es_admin_o_pastor(p_auth_id) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id
      AND rs.nombre_interno = 'director-general'
  ) AND public.gdv_dg_ve_grupo(v_user_id, p_grupo_id) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
    WHERE deg.grupo_id = p_grupo_id
      AND sl.usuario_id = v_user_id
      AND sl.tipo_lider = 'director_etapa'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id
      AND gm.usuario_id = v_user_id
      AND gm.rol = 'Líder'
      AND COALESCE(gm.estado, 'activo') = 'activo'
      AND gm.fecha_salida IS NULL
  );
END;
$function$;

-- Director general clause. Before: is_dg AND the group's segment is one of the
-- person's director_general_segmentos segments. Now: is_dg AND the group is in
-- gdv_dg_grupos_visibles(internal_user_id).
create or replace function public.obtener_grupos_para_usuario(p_auth_id uuid, p_segmento_id uuid default null::uuid, p_temporada_id uuid default null::uuid, p_activo boolean default null::boolean, p_municipio_id uuid default null::uuid, p_parroquia_id uuid default null::uuid, p_limit integer default 50, p_offset integer default 0, p_eliminado boolean default false, p_estado_temporal text default null::text, p_solo_mios boolean default false)
 returns table(id uuid, nombre text, activo boolean, eliminado boolean, segmento_nombre text, temporada_nombre text, fecha_creacion timestamp with time zone, municipio_id uuid, municipio_nombre text, parroquia_id uuid, parroquia_nombre text, lideres json, miembros_count integer, supervisado_por_mi boolean, soy_miembro boolean, soy_lider boolean, hay_mis_grupos boolean, estado_temporal text, total_count bigint)
 language plpgsql
 security definer
as $function$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
  is_dg boolean;
BEGIN
  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor')
  ) INTO is_admin;

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
        OR (is_dg AND g.id IN (
          SELECT public.gdv_dg_grupos_visibles(internal_user_id)
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
$function$;

-- Director general clause. Before: v_es_dg AND the group belongs to a segment in
-- director_general_segmentos (grupos joined with it). Now: v_es_dg AND the group
-- is in gdv_dg_grupos_visibles(v_usuario_id).
create or replace function public.obtener_kpis_grupos_para_usuario(p_auth_id uuid)
 returns table(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 language plpgsql
 security definer
as $function$
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

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

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
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
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
END;$function$;

-- Director general clause. Before: a row in director_general_segmentos for the
-- group's segment (grupos joined with it). Now: gdv_dg_ve_grupo(v_user_id, p_grupo_id).
create or replace function public.puede_ver_grupo_reporte_asistencia(p_auth_id uuid, p_grupo_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF auth.uid() IS NOT NULL AND p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT u.id, rs.nombre_interno
  INTO v_user_id, v_role
  FROM public.usuarios u
  JOIN public.usuario_roles ur ON ur.usuario_id = u.id
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE u.auth_id = p_auth_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ORDER BY CASE rs.nombre_interno
    WHEN 'admin' THEN 1
    WHEN 'pastor' THEN 2
    WHEN 'director-general' THEN 3
    WHEN 'director-etapa' THEN 4
    ELSE 99
  END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role IN ('admin', 'pastor') THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'director-general' THEN
    RETURN public.gdv_dg_ve_grupo(v_user_id, p_grupo_id);
  END IF;

  IF v_role = 'director-etapa' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = v_user_id
        AND sl.tipo_lider = 'director_etapa'
    );
  END IF;

  RETURN FALSE;
END;
$function$;

-- Director general clause. Before: the group's segment had to be one of the
-- person's director_general_segmentos, and if the person had ANY row in
-- dg_directores_etapa the group also had to belong to one of those directores
-- (the implicit filter). Now: gdv_dg_ve_grupo(v_user_id, p_grupo_id); the
-- v_segmento_id and v_tiene_des variables are no longer needed.
create or replace function public.es_director_general_de_grupo(p_auth_id uuid, p_grupo_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
DECLARE v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF public.es_superadmin(v_user_id) THEN RETURN TRUE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  ) THEN RETURN FALSE; END IF;
  RETURN public.gdv_dg_ve_grupo(v_user_id, p_grupo_id);
END; $function$;
