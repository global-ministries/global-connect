CREATE OR REPLACE FUNCTION public.obtener_datos_dashboard(
  p_auth_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_rol_nombre text;
  v_es_superior boolean := false;
  v_result jsonb := '{}'::jsonb;

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

  -- Director de etapa
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
BEGIN
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  SELECT rs.nombre_interno INTO v_rol_nombre
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
  LIMIT 1;

  IF v_rol_nombre IN ('admin','pastor','director-general') THEN
    v_es_superior := true;
  END IF;

  IF v_es_superior THEN
    SELECT COUNT(*) INTO v_total_miembros FROM public.usuarios;
    SELECT COUNT(*) INTO v_total_miembros_hace_30 FROM public.usuarios u WHERE u.fecha_registro <= (CURRENT_DATE - INTERVAL '30 days');
    v_variacion_miembros := CASE WHEN v_total_miembros_hace_30 > 0 THEN ROUND(((v_total_miembros - v_total_miembros_hace_30)::numeric / v_total_miembros_hace_30::numeric) * 100, 1) ELSE 0 END;

    BEGIN
      v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
      v_asistencia_semanal := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_asistencia_semanal := 0;
    END;

    SELECT COUNT(*) INTO v_grupos_activos FROM public.grupos g WHERE g.activo = true AND COALESCE(g.eliminado,false) = false;
    SELECT COUNT(*) INTO v_nuevos_miembros_mes FROM public.usuarios u WHERE u.fecha_registro >= (CURRENT_DATE - INTERVAL '30 days');

    v_actividad := (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('tipo', e.tipo, 'texto', e.texto, 'fecha', e.fecha) ORDER BY e.fecha DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT * FROM (
          SELECT u.fecha_registro AS fecha, 'NUEVO_MIEMBRO'::text AS tipo,
                 (u.nombre || ' ' || u.apellido || ' se ha unido a la comunidad.') AS texto
          FROM public.usuarios u
          WHERE u.fecha_registro IS NOT NULL
          UNION ALL
          SELECT g.fecha_creacion AS fecha, 'NUEVO_GRUPO'::text AS tipo,
                 ('Se creó el grupo ' || '"' || g.nombre || '".') AS texto
          FROM public.grupos g
          WHERE g.fecha_creacion IS NOT NULL
          UNION ALL
          SELECT gm.fecha_asignacion AS fecha, 'USUARIO_A_GRUPO'::text AS tipo,
                 (COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'') || ' añadido a ' || COALESCE(g.nombre,'')) AS texto
          FROM public.grupo_miembros gm
          LEFT JOIN public.usuarios u ON u.id = gm.usuario_id
          LEFT JOIN public.grupos g ON g.id = gm.grupo_id
          WHERE gm.fecha_asignacion IS NOT NULL
          UNION ALL
          SELECT eg.fecha AS fecha, 'REPORTE_ASISTENCIA'::text AS tipo,
                 ('El grupo "' || COALESCE(g.nombre,'') || '" ha reportado su asistencia.') AS texto
          FROM public.eventos_grupo eg
          LEFT JOIN public.grupos g ON g.id = eg.grupo_id
        ) eventos
        ORDER BY fecha DESC
        LIMIT 5
      ) e
    );

    v_cumpleanos := (
      WITH base AS (
        SELECT u.id, u.nombre, u.apellido, u.foto_perfil_url, u.fecha_nacimiento,
               CASE WHEN u.fecha_nacimiento IS NULL THEN NULL ELSE
                 (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM u.fecha_nacimiento)::int, EXTRACT(DAY FROM u.fecha_nacimiento)::int)) END AS cumple_este_anio
        FROM public.usuarios u
        WHERE u.fecha_nacimiento IS NOT NULL
      ), norm AS (
        SELECT id, nombre, apellido, foto_perfil_url, fecha_nacimiento,
               CASE WHEN cumple_este_anio IS NULL THEN NULL
                    WHEN cumple_este_anio < CURRENT_DATE THEN (cumple_este_anio + INTERVAL '1 year')::date
                    ELSE cumple_este_anio::date END AS proximo
        FROM base
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
    v_riesgo := COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb);
    v_tendencia := COALESCE(v_rep->'tendencia_asistencia_global', '[]'::jsonb);

    v_distribucion := (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'total_miembros', x.total_miembros) ORDER BY x.total_miembros DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT s.id,
               COALESCE(s.nombre,'Sin segmento') AS nombre,
               COALESCE(COUNT(DISTINCT gm.usuario_id),0) AS total_miembros
        FROM public.segmentos s
        JOIN public.grupos g ON g.segmento_id = s.id AND g.activo = true AND COALESCE(g.eliminado,false)=false
        LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = g.id
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

    SELECT COUNT(DISTINCT gm.usuario_id)
    INTO v_total_miembros_alcance
    FROM public.grupo_miembros gm
    WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids);

    BEGIN
      v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
      v_asistencia_semanal_alcance := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_asistencia_semanal_alcance := 0;
    END;

    SELECT COUNT(*)
    INTO v_grupos_activos_alcance
    FROM public.grupos g
    WHERE (v_grupos_asignados_ids IS NOT NULL) AND g.id = ANY(v_grupos_asignados_ids) AND g.activo = true AND COALESCE(g.eliminado,false)=false;

    SELECT COUNT(*)
    INTO v_nuevos_miembros_mes_alcance
    FROM public.grupo_miembros gm
    WHERE (v_grupos_asignados_ids IS NOT NULL) AND gm.grupo_id = ANY(v_grupos_asignados_ids)
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
  ELSE
    RETURN jsonb_build_object('rol', v_rol_nombre, 'widgets', jsonb_build_object());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_datos_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_datos_dashboard(uuid) TO authenticated, service_role;
