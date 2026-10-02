-- Identity guard for the group writes that take the caller as an argument
-- (security phase 2, batch 4).
--
-- What was wrong in the live functions:
--   * They are SECURITY DEFINER and WRITE on behalf of the identity they receive
--     as p_auth_id, but never compared it with the session. Any logged-in person
--     who knew another person's auth id could act as that person: create groups
--     as an admin (crear_grupo), file requests or, when the victim is a general
--     director of the group, write members straight into a group
--     (crear_solicitud_grupo), approve or reject requests and activate or delete
--     groups (procesar_solicitud_grupo), and move a stage director between
--     locations (asignar_director_etapa_a_ubicacion).
--     asignar_lider_matrimonio was only protected by the identity check inside
--     puede_editar_grupo; it gets the same explicit guard so it no longer depends
--     on that predicate.
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, SECURITY DEFINER and owner are unchanged, so the app needs no
-- change):
--   * Identity: p_auth_id must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000 and of batch 1
--     (20261002100000). The guard is the first statement of each body, before
--     anything is read or written; the rest of every body is the live text.
--   * search_path is pinned to public where the function had none
--     (crear_solicitud_grupo, procesar_solicitud_grupo,
--     asignar_director_etapa_a_ubicacion). Every object their bodies use is
--     already schema-qualified (public.*, auth.*), and the tables they write
--     have no trigger or default that relies on another schema.
--   * Grants: anon and PUBLIC lose execute (they already hold nothing since the
--     anon lock-down); authenticated and service_role keep it. The grants are
--     restated at the end of the file.
--
-- Exit for another person's identity or no session (decision D3: the refusal the
-- function already produces for "unknown user / no permission", same message and
-- SQLSTATE P0001, so the app's error handling keeps working):
--   crear_grupo                          'Permiso denegado para crear grupo en el
--                                        segmento indicado'
--   crear_solicitud_grupo                'usuario_no_encontrado'
--   procesar_solicitud_grupo             'usuario_no_encontrado'
--   asignar_director_etapa_a_ubicacion   'Usuario no encontrado'
--   asignar_lider_matrimonio             'sin_permisos'
-- The guard raises before any insert, update or delete, so a refused call writes
-- nothing.
--
-- Call sites (inventory on staging; production bodies are identical):
--   * crear_grupo is called by crear_grupo_con_director with v_auth_id, which is
--     auth.uid() (that function already rejects a null session): the guard lets
--     it through.
--   * The other four have no caller inside the database (no function, policy,
--     trigger or view; planner_guardar_planificacion does not call any of them).
--   * The app calls them with the session client and the signed-in person's own
--     id; scripts use the service client, which stays exempt.
--
-- Not changed on purpose: for anybody who passes its permission check,
-- asignar_director_etapa_a_ubicacion fails today with 42702 (column "id" is
-- ambiguous with the RETURNS TABLE column) at the segmento_lideres lookup, before
-- any write. The body is kept as it is; only the guard and the pin are added.
--
-- Blast radius: only a caller that passes somebody else's id through a
-- non-service session changes, and that is the point. Own identity and the
-- service client behave exactly as before.
--
-- Rollback: recreate the previous definitions. Some of them were edited live
-- after their last migration, so production keeps a backup table of the live
-- definitions that the operator creates before applying this file; restore from
-- that table.

