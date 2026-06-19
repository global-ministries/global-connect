-- Harden Judgment Day Round 1 critical security findings.
-- Scope: usuario detail RPC, grupos RLS/edit scope, DG dashboard scope,
-- bulk-safe group updates, and family relationship access/mutations.

-- -----------------------------------------------------------------------------
-- Shared authorization helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_admin_o_pastor(p_auth_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  );
$$;

REVOKE ALL ON FUNCTION public.es_admin_o_pastor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_admin_o_pastor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_gestionar_relacion_familiar(
  p_auth_id uuid,
  p_usuario1_id uuid,
  p_usuario2_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  IF p_usuario1_id IS NULL OR p_usuario2_id IS NULL OR p_usuario1_id = p_usuario2_id THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.es_admin_o_pastor(p_auth_id) THEN
    RETURN TRUE;
  END IF;

  RETURN public.puede_editar_usuario(p_auth_id, p_usuario1_id)
     AND public.puede_editar_usuario(p_auth_id, p_usuario2_id);
END;
$$;

REVOKE ALL ON FUNCTION public.puede_gestionar_relacion_familiar(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_relacion_familiar(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_ver_relacion_familiar(
  p_auth_id uuid,
  p_usuario1_id uuid,
  p_usuario2_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_usuario1_id = v_actor_id OR p_usuario2_id = v_actor_id THEN
    RETURN TRUE;
  END IF;

  RETURN public.puede_gestionar_relacion_familiar(p_auth_id, p_usuario1_id, p_usuario2_id);
END;
$$;

REVOKE ALL ON FUNCTION public.puede_ver_relacion_familiar(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_ver_relacion_familiar(uuid, uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- grupos RLS and edit scope
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.puede_editar_grupo(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    JOIN public.grupos g ON g.id = p_grupo_id
    JOIN public.director_general_segmentos dgs
      ON dgs.segmento_id = g.segmento_id
     AND dgs.usuario_id = v_user_id
    WHERE ur.usuario_id = v_user_id
      AND rs.nombre_interno = 'director-general'
  ) THEN
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
$$;

REVOKE ALL ON FUNCTION public.puede_editar_grupo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_editar_grupo(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grupos'
      AND cmd IN ('SELECT', 'UPDATE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.grupos', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY grupos_select_scoped_authenticated
ON public.grupos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios actor
    WHERE actor.auth_id = auth.uid()
      AND public.puede_ver_grupo(actor.id, grupos.id)
  )
);

CREATE POLICY grupos_update_scoped_authenticated
ON public.grupos
FOR UPDATE
TO authenticated
USING (public.puede_editar_grupo(auth.uid(), id))
WITH CHECK (public.puede_editar_grupo(auth.uid(), id));

-- -----------------------------------------------------------------------------
-- obtener_detalle_usuario: actor-scoped privileged RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.obtener_detalle_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_auth_id uuid := auth.uid();
  v_actor_id uuid;
  v_can_view_sensitive boolean := false;
  v_payload jsonb;
BEGIN
  IF v_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = v_actor_auth_id;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor user not found' USING ERRCODE = '28000';
  END IF;

  IF p_user_id = v_actor_id OR public.puede_editar_usuario(v_actor_auth_id, p_user_id) THEN
    v_can_view_sensitive := true;
  END IF;

  IF NOT v_can_view_sensitive THEN
    RAISE EXCEPTION 'Not authorized to view this user' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'nombre', u.nombre,
    'apellido', u.apellido,
    'cedula', u.cedula,
    'email', u.email,
    'telefono', u.telefono,
    'fecha_nacimiento', u.fecha_nacimiento,
    'fecha_registro', u.fecha_registro,
    'estado_civil', u.estado_civil,
    'genero', u.genero,
    'foto_perfil_url', u.foto_perfil_url,
    'familia_id', u.familia_id,
    'direccion_id', u.direccion_id,
    'ocupacion_id', u.ocupacion_id,
    'profesion_id', u.profesion_id,
    'roles', COALESCE((
      SELECT jsonb_agg(rs.nombre_interno ORDER BY rs.nombre_interno)
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = u.id
    ), '[]'::jsonb),
    'ocupacion', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id', o.id, 'nombre', o.nombre) END,
    'profesion', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'nombre', p.nombre) END,
    'direccion', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', d.id,
      'calle', d.calle,
      'barrio', d.barrio,
      'codigo_postal', d.codigo_postal,
      'referencia', d.referencia,
      'latitud', d.latitud,
      'longitud', d.longitud,
      'parroquia', CASE WHEN par.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', par.id,
        'nombre', par.nombre,
        'municipio', CASE WHEN mun.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', mun.id,
          'nombre', mun.nombre,
          'estado', CASE WHEN est.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', est.id,
            'nombre', est.nombre,
            'pais', CASE WHEN pais.id IS NULL THEN NULL ELSE jsonb_build_object('id', pais.id, 'nombre', pais.nombre) END
          ) END
        ) END
      ) END
    ) END,
    'relaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ru.id,
        'tipo_relacion', ru.tipo_relacion,
        'es_principal', ru.es_principal,
        'usuario1_id', ru.usuario1_id,
        'usuario2_id', ru.usuario2_id,
        'familiar', jsonb_build_object(
          'id', familiar.id,
          'nombre', familiar.nombre,
          'apellido', familiar.apellido,
          'email', familiar.email,
          'telefono', familiar.telefono,
          'genero', familiar.genero,
          'foto_perfil_url', familiar.foto_perfil_url
        )
      ) ORDER BY familiar.apellido, familiar.nombre)
      FROM public.relaciones_usuarios ru
      JOIN public.usuarios familiar
        ON familiar.id = CASE WHEN ru.usuario1_id = u.id THEN ru.usuario2_id ELSE ru.usuario1_id END
      WHERE (ru.usuario1_id = u.id OR ru.usuario2_id = u.id)
        AND public.puede_ver_relacion_familiar(v_actor_auth_id, ru.usuario1_id, ru.usuario2_id)
    ), '[]'::jsonb)
  )
  INTO v_payload
  FROM public.usuarios u
  LEFT JOIN public.ocupaciones o ON o.id = u.ocupacion_id
  LEFT JOIN public.profesiones p ON p.id = u.profesion_id
  LEFT JOIN public.direcciones d ON d.id = u.direccion_id
  LEFT JOIN public.parroquias par ON par.id = d.parroquia_id
  LEFT JOIN public.municipios mun ON mun.id = par.municipio_id
  LEFT JOIN public.estados est ON est.id = mun.estado_id
  LEFT JOIN public.paises pais ON pais.id = est.pais_id
  WHERE u.id = p_user_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '02000';
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_detalle_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_detalle_usuario(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- obtener_datos_dashboard: DG scope is assigned segments, admin/pastor global
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.obtener_datos_dashboard(p_auth_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_rol_nombre text;
  v_is_admin_pastor boolean := false;
  v_is_dg boolean := false;
  v_total_miembros int := 0;
  v_total_miembros_hace_30 int := 0;
  v_variacion_miembros numeric := 0;
  v_asistencia_semanal numeric := 0;
  v_grupos_activos int := 0;
  v_nuevos_miembros_mes int := 0;
  v_actividad jsonb := '[]'::jsonb;
  v_cumpleanos jsonb := '[]'::jsonb;
  v_riesgo jsonb := '[]'::jsonb;
  v_tendencia jsonb := '[]'::jsonb;
  v_distribucion jsonb := '[]'::jsonb;
  v_rep jsonb;
  v_grupos_asignados_ids uuid[];
  v_total_miembros_alcance int := 0;
  v_asistencia_semanal_alcance numeric := 0;
  v_grupos_activos_alcance int := 0;
  v_nuevos_miembros_mes_alcance int := 0;
  v_actividad_alcance jsonb := '[]'::jsonb;
  v_cumpleanos_alcance jsonb := '[]'::jsonb;
  v_riesgo_alcance jsonb := '[]'::jsonb;
  v_lideres_sin_reporte jsonb := '[]'::jsonb;
  v_semana_inicio date;
  v_semana_fin date;
  v_grupos_lider_ids uuid[];
  v_accion_requerida jsonb := NULL;
  v_kpis_grupo jsonb := '{}'::jsonb;
  v_proximos_cumpleanos_grupo jsonb := '[]'::jsonb;
  v_miembros_ausentes_recientemente jsonb := '[]'::jsonb;
  v_nuevos_miembros_grupo jsonb := '[]'::jsonb;
  v_evento_ultimo uuid;
  v_evento_ultimo_grupo uuid;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  SELECT rs.nombre_interno INTO v_rol_nombre
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
  ORDER BY CASE rs.nombre_interno
    WHEN 'admin' THEN 1 WHEN 'pastor' THEN 2 WHEN 'director-general' THEN 3
    WHEN 'director-etapa' THEN 4 WHEN 'lider' THEN 5 ELSE 6 END
  LIMIT 1;

  v_is_admin_pastor := v_rol_nombre IN ('admin', 'pastor');
  v_is_dg := v_rol_nombre = 'director-general';

  IF v_is_admin_pastor OR v_is_dg THEN
    WITH scoped_groups AS (
      SELECT g.id, g.nombre, g.fecha_creacion, g.segmento_id
      FROM public.grupos g
      WHERE g.activo = true
        AND COALESCE(g.eliminado, false) = false
        AND (
          v_is_admin_pastor
          OR EXISTS (
            SELECT 1
            FROM public.director_general_segmentos dgs
            WHERE dgs.usuario_id = v_user_id
              AND dgs.segmento_id = g.segmento_id
          )
        )
    ), scoped_members AS (
      SELECT DISTINCT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN scoped_groups sg ON sg.id = gm.grupo_id
      WHERE gm.fecha_salida IS NULL
        AND COALESCE(gm.estado, 'activo') = 'activo'
    )
    SELECT COUNT(*) INTO v_total_miembros FROM scoped_members;

    WITH scoped_groups AS (
      SELECT g.id
      FROM public.grupos g
      WHERE g.activo = true AND COALESCE(g.eliminado, false) = false
        AND (v_is_admin_pastor OR EXISTS (
          SELECT 1 FROM public.director_general_segmentos dgs
          WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id
        ))
    ), scoped_members AS (
      SELECT DISTINCT gm.usuario_id
      FROM public.grupo_miembros gm
      JOIN scoped_groups sg ON sg.id = gm.grupo_id
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE gm.fecha_salida IS NULL
        AND COALESCE(gm.estado, 'activo') = 'activo'
        AND u.fecha_registro <= (CURRENT_DATE - INTERVAL '30 days')
    )
    SELECT COUNT(*) INTO v_total_miembros_hace_30 FROM scoped_members;

    v_variacion_miembros := CASE WHEN v_total_miembros_hace_30 > 0 THEN ROUND(((v_total_miembros - v_total_miembros_hace_30)::numeric / v_total_miembros_hace_30::numeric) * 100, 1) ELSE 0 END;

    SELECT COUNT(*) INTO v_grupos_activos
    FROM public.grupos g
    WHERE g.activo = true AND COALESCE(g.eliminado, false) = false
      AND (v_is_admin_pastor OR EXISTS (
        SELECT 1 FROM public.director_general_segmentos dgs
        WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id
      ));

    SELECT COUNT(DISTINCT gm.usuario_id) INTO v_nuevos_miembros_mes
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE u.fecha_registro >= (CURRENT_DATE - INTERVAL '30 days')
      AND gm.fecha_salida IS NULL
      AND COALESCE(gm.estado, 'activo') = 'activo'
      AND g.activo = true AND COALESCE(g.eliminado, false) = false
      AND (v_is_admin_pastor OR EXISTS (
        SELECT 1 FROM public.director_general_segmentos dgs
        WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id
      ));

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    IF v_is_admin_pastor THEN
      BEGIN
        v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
        v_asistencia_semanal := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
      EXCEPTION WHEN OTHERS THEN
        v_asistencia_semanal := 0;
      END;
    ELSE
      WITH scoped_groups AS (
        SELECT g.id
        FROM public.grupos g
        WHERE g.activo = true
          AND COALESCE(g.eliminado, false) = false
          AND EXISTS (
            SELECT 1
            FROM public.director_general_segmentos dgs
            WHERE dgs.usuario_id = v_user_id
              AND dgs.segmento_id = g.segmento_id
          )
      ), eventos_por_grupo AS (
        SELECT eg.grupo_id,
               COUNT(a.id) AS total_registros,
               COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
        FROM public.eventos_grupo eg
        JOIN scoped_groups sg ON sg.id = eg.grupo_id
        LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
        WHERE eg.fecha >= v_semana_inicio
          AND eg.fecha <= v_semana_fin
        GROUP BY eg.grupo_id
      )
      SELECT COALESCE(ROUND(AVG(CASE WHEN COALESCE(epg.total_registros, 0) > 0 THEN (epg.total_presentes::numeric / epg.total_registros::numeric) * 100 ELSE 0 END), 1), 0)
      INTO v_asistencia_semanal
      FROM scoped_groups sg
      LEFT JOIN eventos_por_grupo epg ON epg.grupo_id = sg.id;

      v_tendencia := (
        WITH semanas AS (
          SELECT v_semana_inicio - (n * INTERVAL '7 days') AS semana_inicio,
                 v_semana_fin - (n * INTERVAL '7 days') AS semana_fin
          FROM generate_series(0, 7) AS n
        ), trend AS (
          SELECT s.semana_inicio,
                 (
                   WITH scoped_groups AS (
                     SELECT g.id
                     FROM public.grupos g
                     WHERE g.activo = true
                       AND COALESCE(g.eliminado, false) = false
                       AND EXISTS (
                         SELECT 1
                         FROM public.director_general_segmentos dgs
                         WHERE dgs.usuario_id = v_user_id
                           AND dgs.segmento_id = g.segmento_id
                       )
                   ), eventos_por_grupo AS (
                     SELECT eg.grupo_id,
                            COUNT(a.id) AS total_registros,
                            COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
                     FROM public.eventos_grupo eg
                     JOIN scoped_groups sg ON sg.id = eg.grupo_id
                     LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
                     WHERE eg.fecha >= s.semana_inicio
                       AND eg.fecha <= s.semana_fin
                     GROUP BY eg.grupo_id
                   )
                   SELECT COALESCE(ROUND(AVG(CASE WHEN COALESCE(epg.total_registros, 0) > 0 THEN (epg.total_presentes::numeric / epg.total_registros::numeric) * 100 ELSE 0 END), 1), 0)
                   FROM scoped_groups sg
                   LEFT JOIN eventos_por_grupo epg ON epg.grupo_id = sg.id
                 ) AS porcentaje
          FROM semanas s
          ORDER BY s.semana_inicio
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('semana_inicio', semana_inicio, 'porcentaje', porcentaje) ORDER BY semana_inicio), '[]'::jsonb)
        FROM trend
      );
    END IF;

    v_actividad := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'texto', e.texto, 'fecha', e.fecha) ORDER BY e.fecha DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM (
          SELECT u.fecha_registro AS fecha, 'NUEVO_MIEMBRO'::text AS tipo,
                 (u.nombre || ' ' || u.apellido || ' se ha unido a la comunidad.') AS texto
          FROM public.usuarios u
          WHERE u.fecha_registro IS NOT NULL
            AND (v_is_admin_pastor OR EXISTS (
              SELECT 1 FROM public.grupo_miembros gm
              JOIN public.grupos g ON g.id = gm.grupo_id
              JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
              WHERE gm.usuario_id = u.id AND dgs.usuario_id = v_user_id
            ))
          UNION ALL
          SELECT g.fecha_creacion, 'NUEVO_GRUPO'::text, ('Se creó el grupo "' || g.nombre || '".')
          FROM public.grupos g
          WHERE g.fecha_creacion IS NOT NULL
            AND (v_is_admin_pastor OR EXISTS (SELECT 1 FROM public.director_general_segmentos dgs WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id))
          UNION ALL
          SELECT gm.fecha_asignacion, 'USUARIO_A_GRUPO'::text,
                 (COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'') || ' añadido a ' || COALESCE(g.nombre,''))
          FROM public.grupo_miembros gm
          JOIN public.grupos g ON g.id = gm.grupo_id
          LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE gm.fecha_asignacion IS NOT NULL
            AND (v_is_admin_pastor OR EXISTS (SELECT 1 FROM public.director_general_segmentos dgs WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id))
          UNION ALL
          SELECT eg.fecha, 'REPORTE_ASISTENCIA'::text,
                 ('El grupo "' || COALESCE(g.nombre,'') || '" ha reportado su asistencia.')
          FROM public.eventos_grupo eg
          JOIN public.grupos g ON g.id = eg.grupo_id
          WHERE (v_is_admin_pastor OR EXISTS (SELECT 1 FROM public.director_general_segmentos dgs WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = g.segmento_id))
        ) eventos
        ORDER BY fecha DESC
        LIMIT 5
      ) e
    );

    v_cumpleanos := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        WHERE u.fecha_nacimiento IS NOT NULL
          AND (v_is_admin_pastor OR EXISTS (
            SELECT 1 FROM public.grupo_miembros gm
            JOIN public.grupos g ON g.id = gm.grupo_id
            JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
            WHERE gm.usuario_id = u.id AND dgs.usuario_id = v_user_id
          ))
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                    THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre_completo', nombre || ' ' || apellido, 'foto_url', foto_perfil_url, 'fecha_nacimiento', fecha_nacimiento, 'proximo', proximo) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    IF v_is_admin_pastor THEN
      v_riesgo := (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT risk.item AS item
          FROM jsonb_array_elements(COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb)) AS risk(item)
          LIMIT 5
        ) scoped_risk
      );
      v_tendencia := COALESCE(v_rep->'tendencia_asistencia_global', '[]'::jsonb);
    ELSE
      v_riesgo := (
        WITH scoped_groups AS (
          SELECT g.id, g.nombre
          FROM public.grupos g
          WHERE g.activo = true
            AND COALESCE(g.eliminado, false) = false
            AND EXISTS (
              SELECT 1
              FROM public.director_general_segmentos dgs
              WHERE dgs.usuario_id = v_user_id
                AND dgs.segmento_id = g.segmento_id
            )
        ), eventos_agreg AS (
          SELECT eg.grupo_id,
                 COUNT(a.id) AS total_registros,
                 COUNT(a.id) FILTER (WHERE a.presente = true) AS total_presentes
          FROM public.eventos_grupo eg
          JOIN scoped_groups sg ON sg.id = eg.grupo_id
          LEFT JOIN public.asistencia a ON a.evento_grupo_id = eg.id
          WHERE eg.fecha >= v_semana_inicio
            AND eg.fecha <= v_semana_fin
          GROUP BY eg.grupo_id
        ), pct AS (
          SELECT sg.id AS grupo_id,
                 COALESCE(ROUND((CASE WHEN COALESCE(e.total_registros, 0) > 0 THEN (COALESCE(e.total_presentes, 0)::numeric / COALESCE(e.total_registros, 0)::numeric) * 100 ELSE 0 END), 1), 0) AS porcentaje,
                 COALESCE(e.total_registros, 0) AS total_registros
          FROM scoped_groups sg
          LEFT JOIN eventos_agreg e ON e.grupo_id = sg.id
        ), lideres AS (
          SELECT gm.grupo_id,
                 STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre || ' ' || u.apellido) AS nombres
          FROM public.grupo_miembros gm
          JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE gm.rol = 'Líder'
          GROUP BY gm.grupo_id
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.grupo_id, 'nombre', sg.nombre, 'porcentaje_asistencia', o.porcentaje, 'lideres', COALESCE(l.nombres, 'Sin líderes asignados')) ORDER BY o.porcentaje ASC, o.grupo_id), '[]'::jsonb)
        FROM (
          SELECT grupo_id, porcentaje
          FROM pct
          WHERE total_registros > 0
            AND porcentaje > 0
            AND porcentaje < 70
          ORDER BY porcentaje ASC, grupo_id
          LIMIT 5
        ) o
        JOIN scoped_groups sg ON sg.id = o.grupo_id
        LEFT JOIN lideres l ON l.grupo_id = o.grupo_id
      );
    END IF;

    v_distribucion := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'total_miembros', x.total_miembros) ORDER BY x.total_miembros DESC), '[]'::jsonb)
      FROM (
        SELECT s.id, COALESCE(s.nombre, 'Sin segmento') AS nombre, COUNT(DISTINCT gm.usuario_id) AS total_miembros
        FROM public.segmentos s
        JOIN public.grupos g ON g.segmento_id = s.id AND g.activo = true AND COALESCE(g.eliminado,false) = false
        LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = g.id AND gm.fecha_salida IS NULL AND COALESCE(gm.estado, 'activo') = 'activo'
        WHERE v_is_admin_pastor OR EXISTS (
          SELECT 1 FROM public.director_general_segmentos dgs
          WHERE dgs.usuario_id = v_user_id AND dgs.segmento_id = s.id
        )
        GROUP BY s.id, s.nombre
      ) x
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'kpis_globales', jsonb_build_object(
          'total_miembros', jsonb_build_object('valor', v_total_miembros, 'variacion', v_variacion_miembros),
          'asistencia_semanal', jsonb_build_object('valor', v_asistencia_semanal),
          'grupos_activos', jsonb_build_object('valor', v_grupos_activos),
          'nuevos_miembros_mes', jsonb_build_object('valor', v_nuevos_miembros_mes)
        ),
        'actividad_reciente', v_actividad,
        'proximos_cumpleanos', v_cumpleanos,
        'grupos_en_riesgo', v_riesgo,
        'tendencia_asistencia', v_tendencia,
        'distribucion_segmentos', v_distribucion
      )
    );
  ELSIF v_rol_nombre = 'director-etapa' THEN
    SELECT array_agg(deg.grupo_id)
    INTO v_grupos_asignados_ids
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
    WHERE sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa';

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    SELECT COUNT(DISTINCT gm.usuario_id) INTO v_total_miembros_alcance
    FROM public.grupo_miembros gm
    WHERE v_grupos_asignados_ids IS NOT NULL AND gm.grupo_id = ANY(v_grupos_asignados_ids);

    BEGIN
      v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
      v_asistencia_semanal_alcance := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_asistencia_semanal_alcance := 0;
    END;

    SELECT COUNT(*) INTO v_grupos_activos_alcance
    FROM public.grupos g
    WHERE v_grupos_asignados_ids IS NOT NULL AND g.id = ANY(v_grupos_asignados_ids) AND g.activo = true AND COALESCE(g.eliminado,false)=false;

    SELECT COUNT(*) INTO v_nuevos_miembros_mes_alcance
    FROM public.grupo_miembros gm
    WHERE v_grupos_asignados_ids IS NOT NULL AND gm.grupo_id = ANY(v_grupos_asignados_ids)
      AND gm.fecha_asignacion >= (CURRENT_DATE - INTERVAL '30 days');

    v_actividad_alcance := (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('tipo', e.tipo, 'texto', e.texto, 'fecha', e.fecha) ORDER BY e.fecha DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT * FROM (
          SELECT gm.fecha_asignacion AS fecha, 'USUARIO_A_GRUPO'::text AS tipo,
                 (COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'') || ' añadido a ' || COALESCE(g.nombre,'')) AS texto
          FROM public.grupo_miembros gm
          JOIN public.grupos g ON g.id = gm.grupo_id
          LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids)
          UNION ALL
          SELECT g.fecha_creacion AS fecha, 'NUEVO_GRUPO'::text AS tipo,
                 ('Se creó el grupo ' || '"' || g.nombre || '".') AS texto
          FROM public.grupos g
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND g.id = ANY(v_grupos_asignados_ids)
          UNION ALL
          SELECT eg.fecha AS fecha, 'REPORTE_ASISTENCIA'::text AS tipo,
                 ('El grupo "' || COALESCE(g.nombre,'') || '" ha reportado su asistencia.') AS texto
          FROM public.eventos_grupo eg
          JOIN public.grupos g ON g.id = eg.grupo_id
          WHERE (v_grupos_asignados_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_asignados_ids)
        ) eventos
        ORDER BY fecha DESC
        LIMIT 5
      ) e
    );

    v_cumpleanos_alcance := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
        WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids)
          AND u.fecha_nacimiento IS NOT NULL
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN fecha_nacimiento IS NULL THEN NULL
                    WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                      THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date
               END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre_completo', nombre || ' ' || apellido,
        'foto_url', foto_perfil_url,
        'fecha_nacimiento', fecha_nacimiento,
        'proximo', proximo
      ) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    IF v_rep IS NULL THEN v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true); END IF;
    v_riesgo_alcance := COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb);

    v_lideres_sin_reporte := (
      WITH asignados AS (
        SELECT g.id, g.nombre
        FROM public.grupos g
        WHERE (v_grupos_asignados_ids IS NOT NULL) AND g.id = ANY(v_grupos_asignados_ids)
          AND g.activo = true AND COALESCE(g.eliminado,false)=false
      ), eventos_semana AS (
        SELECT DISTINCT eg.grupo_id
        FROM public.eventos_grupo eg
        WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
          AND (v_grupos_asignados_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_asignados_ids)
      ), faltantes AS (
        SELECT a.id AS grupo_id, a.nombre
        FROM asignados a
        LEFT JOIN eventos_semana es ON es.grupo_id = a.id
        WHERE es.grupo_id IS NULL
      ), lideres AS (
        SELECT gm.grupo_id, STRING_AGG(DISTINCT u.nombre || ' ' || u.apellido, ', ' ORDER BY u.nombre||' '||u.apellido) AS nombres
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
        WHERE gm.rol = 'Líder'
        GROUP BY gm.grupo_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'grupo_id', f.grupo_id,
        'grupo_nombre', f.nombre,
        'lideres', COALESCE(l.nombres,'Sin líderes asignados')
      ) ORDER BY f.nombre), '[]'::jsonb)
      FROM faltantes f
      LEFT JOIN lideres l ON l.grupo_id = f.grupo_id
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'kpis_alcance', jsonb_build_object(
          'total_miembros', jsonb_build_object('valor', v_total_miembros_alcance),
          'asistencia_semanal', jsonb_build_object('valor', v_asistencia_semanal_alcance),
          'grupos_activos', jsonb_build_object('valor', v_grupos_activos_alcance),
          'nuevos_miembros_mes', jsonb_build_object('valor', v_nuevos_miembros_mes_alcance)
        ),
        'actividad_reciente_alcance', v_actividad_alcance,
        'proximos_cumpleanos_alcance', v_cumpleanos_alcance,
        'grupos_en_riesgo_alcance', v_riesgo_alcance,
        'lideres_sin_reporte', v_lideres_sin_reporte
      )
    );
  ELSIF v_rol_nombre = 'lider' THEN
    SELECT array_agg(gm.grupo_id) INTO v_grupos_lider_ids
    FROM public.grupo_miembros gm
    WHERE gm.usuario_id = v_user_id AND gm.rol = 'Líder';

    v_semana_inicio := CURRENT_DATE - (((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 6) % 7));
    v_semana_fin := v_semana_inicio + INTERVAL '6 days';

    SELECT jsonb_build_object(
      'tipo','REGISTRAR_ASISTENCIA',
      'mensaje','No has registrado la asistencia de esta semana para el grupo ' || '"' || a.nombre || '"' || '.',
      'grupo_id', a.id,
      'grupo_nombre', a.nombre
    ) INTO v_accion_requerida
    FROM (
      WITH asignados AS (
        SELECT g.id, g.nombre
        FROM public.grupos g
        WHERE (v_grupos_lider_ids IS NOT NULL) AND g.id = ANY(v_grupos_lider_ids)
          AND g.activo = true AND COALESCE(g.eliminado,false)=false
      ), eventos_semana AS (
        SELECT DISTINCT eg.grupo_id
        FROM public.eventos_grupo eg
        WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
          AND (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
      )
      SELECT a.*
      FROM asignados a
      LEFT JOIN eventos_semana es ON es.grupo_id = a.id
      WHERE es.grupo_id IS NULL
      ORDER BY a.nombre
      LIMIT 1
    ) a;

    IF NOT EXISTS (
      SELECT 1 FROM (
        WITH asignados AS (
          SELECT g.id FROM public.grupos g
          WHERE (v_grupos_lider_ids IS NOT NULL) AND g.id = ANY(v_grupos_lider_ids)
            AND g.activo = true AND COALESCE(g.eliminado,false)=false
        ), eventos_semana AS (
          SELECT DISTINCT eg.grupo_id FROM public.eventos_grupo eg
          WHERE eg.fecha >= v_semana_inicio AND eg.fecha <= v_semana_fin
            AND (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
        )
        SELECT a.id FROM asignados a
        LEFT JOIN eventos_semana es ON es.grupo_id = a.id
        WHERE es.grupo_id IS NULL
      ) x
    ) THEN
      v_accion_requerida := NULL;
    END IF;

    SELECT eg.id, eg.grupo_id INTO v_evento_ultimo, v_evento_ultimo_grupo
    FROM public.eventos_grupo eg
    WHERE v_grupos_lider_ids IS NOT NULL AND eg.grupo_id = ANY(v_grupos_lider_ids)
    ORDER BY eg.fecha DESC
    LIMIT 1;

    v_kpis_grupo := jsonb_build_object(
      'asistencia_ultima_reunion', (SELECT COALESCE(ROUND((COUNT(a.id) FILTER (WHERE a.presente = true))::numeric / NULLIF(COUNT(a.id), 0)::numeric * 100, 1), 0) FROM public.asistencia a WHERE v_evento_ultimo IS NOT NULL AND a.evento_grupo_id = v_evento_ultimo),
      'total_miembros', (SELECT COALESCE(COUNT(DISTINCT gm.usuario_id), 0) FROM public.grupo_miembros gm WHERE v_evento_ultimo_grupo IS NOT NULL AND gm.grupo_id = v_evento_ultimo_grupo AND gm.fecha_salida IS NULL)
    );

    v_proximos_cumpleanos_grupo := (
      WITH miembros AS (
        SELECT DISTINCT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento
        FROM public.usuarios u
        JOIN public.grupo_miembros gm ON gm.usuario_id = u.id
        WHERE (v_grupos_lider_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_lider_ids)
          AND u.fecha_nacimiento IS NOT NULL
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN fecha_nacimiento IS NULL THEN NULL
                    WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) < CURRENT_DATE
                      THEN (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int) + INTERVAL '1 year')::date
                    ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM fecha_nacimiento)::int, EXTRACT(DAY FROM fecha_nacimiento)::int)::date
               END AS proximo
        FROM miembros
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre_completo', nombre || ' ' || apellido,
        'foto_url', foto_perfil_url,
        'fecha_nacimiento', fecha_nacimiento,
        'proximo', proximo
      ) ORDER BY proximo ASC), '[]'::jsonb)
      FROM norm
      WHERE proximo BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days')
      LIMIT 7
    );

    v_miembros_ausentes_recientemente := (
      WITH ultimos_eventos AS (
        SELECT eg.id AS evento_id, eg.grupo_id, eg.fecha
        FROM public.eventos_grupo eg
        WHERE (v_grupos_lider_ids IS NOT NULL) AND eg.grupo_id = ANY(v_grupos_lider_ids)
        ORDER BY eg.fecha DESC
        LIMIT 2
      ), ausentes AS (
        SELECT a.usuario_id, MAX(COALESCE(a.fecha_registro::date, ue.fecha)) AS ultima_ausencia
        FROM public.asistencia a
        JOIN ultimos_eventos ue ON ue.evento_id = a.evento_grupo_id
        WHERE a.presente = false
        GROUP BY a.usuario_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nombre_completo', u.nombre || ' ' || u.apellido,
        'foto_url', u.foto_perfil_url,
        'ultima_ausencia', aus.ultima_ausencia
      ) ORDER BY aus.ultima_ausencia DESC), '[]'::jsonb)
      FROM ausentes aus
      JOIN public.usuarios u ON u.id = aus.usuario_id
    );

    v_nuevos_miembros_grupo := (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nombre_completo', u.nombre || ' ' || u.apellido,
        'foto_url', u.foto_perfil_url,
        'fecha_ingreso', gm.fecha_asignacion
      ) ORDER BY gm.fecha_asignacion DESC), '[]'::jsonb)
      FROM public.grupo_miembros gm
      JOIN public.usuarios u ON u.id = gm.usuario_id
      WHERE (v_grupos_lider_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_lider_ids)
        AND gm.fecha_asignacion >= (CURRENT_DATE - INTERVAL '30 days')
    );

    RETURN jsonb_build_object(
      'rol', v_rol_nombre,
      'widgets', jsonb_build_object(
        'accion_requerida', v_accion_requerida,
        'kpis_grupo', v_kpis_grupo,
        'proximos_cumpleanos_grupo', v_proximos_cumpleanos_grupo,
        'miembros_ausentes_recientemente', v_miembros_ausentes_recientemente,
        'nuevos_miembros_grupo', v_nuevos_miembros_grupo
      )
    );
  ELSE
    RETURN jsonb_build_object('rol', v_rol_nombre, 'widgets', jsonb_build_object());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_datos_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_datos_dashboard(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- relaciones_usuarios RLS, grants, and safe mutation RPCs
-- -----------------------------------------------------------------------------

ALTER TABLE public.relaciones_usuarios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_constraint_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'relaciones_usuarios_no_self_relation'
      AND conrelid = 'public.relaciones_usuarios'::regclass
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    ALTER TABLE public.relaciones_usuarios
      ADD CONSTRAINT relaciones_usuarios_no_self_relation
      CHECK (usuario1_id <> usuario2_id) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'relaciones_usuarios'
      AND cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.relaciones_usuarios', v_policy.policyname);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.relaciones_usuarios FROM anon;
REVOKE ALL ON TABLE public.relaciones_usuarios FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.relaciones_usuarios TO authenticated;

CREATE POLICY relaciones_usuarios_select_scoped
ON public.relaciones_usuarios
FOR SELECT
TO authenticated
USING (public.puede_ver_relacion_familiar(auth.uid(), usuario1_id, usuario2_id));

CREATE POLICY relaciones_usuarios_insert_scoped
ON public.relaciones_usuarios
FOR INSERT
TO authenticated
WITH CHECK (public.puede_gestionar_relacion_familiar(auth.uid(), usuario1_id, usuario2_id));

CREATE POLICY relaciones_usuarios_update_scoped
ON public.relaciones_usuarios
FOR UPDATE
TO authenticated
USING (public.puede_gestionar_relacion_familiar(auth.uid(), usuario1_id, usuario2_id))
WITH CHECK (public.puede_gestionar_relacion_familiar(auth.uid(), usuario1_id, usuario2_id));

CREATE POLICY relaciones_usuarios_delete_scoped
ON public.relaciones_usuarios
FOR DELETE
TO authenticated
USING (public.puede_gestionar_relacion_familiar(auth.uid(), usuario1_id, usuario2_id));

CREATE OR REPLACE FUNCTION public.agregar_relacion_familiar_segura(
  p_auth_id uuid,
  p_usuario1_id uuid,
  p_usuario2_id uuid,
  p_tipo_relacion enum_tipo_relacion
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted public.relaciones_usuarios%ROWTYPE;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.puede_gestionar_relacion_familiar(p_auth_id, p_usuario1_id, p_usuario2_id) THEN
    RAISE EXCEPTION 'Not authorized to create this relationship' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.relaciones_usuarios ru
    WHERE LEAST(ru.usuario1_id, ru.usuario2_id) = LEAST(p_usuario1_id, p_usuario2_id)
      AND GREATEST(ru.usuario1_id, ru.usuario2_id) = GREATEST(p_usuario1_id, p_usuario2_id)
  ) THEN
    RAISE EXCEPTION 'Relationship already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) -- noqa: insert-into
  VALUES (p_usuario1_id, p_usuario2_id, p_tipo_relacion, false)
  RETURNING * INTO v_inserted;

  RETURN to_jsonb(v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_relacion_familiar_segura(
  p_auth_id uuid,
  p_relacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_relation public.relaciones_usuarios%ROWTYPE;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_relation
  FROM public.relaciones_usuarios ru
  WHERE ru.id = p_relacion_id;

  IF v_relation.id IS NULL THEN
    RAISE EXCEPTION 'Relationship not found' USING ERRCODE = '02000';
  END IF;

  IF NOT public.puede_gestionar_relacion_familiar(p_auth_id, v_relation.usuario1_id, v_relation.usuario2_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this relationship' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.relaciones_usuarios ru
  WHERE ru.id = p_relacion_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.agregar_relacion_familiar_segura(uuid, uuid, uuid, enum_tipo_relacion) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_relacion_familiar_segura(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agregar_relacion_familiar_segura(uuid, uuid, uuid, enum_tipo_relacion) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_relacion_familiar_segura(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.eliminar_relacion_familiar(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.eliminar_relacion_familiar(uuid) FROM PUBLIC;
  END IF;
END $$;
