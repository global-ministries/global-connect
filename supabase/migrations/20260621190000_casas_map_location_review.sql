-- Additive Casas Anfitrionas map DB foundation.
-- This migration creates contracts only; it performs no historical backfill or repair.

CREATE TABLE IF NOT EXISTS public.casa_anfitriona_location_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_anfitriona_id uuid NOT NULL REFERENCES public.casas_anfitrionas(id) ON DELETE CASCADE,
  proposed_direccion_id uuid NOT NULL REFERENCES public.direcciones(id) ON DELETE RESTRICT,
  requested_by_user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  review_type text NOT NULL CHECK (review_type IN ('create', 'location_change')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_by_user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  decision_notes text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.casa_anfitriona_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_anfitriona_id uuid REFERENCES public.casas_anfitrionas(id) ON DELETE SET NULL,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casa_anfitriona_location_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casa_anfitriona_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.casa_anfitriona_location_reviews FROM anon, authenticated;
REVOKE ALL ON TABLE public.casa_anfitriona_audit_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.casa_anfitriona_location_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.casa_anfitriona_audit_events TO service_role;

-- Production safety: these indexes are intentionally non-concurrent because this
-- migration is expected to run transactionally. Bound lock and statement waits so
-- deploys fail fast instead of blocking production traffic indefinitely.
-- If an index statement times out, retry during a quieter deployment window or
-- ship a fix-forward migration after verifying no partial object was created.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_casa
ON public.casa_anfitriona_location_reviews(casa_anfitriona_id);

CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_proposed_direction
ON public.casa_anfitriona_location_reviews(proposed_direccion_id);

CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_requested_by
ON public.casa_anfitriona_location_reviews(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_decision_by
ON public.casa_anfitriona_location_reviews(decision_by_user_id);

CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_pending
ON public.casa_anfitriona_location_reviews(created_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_casa_audit_events_casa_created
ON public.casa_anfitriona_audit_events(casa_anfitriona_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_casa_audit_events_actor
ON public.casa_anfitriona_audit_events(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_casa_audit_events_grupo
ON public.casa_anfitriona_audit_events(grupo_id);

CREATE INDEX IF NOT EXISTS idx_casas_map_approved_location
ON public.casas_anfitrionas(direccion_id)
WHERE aprobada = true AND activa = true AND direccion_id IS NOT NULL;

RESET lock_timeout;
RESET statement_timeout;

CREATE OR REPLACE FUNCTION public.casas_map_auth_matches_actor(p_auth_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
BEGIN
  RETURN p_auth_id IS NOT NULL
    AND (
      coalesce(v_request_role, '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.casas_map_director_general_can_view_group(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupos g
    WHERE g.id = p_grupo_id
      AND g.activo = true
      AND g.eliminado = false
      AND (
        EXISTS (
          SELECT 1
          FROM public.director_general_segmentos dgs
          WHERE dgs.usuario_id = p_user_id
            AND dgs.segmento_id = g.segmento_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.dg_directores_etapa dde ON dde.segmento_lider_id = deg.director_etapa_id
          WHERE dde.dg_usuario_id = p_user_id
            AND deg.grupo_id = g.id
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.casas_map_actor_can_approve_review(p_auth_id uuid, p_casa_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_owner_user_id uuid;
  v_is_admin_or_pastor boolean := false;
  v_is_director_general boolean := false;
BEGIN
  IF p_auth_id IS NULL OR p_casa_id IS NULL THEN RETURN false; END IF;

  SELECT u.id INTO v_actor_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  SELECT ca.usuario_id INTO v_owner_user_id FROM public.casas_anfitrionas ca WHERE ca.id = p_casa_id;

  IF v_actor_user_id IS NULL OR v_owner_user_id IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false),
         COALESCE(bool_or(rs.nombre_interno = 'director-general'), false)
  INTO v_is_admin_or_pastor, v_is_director_general
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_actor_user_id;

  IF v_is_admin_or_pastor THEN RETURN true; END IF;
  IF NOT v_is_director_general THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    WHERE gm.usuario_id = v_owner_user_id
      AND gm.fecha_salida IS NULL
      AND public.casas_map_director_general_can_view_group(v_actor_user_id, g.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.casas_map_user_can_view_group(p_auth_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean := false;
  v_is_pastor boolean := false;
  v_is_dg boolean := false;
  v_is_de boolean := false;
BEGIN
  IF p_grupo_id IS NULL OR NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN false; END IF;

  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(bool_or(rs.nombre_interno = 'admin'), false),
         COALESCE(bool_or(rs.nombre_interno = 'pastor'), false),
         COALESCE(bool_or(rs.nombre_interno = 'director-general'), false),
         COALESCE(bool_or(rs.nombre_interno = 'director-etapa'), false)
  INTO v_is_admin, v_is_pastor, v_is_dg, v_is_de
  FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  IF v_is_admin OR v_is_pastor THEN RETURN true; END IF;
  IF v_is_dg AND public.casas_map_director_general_can_view_group(v_user_id, p_grupo_id) THEN RETURN true; END IF;
  IF v_is_de AND EXISTS (
    SELECT 1 FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
    WHERE deg.grupo_id = p_grupo_id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
  ) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = v_user_id AND gm.fecha_salida IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_mapa_grupos_vida_host_homes(p_auth_id uuid, p_scope text DEFAULT 'active')
RETURNS TABLE (grupo_id uuid, grupo_nombre text, dia_reunion text, hora_reunion text, capacidad_maxima integer, estado_ciclo text, segmento text, temporada text, casa_id uuid, casa_nombre text, latitud double precision, longitud double precision, barrio text, notas_publicas text, total_miembros bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id, g.nombre, g.dia_reunion::text, g.hora_reunion::text, g.capacidad_maxima, g.estado_ciclo,
         s.nombre, t.nombre, ca.id, ca.nombre_lugar, d.latitud::double precision, d.longitud::double precision,
         d.barrio, ca.notas_publicas, COUNT(gm.usuario_id)
  FROM public.grupos g
  JOIN public.segmentos s ON s.id = g.segmento_id
  JOIN public.temporadas t ON t.id = g.temporada_id
  JOIN public.casas_anfitrionas ca ON ca.id = g.casa_anfitriona_id
  JOIN public.direcciones d ON d.id = ca.direccion_id
  LEFT JOIN public.grupo_miembros gm ON gm.grupo_id = g.id AND gm.fecha_salida IS NULL
  WHERE g.activo = true AND g.eliminado = false
    AND ((p_scope = 'active' AND g.estado_ciclo = 'activo') OR (p_scope = 'planned' AND g.estado_ciclo = 'proximo'))
    AND ca.aprobada = true AND ca.activa = true AND d.latitud IS NOT NULL AND d.longitud IS NOT NULL
    AND public.casas_map_user_can_view_group(p_auth_id, g.id)
  GROUP BY g.id, s.nombre, t.nombre, ca.id, d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_grupos_sin_casa_anfitriona(p_auth_id uuid, p_scope text DEFAULT 'active')
RETURNS TABLE (grupo_id uuid, grupo_nombre text, estado_ciclo text, segmento text, temporada text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id, g.nombre, g.estado_ciclo, s.nombre, t.nombre
  FROM public.grupos g
  JOIN public.segmentos s ON s.id = g.segmento_id
  JOIN public.temporadas t ON t.id = g.temporada_id
  WHERE g.activo = true AND g.eliminado = false AND g.casa_anfitriona_id IS NULL
    AND ((p_scope = 'active' AND g.estado_ciclo = 'activo') OR (p_scope = 'planned' AND g.estado_ciclo = 'proximo'))
    AND public.casas_map_user_can_view_group(p_auth_id, g.id)
  ORDER BY s.nombre, g.nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_casas_revision_pendiente(p_auth_id uuid)
RETURNS TABLE (review_id uuid, casa_id uuid, casa_nombre text, review_type text, created_at timestamptz, requested_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT r.id, ca.id, ca.nombre_lugar, r.review_type, r.created_at, trim(concat(u.nombre, ' ', u.apellido))
  FROM public.casa_anfitriona_location_reviews r
  JOIN public.casas_anfitrionas ca ON ca.id = r.casa_anfitriona_id
  LEFT JOIN public.usuarios u ON u.id = r.requested_by_user_id
  WHERE r.status = 'pending' AND public.casas_map_actor_can_approve_review(p_auth_id, ca.id)
  ORDER BY r.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(p_auth_id uuid, p_grupo_id uuid, p_casa_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_group_segment_id uuid;
  v_is_admin_or_pastor boolean := false;
  v_is_director_general boolean := false;
  v_is_director_etapa boolean := false;
  v_is_lider boolean := false;
BEGIN
  IF p_grupo_id IS NULL OR p_casa_id IS NULL OR NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN false; END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  SELECT g.segmento_id INTO v_group_segment_id
  FROM public.grupos g
  WHERE g.id = p_grupo_id AND g.activo = true AND g.eliminado = false;

  IF v_user_id IS NULL OR v_group_segment_id IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.casas_anfitrionas ca
    WHERE ca.id = p_casa_id
      AND ca.aprobada = true
      AND ca.activa = true
      AND ca.direccion_id IS NOT NULL
  ) THEN RETURN false; END IF;

  SELECT COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor')), false),
         COALESCE(bool_or(rs.nombre_interno = 'director-general'), false),
         COALESCE(bool_or(rs.nombre_interno = 'director-etapa'), false),
         COALESCE(bool_or(rs.nombre_interno = 'lider'), false)
  INTO v_is_admin_or_pastor, v_is_director_general, v_is_director_etapa, v_is_lider
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id;

  IF v_is_admin_or_pastor THEN RETURN true; END IF;

  IF v_is_director_general AND EXISTS (
    SELECT 1
    FROM public.grupos g
    JOIN public.casas_anfitrionas ca ON ca.id = p_casa_id
    WHERE g.id = p_grupo_id
      AND public.casas_map_director_general_can_view_group(v_user_id, g.id)
      AND (
      ca.usuario_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.grupo_miembros gm
        JOIN public.grupos owner_group ON owner_group.id = gm.grupo_id
        WHERE gm.usuario_id = ca.usuario_id AND gm.fecha_salida IS NULL
          AND public.casas_map_director_general_can_view_group(v_user_id, owner_group.id)
      )
    )
  ) THEN RETURN true; END IF;

  IF v_is_director_etapa AND EXISTS (
    SELECT 1
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
    JOIN public.casas_anfitrionas ca ON ca.id = p_casa_id
    WHERE deg.grupo_id = p_grupo_id AND sl.usuario_id = v_user_id AND sl.tipo_lider = 'director_etapa'
      AND (
        ca.usuario_id = v_user_id
        OR EXISTS (
          SELECT 1
          FROM public.grupo_miembros gm
          JOIN public.grupos owner_group ON owner_group.id = gm.grupo_id
          JOIN public.director_etapa_grupos owner_deg ON owner_deg.grupo_id = owner_group.id
          WHERE gm.usuario_id = ca.usuario_id AND gm.fecha_salida IS NULL
            AND owner_group.activo = true AND owner_group.eliminado = false
            AND owner_deg.director_etapa_id = deg.director_etapa_id
        )
      )
  ) THEN RETURN true; END IF;

  IF v_is_lider AND EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id
      AND gm.usuario_id = v_user_id
      AND gm.rol = 'Líder'
      AND gm.fecha_salida IS NULL
  ) AND EXISTS (
    SELECT 1
    FROM public.casas_anfitrionas ca
    WHERE ca.id = p_casa_id
      AND (
        ca.usuario_id = v_user_id
        OR EXISTS (
          SELECT 1
          FROM public.grupo_miembros gm
          WHERE gm.grupo_id = p_grupo_id
            AND gm.usuario_id = ca.usuario_id
            AND gm.fecha_salida IS NULL
        )
      )
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.asignar_casa_anfitriona_a_grupo(p_auth_id uuid, p_grupo_id uuid, p_casa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor_user_id uuid; v_existing_group_id uuid;
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RAISE EXCEPTION 'sin_permisos'; END IF;
  SELECT id INTO v_actor_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_actor_user_id IS NULL OR NOT public.puede_asignar_casa_anfitriona_a_grupo(p_auth_id, p_grupo_id, p_casa_id) THEN RAISE EXCEPTION 'sin_permisos'; END IF;

  -- Backward-compatible concurrency guard: avoid a partial unique index that could
  -- fail on existing production multi-group data. This lock prevents this RPC from
  -- creating two active single-use assignments for the same Casa concurrently;
  -- later slices can add an explicit shared-Casa policy before allowing exceptions.
  PERFORM pg_advisory_xact_lock(hashtextextended('casas_map_assign:' || p_casa_id::text, 0));
  PERFORM 1 FROM public.casas_anfitrionas ca WHERE ca.id = p_casa_id FOR UPDATE;
  PERFORM 1 FROM public.grupos g WHERE g.id = p_grupo_id FOR UPDATE;

  SELECT g.id INTO v_existing_group_id
  FROM public.grupos g
  WHERE g.casa_anfitriona_id = p_casa_id AND g.id <> p_grupo_id AND g.activo = true AND g.eliminado = false
  LIMIT 1
  FOR UPDATE;

  IF v_existing_group_id IS NOT NULL THEN RAISE EXCEPTION 'casa_en_uso'; END IF;
  UPDATE public.grupos g SET casa_anfitriona_id = p_casa_id, updated_at = now() WHERE g.id = p_grupo_id;
  INSERT INTO public.casa_anfitriona_audit_events(casa_anfitriona_id, grupo_id, actor_user_id, event_type) VALUES (p_casa_id, p_grupo_id, v_actor_user_id, 'group_assigned'); -- noqa: insert-into
  RETURN jsonb_build_object('ok', true, 'grupo_id', p_grupo_id, 'casa_id', p_casa_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.procesar_revision_ubicacion_casa(p_auth_id uuid, p_review_id uuid, p_accion text, p_notas text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_review record; v_actor_user_id uuid;
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RAISE EXCEPTION 'sin_permisos'; END IF;
  SELECT id INTO v_actor_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  SELECT * INTO v_review FROM public.casa_anfitriona_location_reviews WHERE id = p_review_id AND status = 'pending' FOR UPDATE;
  IF v_actor_user_id IS NULL OR v_review.id IS NULL OR NOT public.casas_map_actor_can_approve_review(p_auth_id, v_review.casa_anfitriona_id) THEN RAISE EXCEPTION 'sin_permisos'; END IF;
  IF p_accion = 'aprobar' THEN
    UPDATE public.casa_anfitriona_location_reviews SET status = 'approved', decision_by_user_id = v_actor_user_id, decision_notes = p_notas, decided_at = now(), updated_at = now() WHERE id = p_review_id;
    UPDATE public.casas_anfitrionas ca SET direccion_id = v_review.proposed_direccion_id, aprobada = true, activa = true, aprobada_por = v_actor_user_id, aprobada_en = now(), actualizado_en = now() WHERE ca.id = v_review.casa_anfitriona_id;
  ELSIF p_accion = 'rechazar' THEN
    UPDATE public.casa_anfitriona_location_reviews SET status = 'rejected', decision_by_user_id = v_actor_user_id, decision_notes = p_notas, decided_at = now(), updated_at = now() WHERE id = p_review_id;
  ELSE
    RAISE EXCEPTION 'accion_invalida';
  END IF;
  INSERT INTO public.casa_anfitriona_audit_events(casa_anfitriona_id, actor_user_id, event_type, event_data) VALUES (v_review.casa_anfitriona_id, v_actor_user_id, 'location_review_' || p_accion, jsonb_build_object('review_id', p_review_id)); -- noqa: insert-into
  RETURN jsonb_build_object('ok', true, 'accion', p_accion, 'review_id', p_review_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_mapa_miembros(p_auth_id uuid, p_scope text DEFAULT 'active')
RETURNS TABLE (usuario_id uuid, nombre text, grupo_id uuid, grupo_nombre text, latitud double precision, longitud double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user_id uuid; v_can_view boolean := false;
BEGIN
  IF NOT public.casas_map_auth_matches_actor(p_auth_id) THEN RETURN; END IF;
  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  SELECT COALESCE(bool_or(rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')), false) INTO v_can_view
  FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id WHERE ur.usuario_id = v_user_id;
  IF NOT v_can_view THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (u.id) u.id, trim(concat(u.nombre, ' ', u.apellido)), g.id, g.nombre, d.latitud::double precision, d.longitud::double precision
  FROM public.grupo_miembros gm
  JOIN public.usuarios u ON u.id = gm.usuario_id
  JOIN public.direcciones d ON d.id = u.direccion_id
  JOIN public.grupos g ON g.id = gm.grupo_id
  WHERE gm.fecha_salida IS NULL AND g.activo = true AND g.eliminado = false
    AND d.latitud IS NOT NULL AND d.longitud IS NOT NULL
    AND ((p_scope = 'active' AND g.estado_ciclo = 'activo') OR (p_scope = 'planned' AND g.estado_ciclo = 'proximo'))
    AND public.casas_map_user_can_view_group(p_auth_id, g.id)
  ORDER BY u.id, g.nombre, g.id;
END;
$$;

REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.casas_map_user_can_view_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_user_can_view_group(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_user_can_view_group(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_casas_revision_pendiente(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procesar_revision_ubicacion_casa(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_mapa_miembros(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_casas_revision_pendiente(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.procesar_revision_ubicacion_casa(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_mapa_miembros(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.procesar_revision_ubicacion_casa(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_casas_revision_pendiente(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_mapa_miembros(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.casas_map_auth_matches_actor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.procesar_revision_ubicacion_casa(uuid, uuid, text, text) TO service_role;
