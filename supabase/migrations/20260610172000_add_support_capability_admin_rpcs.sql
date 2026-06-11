-- Add audited support capability administration RPCs.
-- Production safety: additive function definitions plus nullable audit ticket reference; no data deletion.
-- noqa: insert-into

ALTER TABLE public.support_ticket_events
  ALTER COLUMN ticket_id DROP NOT NULL;

DROP POLICY IF EXISTS support_events_select ON public.support_ticket_events;
CREATE POLICY support_events_select ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (
    (
      ticket_id IS NULL
      AND target_type = 'support_user_capability'
      AND support_private.has_capability('support.manage')
    )
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND (st.reporter_usuario_id = support_private.current_usuario_id() OR support_private.has_capability('support.view'))
    )
  );

CREATE OR REPLACE FUNCTION public.grant_support_capability(p_target_usuario_id uuid, p_capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_capability_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_capability NOT IN ('support.view', 'support.reply', 'support.manage') THEN
    RAISE EXCEPTION 'invalid support capability';
  END IF;

  INSERT INTO public.support_user_capabilities (usuario_id, capability, granted_by_usuario_id, granted_at, revoked_at)
  VALUES (p_target_usuario_id, p_capability, v_actor_usuario_id, now(), NULL)
  ON CONFLICT (usuario_id, capability)
  DO UPDATE SET granted_by_usuario_id = EXCLUDED.granted_by_usuario_id,
                granted_at = now(),
                revoked_at = NULL
  RETURNING id INTO v_capability_id;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    v_actor_usuario_id,
    'support.capability.granted',
    'support_user_capability',
    v_capability_id,
    jsonb_build_object('targetUsuarioId', p_target_usuario_id, 'capability', p_capability)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_support_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_support_capability(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_support_capability(p_target_usuario_id uuid, p_capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_capability_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_usuario_id
      AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_capability NOT IN ('support.view', 'support.reply', 'support.manage') THEN
    RAISE EXCEPTION 'invalid support capability';
  END IF;

  UPDATE public.support_user_capabilities
  SET revoked_at = now()
  WHERE usuario_id = p_target_usuario_id
    AND capability = p_capability
    AND revoked_at IS NULL
  RETURNING id INTO v_capability_id;

  IF v_capability_id IS NULL THEN
    RAISE EXCEPTION 'support capability not found';
  END IF;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (
    NULL,
    v_actor_usuario_id,
    'support.capability.revoked',
    'support_user_capability',
    v_capability_id,
    jsonb_build_object('targetUsuarioId', p_target_usuario_id, 'capability', p_capability)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_support_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_support_capability(uuid, text) TO authenticated;
