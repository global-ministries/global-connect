-- Allow authenticated reporters to append audit events for their own committed support actions.
-- Production safety: additive grants/policies only; no data mutation or destructive changes.

GRANT INSERT ON public.support_ticket_events TO authenticated;

CREATE POLICY support_events_reporter_insert ON public.support_ticket_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_usuario_id = support_private.current_usuario_id()
    AND action IN ('support.ticket.created', 'support.reporter_message.created')
    AND target_type IN ('support_ticket', 'support_ticket_message')
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND st.reporter_usuario_id = support_private.current_usuario_id()
    )
  );
