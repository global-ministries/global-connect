-- Fix: cast text → enum_rol_grupo en RPCs crear_solicitud_grupo y procesar_solicitud_grupo
-- El parámetro p_rol_solicitado es tipo text, pero grupo_miembros.rol es enum_rol_grupo
-- Sin el cast explícito: "column rol is of type enum_rol_grupo but expression is of type text"

-- ═══════════════════════════════════════════════════════════════════════
-- Re-crear crear_solicitud_grupo con casts explícitos
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crear_solicitud_grupo(
  p_auth_id uuid, p_tipo text, p_usuario_id uuid, p_grupo_id uuid,
  p_grupo_origen_id uuid DEFAULT NULL, p_rol_solicitado text DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_solicitante_id uuid; v_config record; v_solicitud_id uuid;
  v_temporada_id uuid; v_temporada_estado text;
BEGIN
  SELECT id INTO v_solicitante_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_solicitante_id IS NULL THEN RAISE EXCEPTION 'usuario_no_encontrado'; END IF;

  SELECT * INTO v_config FROM public.configuracion_grupos_vida LIMIT 1;

  SELECT g.temporada_id, t.estado INTO v_temporada_id, v_temporada_estado
  FROM public.grupos g JOIN public.temporadas t ON t.id = g.temporada_id
  WHERE g.id = p_grupo_id;

  IF public.es_director_general_de_grupo(p_auth_id, p_grupo_id)
     AND p_tipo IN ('ingreso', 'egreso') THEN

    IF p_tipo = 'ingreso' THEN
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (p_grupo_id, p_usuario_id, COALESCE(p_rol_solicitado, 'Miembro')::public.enum_rol_grupo)
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol, fecha_salida = NULL;
    ELSIF p_tipo = 'egreso' THEN
      UPDATE public.grupo_miembros SET fecha_salida = now()
      WHERE grupo_id = p_grupo_id AND usuario_id = p_usuario_id;
    END IF;

    INSERT INTO public.historial_movimientos_grupo
      (usuario_id, grupo_destino_id, tipo_movimiento, rol_nuevo, motivo, realizado_por, temporada_id)
    VALUES (p_usuario_id, p_grupo_id,
      CASE WHEN p_tipo = 'ingreso' THEN 'ingreso_directo' ELSE 'egreso' END,
      p_rol_solicitado, p_motivo, v_solicitante_id, v_temporada_id);

    RETURN jsonb_build_object('ok', true, 'modo', 'directo', 'tipo', p_tipo);
  END IF;

  IF NOT public.puede_editar_grupo(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF p_tipo = 'ingreso' AND COALESCE(p_rol_solicitado, 'Miembro') = 'Miembro' THEN
    IF EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
      WHERE gm.usuario_id = p_usuario_id
        AND gm.fecha_salida IS NULL AND gm.rol = 'Miembro'::public.enum_rol_grupo
        AND g.activo = true AND g.eliminado = false
    ) THEN
      RAISE EXCEPTION 'miembro_ya_en_grupo';
    END IF;
  END IF;

  INSERT INTO public.solicitudes_grupo
    (tipo, solicitado_por, usuario_id, grupo_id, grupo_origen_id,
     rol_solicitado, motivo, temporada_id, expira_en)
  VALUES
    (p_tipo, v_solicitante_id, p_usuario_id, p_grupo_id, p_grupo_origen_id,
     p_rol_solicitado, p_motivo, v_temporada_id,
     now() + (v_config.dias_expiracion_solicitud || ' days')::interval)
  RETURNING id INTO v_solicitud_id;

  RETURN jsonb_build_object('ok', true, 'modo', 'solicitud', 'solicitud_id', v_solicitud_id);
END; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Re-crear procesar_solicitud_grupo con casts explícitos
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.procesar_solicitud_grupo(
  p_auth_id uuid, p_solicitud_id uuid, p_accion text, p_notas text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_aprobador_id uuid; v_sol record;
BEGIN
  SELECT id INTO v_aprobador_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_aprobador_id IS NULL THEN RAISE EXCEPTION 'usuario_no_encontrado'; END IF;

  SELECT * INTO v_sol FROM public.solicitudes_grupo WHERE id = p_solicitud_id AND estado = 'pendiente';
  IF v_sol IS NULL THEN RAISE EXCEPTION 'solicitud_no_encontrada_o_procesada'; END IF;

  IF NOT public.es_director_general_de_grupo(p_auth_id, v_sol.grupo_id) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_grupo';
  END IF;

  IF p_accion = 'aprobar' THEN
    IF v_sol.tipo = 'ingreso' THEN
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (v_sol.grupo_id, v_sol.usuario_id, COALESCE(v_sol.rol_solicitado, 'Miembro')::public.enum_rol_grupo)
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol, fecha_salida = NULL;

    ELSIF v_sol.tipo = 'traslado' THEN
      UPDATE public.grupo_miembros SET fecha_salida = now()
      WHERE grupo_id = v_sol.grupo_origen_id AND usuario_id = v_sol.usuario_id;
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (v_sol.grupo_id, v_sol.usuario_id, COALESCE(v_sol.rol_solicitado, 'Miembro')::public.enum_rol_grupo)
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol, fecha_salida = NULL;

    ELSIF v_sol.tipo = 'cambio_rol' THEN
      UPDATE public.grupo_miembros SET rol = v_sol.rol_solicitado::public.enum_rol_grupo
      WHERE grupo_id = v_sol.grupo_id AND usuario_id = v_sol.usuario_id;

    ELSIF v_sol.tipo = 'egreso' THEN
      UPDATE public.grupo_miembros SET fecha_salida = now()
      WHERE grupo_id = v_sol.grupo_id AND usuario_id = v_sol.usuario_id;

    ELSIF v_sol.tipo = 'activacion_grupo' THEN
      UPDATE public.grupos SET activo = true, estado_ciclo = 'activo'
      WHERE id = v_sol.grupo_id;
    END IF;

    IF v_sol.usuario_id IS NOT NULL THEN
      INSERT INTO public.historial_movimientos_grupo
        (solicitud_id, usuario_id, grupo_origen_id, grupo_destino_id,
         tipo_movimiento, rol_anterior, rol_nuevo, motivo, realizado_por, temporada_id)
      VALUES (p_solicitud_id, v_sol.usuario_id, v_sol.grupo_origen_id, v_sol.grupo_id,
        v_sol.tipo, v_sol.rol_actual, v_sol.rol_solicitado,
        v_sol.motivo, v_aprobador_id, v_sol.temporada_id);
    END IF;

    UPDATE public.solicitudes_grupo SET
      estado = 'aprobado', aprobado_por = v_aprobador_id,
      notas_director = p_notas, actualizado_en = now()
    WHERE id = p_solicitud_id;

  ELSIF p_accion = 'rechazar' THEN
    UPDATE public.solicitudes_grupo SET
      estado = 'rechazado', aprobado_por = v_aprobador_id,
      notas_director = p_notas, actualizado_en = now()
    WHERE id = p_solicitud_id;
  ELSE
    RAISE EXCEPTION 'accion_invalida';
  END IF;

  RETURN jsonb_build_object('ok', true, 'modo', p_accion, 'solicitud_id', p_solicitud_id);
END; $$;
