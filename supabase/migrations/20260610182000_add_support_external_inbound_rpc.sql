-- Add atomic external inbound support update persistence.
-- Production safety: additive service-role RPC only; no data mutation outside RPC execution.
-- noqa: insert-into

CREATE OR REPLACE FUNCTION public.record_support_external_inbound_update(
  p_ticket_id uuid,
  p_author_usuario_id uuid,
  p_message_body text,
  p_idempotency_key text
)
RETURNS TABLE(event_id uuid, message_id uuid, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_event_id uuid;
  v_message_id uuid;
BEGIN
  IF nullif(btrim(p_message_body), '') IS NULL THEN
    RAISE EXCEPTION 'invalid external support update';
  END IF;

  INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, idempotency_key)
  VALUES (p_ticket_id, p_author_usuario_id, 'external.update.received', 'support_external_update', p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT ste.id INTO v_event_id
    FROM public.support_ticket_events ste
    WHERE ste.idempotency_key = p_idempotency_key
      AND ste.ticket_id = p_ticket_id
      AND ste.action = 'external.update.received'
      AND ste.target_type = 'support_external_update';

    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'idempotency key conflict for different support event';
    END IF;

    RETURN QUERY SELECT v_event_id, NULL::uuid, true;
    RETURN;
  END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, author_usuario_id, body, is_internal)
  VALUES (p_ticket_id, p_author_usuario_id, p_message_body, false)
  RETURNING id INTO v_message_id;

  RETURN QUERY SELECT v_event_id, v_message_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text) TO service_role;
