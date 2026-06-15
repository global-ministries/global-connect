-- Add support mutation RPCs that write audit rows and durable outbox rows in the
-- same database transaction. These functions are additive and leave existing RPCs
-- in place for compatibility.
-- noqa: insert-into

CREATE OR REPLACE FUNCTION public.create_support_ticket_with_outbox(
  p_subject text,
  p_description text,
  p_category text,
  p_current_route text DEFAULT NULL,
  p_browser_name text DEFAULT NULL,
  p_os_name text DEFAULT NULL,
  p_viewport text DEFAULT NULL,
  p_app_build_version text DEFAULT NULL,
  p_sentry_event_id text DEFAULT NULL,
  p_diagnostics_consent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_ticket_id uuid;
  v_ticket_number bigint;
  v_event_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.support_tickets (
    reporter_usuario_id,
    status,
    title,
    description,
    category,
    severity,
    current_route,
    browser_name,
    os_name,
    viewport,
    app_build_version,
    sentry_event_id,
    diagnostics_consent
  )
  VALUES (
    v_actor_usuario_id,
    'received',
    p_subject,
    p_description,
    p_category,
    'normal',
    p_current_route,
    p_browser_name,
    p_os_name,
    p_viewport,
    p_app_build_version,
    p_sentry_event_id,
    p_diagnostics_consent
  )
  RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (v_ticket_id, v_actor_usuario_id, 'support.ticket.created', 'support_ticket', v_ticket_id, jsonb_build_object('source', 'reporter'))
  RETURNING id INTO v_event_id;

  INSERT INTO public.support_event_outbox (ticket_id, event_type, event_key, payload)
  VALUES (
    v_ticket_id,
    'support/ticket.created',
    'support:' || v_event_id::text,
    jsonb_build_object(
      'eventId', v_event_id::text,
      'ticketId', v_ticket_id::text,
      'actorUserId', v_actor_usuario_id::text
    )
  );

  RETURN jsonb_build_object(
    'ticketId', v_ticket_id::text,
    'ticketNumber', v_ticket_number,
    'eventId', v_event_id::text,
    'actorUserId', v_actor_usuario_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket_with_outbox(text, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket_with_outbox(text, text, text, text, text, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_support_ticket_message_with_outbox(p_ticket_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_message_id uuid;
  v_event_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF nullif(btrim(p_body), '') IS NULL THEN
    RAISE EXCEPTION 'invalid support ticket message';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = p_ticket_id
      AND st.reporter_usuario_id = v_actor_usuario_id
  ) THEN
    RAISE EXCEPTION 'support ticket not found';
  END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, author_usuario_id, body, is_internal)
  VALUES (p_ticket_id, v_actor_usuario_id, p_body, false)
  RETURNING id INTO v_message_id;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (p_ticket_id, v_actor_usuario_id, 'support.reporter_message.created', 'support_ticket_message', v_message_id, jsonb_build_object('source', 'reporter'))
  RETURNING id INTO v_event_id;

  INSERT INTO public.support_event_outbox (ticket_id, event_type, event_key, payload)
  VALUES (
    p_ticket_id,
    'support/ticket.message.created',
    'support:' || v_event_id::text,
    jsonb_build_object(
      'eventId', v_event_id::text,
      'ticketId', p_ticket_id::text,
      'messageId', v_message_id::text,
      'actorUserId', v_actor_usuario_id::text
    )
  );

  RETURN jsonb_build_object(
    'messageId', v_message_id::text,
    'eventId', v_event_id::text,
    'actorUserId', v_actor_usuario_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket_message_with_outbox(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket_message_with_outbox(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_staff_support_ticket_reply_with_outbox(p_ticket_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_message_id uuid;
  v_event_id uuid;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.reply') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF nullif(btrim(p_body), '') IS NULL THEN
    RAISE EXCEPTION 'invalid support ticket reply';
  END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, author_usuario_id, body, is_internal)
  VALUES (p_ticket_id, v_actor_usuario_id, p_body, false)
  RETURNING id INTO v_message_id;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
  VALUES (p_ticket_id, v_actor_usuario_id, 'support.staff_reply.created', 'support_ticket_message', v_message_id, '{}'::jsonb)
  RETURNING id INTO v_event_id;

  INSERT INTO public.support_event_outbox (ticket_id, event_type, event_key, payload)
  VALUES (
    p_ticket_id,
    'support/ticket.message.created',
    'support:' || v_event_id::text,
    jsonb_build_object(
      'eventId', v_event_id::text,
      'ticketId', p_ticket_id::text,
      'messageId', v_message_id::text,
      'actorUserId', v_actor_usuario_id::text
    )
  );

  RETURN jsonb_build_object(
    'messageId', v_message_id::text,
    'eventId', v_event_id::text,
    'actorUserId', v_actor_usuario_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply_with_outbox(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_support_ticket_reply_with_outbox(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status_with_outbox(p_ticket_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_event_id uuid;
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
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.support_event_outbox (ticket_id, event_type, event_key, payload)
  VALUES (
    p_ticket_id,
    'support/ticket.status.changed',
    'support:' || v_event_id::text,
    jsonb_build_object(
      'eventId', v_event_id::text,
      'ticketId', p_ticket_id::text,
      'actorUserId', v_actor_usuario_id::text
    )
  );

  RETURN jsonb_build_object(
    'eventId', v_event_id::text,
    'actorUserId', v_actor_usuario_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_support_ticket_status_with_outbox(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_status_with_outbox(uuid, text) TO authenticated;
