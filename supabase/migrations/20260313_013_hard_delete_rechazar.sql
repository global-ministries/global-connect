-- Fix: procesar_solicitud_grupo debe setear estado_aprobacion = 'aprobado' al aprobar activacion_grupo

CREATE OR REPLACE FUNCTION public.procesar_solicitud_grupo(
  p_auth_id uuid, p_solicitud_id uuid, p_accion text, p_notas text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_aprobador_id uuid; v_sol record; v_grupo_id uuid;
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
      UPDATE public.grupos SET 
        activo = true, 
        estado_ciclo = 'activo',
        estado_aprobacion = 'aprobado'
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
    v_grupo_id := v_sol.grupo_id;
    DELETE FROM public.solicitudes_grupo WHERE id = p_solicitud_id;
    IF v_sol.tipo = 'activacion_grupo' THEN
      DELETE FROM public.grupos WHERE id = v_grupo_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'accion_invalida';
  END IF;

  RETURN jsonb_build_object('ok', true, 'modo', p_accion, 'solicitud_id', p_solicitud_id);
END; $$;
