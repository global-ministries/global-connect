-- Require audited RPCs for support staff ticket mutations.
-- Production safety: permission and RLS policy changes only; no data mutation.

REVOKE UPDATE ON public.support_tickets FROM authenticated;

DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;

DROP POLICY IF EXISTS support_messages_insert ON public.support_ticket_messages;

CREATE POLICY support_messages_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_usuario_id = support_private.current_usuario_id()
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND st.reporter_usuario_id = support_private.current_usuario_id()
    )
  );
