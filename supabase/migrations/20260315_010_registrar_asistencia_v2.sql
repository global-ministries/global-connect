-- Migración: Extender registrar_asistencia v2
-- Backward compatible: acepta tanto {presente: true} como {tipo_presencia: 'presente'}
-- Nuevos campos: descripción, puntos de oración, notas privadas, visitantes, no hubo reunión

-- Primero revocar permisos de la versión anterior
REVOKE ALL ON FUNCTION public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb) FROM public, authenticated, service_role, anon;
DROP FUNCTION IF EXISTS public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.registrar_asistencia(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_fecha date,
  p_hora text DEFAULT NULL,
  p_tema text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_asistencias jsonb DEFAULT NULL,
  -- Nuevos parámetros v2
  p_descripcion text DEFAULT NULL,
  p_puntos_oracion text DEFAULT NULL,
  p_notas_privadas_lider text DEFAULT NULL,
  p_conteo_visitantes integer DEFAULT 0,
  p_no_hubo_reunion boolean DEFAULT false,
  p_motivo_no_reunion text DEFAULT NULL,
  p_forzar_edicion boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permitido boolean;
  v_evento_id uuid;
  v_row jsonb;
  v_usuario_id uuid;
  v_tipo_presencia text;
  v_presente boolean;
  v_motivo text;
  v_nota text;
  v_config record;
BEGIN
  IF p_auth_id IS NULL OR p_grupo_id IS NULL OR p_fecha IS NULL THEN
    RETURN jsonb_build_object('error', 'Parámetros requeridos faltan');
  END IF;

  SELECT public.puede_editar_grupo(p_auth_id, p_grupo_id) INTO v_permitido;
  IF NOT COALESCE(v_permitido, false) THEN
    RETURN jsonb_build_object('error', 'No autorizado para registrar asistencia en este grupo');
  END IF;

  -- Verificar ventana de edición (si no es forzado)
  IF NOT p_forzar_edicion THEN
    SELECT c.* INTO v_config
    FROM configuracion_grupos_vida c
    JOIN grupos g ON g.campus_id = c.campus_id
    WHERE g.id = p_grupo_id
    LIMIT 1;

    -- Lógica de cierre de ventana según modo
    IF v_config IS NOT NULL AND v_config.modo_cierre_asistencia IS NOT NULL THEN
      CASE v_config.modo_cierre_asistencia
        WHEN 'semanal' THEN
          -- Cerrado si pasó el día y hora de cierre de la semana correspondiente
          NULL; -- Validación detallada se hace en el frontend
        WHEN 'ultimas_2_semanas' THEN
          IF p_fecha < CURRENT_DATE - interval '14 days' THEN
            RETURN jsonb_build_object('error', 'La ventana de edición de 2 semanas ha expirado para esta fecha');
          END IF;
        WHEN 'ultimo_mes' THEN
          IF p_fecha < CURRENT_DATE - interval '30 days' THEN
            RETURN jsonb_build_object('error', 'La ventana de edición de 1 mes ha expirado para esta fecha');
          END IF;
        WHEN 'libre' THEN
          NULL; -- Sin restricción
      END CASE;
    END IF;
  END IF;

  -- Buscar evento existente por fecha
  SELECT id INTO v_evento_id
  FROM public.eventos_grupo
  WHERE grupo_id = p_grupo_id AND fecha = p_fecha
  LIMIT 1;

  IF v_evento_id IS NULL THEN
    INSERT INTO public.eventos_grupo(
      id, grupo_id, fecha, hora, tema, notas,
      tipo, descripcion, puntos_oracion, notas_privadas_lider,
      conteo_visitantes, registrado_en, no_hubo_reunion, motivo_no_reunion
    )
    VALUES (
      gen_random_uuid(), p_grupo_id, p_fecha, p_hora::time, p_tema, p_notas,
      'regular', p_descripcion, p_puntos_oracion, p_notas_privadas_lider,
      COALESCE(p_conteo_visitantes, 0), now(), p_no_hubo_reunion, p_motivo_no_reunion
    )
    RETURNING id INTO v_evento_id;
  ELSE
    UPDATE public.eventos_grupo
    SET
      hora = COALESCE(p_hora::time, hora),
      tema = COALESCE(p_tema, tema),
      notas = COALESCE(p_notas, notas),
      descripcion = COALESCE(p_descripcion, descripcion),
      puntos_oracion = COALESCE(p_puntos_oracion, puntos_oracion),
      notas_privadas_lider = COALESCE(p_notas_privadas_lider, notas_privadas_lider),
      conteo_visitantes = COALESCE(p_conteo_visitantes, conteo_visitantes),
      no_hubo_reunion = p_no_hubo_reunion,
      motivo_no_reunion = COALESCE(p_motivo_no_reunion, motivo_no_reunion),
      registrado_en = now()
    WHERE id = v_evento_id;
  END IF;

  -- Si no hubo reunión, no registrar asistencias individuales
  IF p_no_hubo_reunion THEN
    RETURN jsonb_build_object('ok', true, 'evento_id', v_evento_id, 'no_hubo_reunion', true);
  END IF;

  -- Registrar asistencias: soporta formato v1 {presente: bool} y v2 {tipo_presencia: text}
  IF p_asistencias IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_asistencias)
    LOOP
      v_usuario_id := (v_row ->> 'usuario_id')::uuid;

      -- Backward compatibility: soportar tanto 'presente' (bool) como 'tipo_presencia' (text)
      IF v_row ? 'tipo_presencia' THEN
        v_tipo_presencia := v_row ->> 'tipo_presencia';
      ELSIF v_row ? 'presente' THEN
        v_presente := COALESCE((v_row ->> 'presente')::boolean, false);
        v_tipo_presencia := CASE WHEN v_presente THEN 'presente' ELSE 'ausente' END;
      ELSE
        v_tipo_presencia := 'presente'; -- Default
      END IF;

      v_motivo := NULLIF(v_row ->> 'motivo_inasistencia', '');
      v_nota := NULLIF(v_row ->> 'nota', '');

      IF v_usuario_id IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.asistencia(
        id, evento_grupo_id, usuario_id, presente, motivo_inasistencia,
        registrado_por_usuario_id, fecha_registro, tipo_presencia, nota
      )
      VALUES (
        gen_random_uuid(), v_evento_id, v_usuario_id,
        v_tipo_presencia IN ('presente', 'tarde'), -- mantener campo `presente` para backward compat
        v_motivo,
        (SELECT u.id FROM public.usuarios u WHERE u.auth_id = p_auth_id),
        now(),
        v_tipo_presencia,
        v_nota
      )
      ON CONFLICT (evento_grupo_id, usuario_id) DO UPDATE
        SET presente = EXCLUDED.presente,
            motivo_inasistencia = EXCLUDED.motivo_inasistencia,
            registrado_por_usuario_id = EXCLUDED.registrado_por_usuario_id,
            fecha_registro = EXCLUDED.fecha_registro,
            tipo_presencia = EXCLUDED.tipo_presencia,
            nota = EXCLUDED.nota;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'evento_id', v_evento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb, text, text, text, integer, boolean, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb, text, text, text, integer, boolean, text, boolean) TO authenticated, service_role, anon;
