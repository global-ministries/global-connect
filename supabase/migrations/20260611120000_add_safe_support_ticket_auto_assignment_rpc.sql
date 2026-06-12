-- Add best-effort auto-assignment RPC that cannot overwrite existing assignees.
-- noqa: insert-into

CREATE OR REPLACE FUNCTION public.auto_assign_support_ticket_if_unassigned(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
DECLARE
  v_actor_usuario_id uuid;
  v_updated_count integer := 0;
BEGIN
  v_actor_usuario_id := support_private.current_usuario_id();

  IF v_actor_usuario_id IS NULL OR NOT support_private.has_capability('support.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.support_tickets
  SET assignee_usuario_id = v_actor_usuario_id
  WHERE id = p_ticket_id
    AND assignee_usuario_id IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    INSERT INTO public.support_ticket_events (ticket_id, actor_usuario_id, action, target_type, target_id, metadata)
    VALUES (
      p_ticket_id,
      v_actor_usuario_id,
      'support.ticket.assigned',
      'support_ticket',
      p_ticket_id,
      jsonb_build_object('assigneeUsuarioId', v_actor_usuario_id, 'source', 'staff_reply_auto_assign')
    );
  END IF;

  RETURN v_updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_assign_support_ticket_if_unassigned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_assign_support_ticket_if_unassigned(uuid) TO authenticated;
