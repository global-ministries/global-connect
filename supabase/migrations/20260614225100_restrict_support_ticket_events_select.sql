-- Restrict direct support event reads to support staff only.
-- Reporter-facing ticket detail uses tickets/messages/attachments and must not rely
-- on direct support_ticket_events visibility.

REVOKE SELECT ON TABLE public.support_ticket_events FROM anon;

DROP POLICY IF EXISTS support_events_select ON public.support_ticket_events;
CREATE POLICY support_events_select ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (support_private.has_capability('support.view'));