CREATE OR REPLACE FUNCTION public.crear_grupo(p_auth_id uuid, p_nombre text, p_temporada_id uuid, p_segmento_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_nuevo_id uuid;
  v_user_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Permiso denegado para crear grupo en el segmento indicado';
  END IF;

  IF p_auth_id IS NULL OR p_nombre IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  IF NOT public.puede_crear_grupo(p_auth_id, p_segmento_id) THEN
    RAISE EXCEPTION 'Permiso denegado para crear grupo en el segmento indicado';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  INSERT INTO public.grupos (nombre, temporada_id, segmento_id, campus_id, activo)
  VALUES (p_nombre, p_temporada_id, p_segmento_id, p_campus_id, TRUE)
  RETURNING id INTO v_nuevo_id;

  RETURN v_nuevo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_solicitud_grupo(p_auth_id uuid, p_tipo text, p_usuario_id uuid, p_grupo_id uuid, p_grupo_origen_id uuid DEFAULT NULL::uuid, p_rol_solicitado text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_solicitante_id uuid; v_config record; v_solicitud_id uuid;
  v_temporada_id uuid; v_temporada_estado text;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'usuario_no_encontrado';
  END IF;

  SELECT id INTO v_solicitante_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_solicitante_id IS NULL THEN RAISE EXCEPTION 'usuario_no_encontrado'; END IF;

  SELECT * INTO v_config FROM public.configuracion_grupos_vida LIMIT 1;

  SELECT g.temporada_id, t.estado INTO v_temporada_id, v_temporada_estado
  FROM public.grupos g JOIN public.temporadas t ON t.id = g.temporada_id
  WHERE g.id = p_grupo_id;

  -- Flujo directo: DG+ puede hacer ingreso/egreso sin solicitud
  IF public.es_director_general_de_grupo(p_auth_id, p_grupo_id)
     AND p_tipo IN ('ingreso', 'egreso') THEN

    IF p_tipo = 'ingreso' THEN
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (p_grupo_id, p_usuario_id, COALESCE(p_rol_solicitado, 'Miembro')::public.enum_rol_grupo)
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol, fecha_salida = NULL;
    ELSIF p_tipo = 'egreso' THEN
      -- Hard delete: eliminar el registro del grupo
      DELETE FROM public.grupo_miembros
      WHERE grupo_id = p_grupo_id AND usuario_id = p_usuario_id;
    END IF;

    INSERT INTO public.historial_movimientos_grupo
      (usuario_id, grupo_destino_id, tipo_movimiento, rol_nuevo, motivo, realizado_por, temporada_id)
    VALUES (p_usuario_id, p_grupo_id,
      CASE WHEN p_tipo = 'ingreso' THEN 'ingreso_directo' ELSE 'egreso' END,
      p_rol_solicitado, p_motivo, v_solicitante_id, v_temporada_id);

    RETURN jsonb_build_object('ok', true, 'modo', 'directo', 'tipo', p_tipo);
  END IF;

  -- Flujo solicitud
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.procesar_solicitud_grupo(p_auth_id uuid, p_solicitud_id uuid, p_accion text, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_aprobador_id uuid; v_sol record; v_grupo_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'usuario_no_encontrado';
  END IF;

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
      -- Hard delete: eliminar el miembro del grupo
      DELETE FROM public.grupo_miembros
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_ubicacion(p_auth_id uuid, p_director_etapa_id uuid, p_segmento_ubicacion_id uuid, p_accion text)
 RETURNS TABLE(id uuid, director_etapa_id uuid, segmento_ubicacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_es_superior boolean := false;
  v_tipo text;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF p_auth_id IS NULL OR p_director_etapa_id IS NULL OR p_segmento_ubicacion_id IS NULL OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  SELECT TRUE INTO v_es_superior FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general') LIMIT 1;
  IF NOT v_es_superior THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  SELECT tipo_lider INTO v_tipo FROM public.segmento_lideres WHERE id = p_director_etapa_id;
  IF v_tipo IS DISTINCT FROM 'director_etapa' THEN RAISE EXCEPTION 'No es director_etapa'; END IF;

  IF p_accion = 'agregar' THEN
    INSERT INTO public.director_etapa_ubicaciones(director_etapa_id, segmento_ubicacion_id)
    VALUES(p_director_etapa_id, p_segmento_ubicacion_id)
    ON CONFLICT (director_etapa_id) DO UPDATE SET segmento_ubicacion_id = EXCLUDED.segmento_ubicacion_id;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida';
  END IF;

  RETURN QUERY
    SELECT deu.id, deu.director_etapa_id, deu.segmento_ubicacion_id
    FROM public.director_etapa_ubicaciones deu
    WHERE deu.director_etapa_id = p_director_etapa_id;
END;$function$;

CREATE OR REPLACE FUNCTION public.asignar_lider_matrimonio(p_auth_id uuid, p_grupo_id uuid, p_lider_id uuid, p_incluir_conyugue boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_conyugue_id uuid;
  v_resultado jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF NOT public.puede_editar_grupo(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
  VALUES (p_grupo_id, p_lider_id, 'Líder')
  ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Líder', fecha_salida = NULL;

  v_resultado := jsonb_build_object('lider_asignado', p_lider_id);

  IF p_incluir_conyugue THEN
    SELECT c.id INTO v_conyugue_id
    FROM public.obtener_conyugue(p_lider_id) c;

    IF v_conyugue_id IS NOT NULL THEN
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (p_grupo_id, v_conyugue_id, 'Líder')
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Líder', fecha_salida = NULL;

      v_resultado := v_resultado || jsonb_build_object('conyugue_asignado', v_conyugue_id);
    ELSE
      v_resultado := v_resultado || jsonb_build_object('advertencia', 'sin_conyugue_registrado');
    END IF;
  END IF;

  RETURN v_resultado;
END;
$function$;

-- Execution rights: signed-in people and the service client only.
REVOKE ALL ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crear_solicitud_grupo(uuid, text, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procesar_solicitud_grupo(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asignar_lider_matrimonio(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crear_grupo(uuid, text, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_grupo(uuid, text, uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procesar_solicitud_grupo(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_lider_matrimonio(uuid, uuid, uuid, boolean) TO authenticated, service_role;
