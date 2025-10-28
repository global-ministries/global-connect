-- Corrección de columnas y conteos en obtener_datos_dashboard
-- - usuarios.fecha_registro (no fecha_creacion)
-- - grupo_miembros.fecha_asignacion (no fecha_creacion)
-- - total_miembros: COUNT(*) de usuarios (no existe columna activo en usuarios)
-- - nuevos_miembros_mes: fecha_registro últimos 30 días

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

  IF NOT v_es_superior THEN
    RETURN jsonb_build_object('rol', v_rol_nombre, 'widgets', jsonb_build_object());
  END IF;

  -- Total miembros y variación 30 días
  SELECT COUNT(*) INTO v_total_miembros FROM public.usuarios;
  SELECT COUNT(*) INTO v_total_miembros_hace_30 
    FROM public.usuarios u
    WHERE u.fecha_registro <= (CURRENT_DATE - INTERVAL '30 days');
  v_variacion_miembros := CASE WHEN v_total_miembros_hace_30 > 0
    THEN ROUND(((v_total_miembros - v_total_miembros_hace_30)::numeric / v_total_miembros_hace_30::numeric) * 100, 1)
    ELSE 0 END;

  -- Asistencia semanal (reutiliza reporte semanal, sin incluir todos)
  BEGIN
    v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true);
    v_asistencia_semanal := COALESCE((v_rep->'kpis_globales'->>'porcentaje_asistencia_global')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    v_asistencia_semanal := 0;
  END;

  -- Grupos activos (no eliminados)
  SELECT COUNT(*) INTO v_grupos_activos 
  FROM public.grupos g
  WHERE g.activo = true AND COALESCE(g.eliminado,false) = false;

  -- Nuevos miembros últimos 30 días
  SELECT COUNT(*) INTO v_nuevos_miembros_mes
  FROM public.usuarios u
  WHERE u.fecha_registro >= (CURRENT_DATE - INTERVAL '30 days');

  -- Actividad reciente (fix columnas)
  v_actividad := (
    WITH eventos AS (
      SELECT u.fecha_registro AS fecha, 'NUEVO_MIEMBRO'::text AS tipo,
             (u.nombre || ' ' || u.apellido || ' se ha unido a la comunidad.') AS texto
      FROM public.usuarios u
      WHERE u.fecha_registro IS NOT NULL
      UNION ALL
      SELECT g.fecha_creacion AS fecha, 'NUEVO_GRUPO'::text AS tipo,
             ('Se creó el grupo "' || g.nombre || '".') AS texto
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
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', tipo, 'texto', texto, 'fecha', fecha) ORDER BY fecha DESC), '[]'::jsonb)
    FROM eventos
    ORDER BY fecha DESC
    LIMIT 5
  );

  -- Próximos cumpleaños (14 días)
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

  -- Riesgo/tendencia de reporte semanal
  IF v_rep IS NULL THEN v_rep := public.obtener_reporte_semanal_asistencia(p_auth_id, NULL, true); END IF;
  v_riesgo := COALESCE(v_rep->'top_5_grupos_en_riesgo', '[]'::jsonb);
  v_tendencia := COALESCE(v_rep->'tendencia_asistencia_global', '[]'::jsonb);

  -- Distribución por segmento: miembros únicos por segmento (grupos activos, no eliminados)
  v_distribucion := (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'nombre', COALESCE(s.nombre,'Sin segmento'),
      'total_miembros', COALESCE(COUNT(DISTINCT gm.usuario_id),0)
    ) ORDER BY COUNT(DISTINCT gm.usuario_id) DESC), '[]'::jsonb)
    FROM public.segmentos s
    JOIN public.grupos g ON g.segmento_id = s.id AND g.activo = true AND COALESCE(g.eliminado,false)=false
    LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = g.id
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
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_datos_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_datos_dashboard(uuid) TO authenticated, service_role;
