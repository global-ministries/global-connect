-- Add atomic support staff action RPCs after the base support migration.
-- Production safety: additive function definitions only; no data mutation outside RPC execution.
-- noqa: insert-into

CREATE OR REPLACE FUNCTION public.create_staff_support_ticket_reply(p_ticket_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_message_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.reply') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, author_usuario_id, body, is_internal)
  VALUES (p_ticket_id, v_actor_usuario_id, p_body, false)
  RETURNING id INTO v_message_id;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (p_ticket_id, v_actor_usuario_id, 'support.staff_reply.created', 'support_ticket_message', v_message_id, '{}'::jsonb);

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_support_ticket(p_ticket_id uuid, p_assignee_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.support_tickets
  SET assignee_usuario_id = p_assignee_usuario_id
  WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support ticket not found';
  END IF;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (
    p_ticket_id,
    v_actor_usuario_id,
    'support.ticket.assigned',
    'support_ticket',
    p_ticket_id,
    jsonb_build_object('assigneeUsuarioId', p_assignee_usuario_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_support_ticket(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_support_ticket(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(p_ticket_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_status NOT IN ('received', 'in_review', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'invalid support ticket status';
  END IF;

  UPDATE public.support_tickets
  SET status = p_status,
      closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE NULL END
  WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support ticket not found';
  END IF;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (
    p_ticket_id,
    v_actor_usuario_id,
    'support.ticket.status_changed',
    'support_ticket',
    p_ticket_id,
    jsonb_build_object('status', p_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid, text) TO authenticated;
