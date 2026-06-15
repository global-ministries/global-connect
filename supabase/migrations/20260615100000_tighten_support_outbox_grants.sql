-- Forward cleanup after staging verification of support outbox grants.
-- Keep the service role limited to the DML needed by the outbox worker.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.support_event_outbox FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_event_outbox TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_events FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_event_outbox FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_event_outbox FROM authenticated;

DROP POLICY IF EXISTS support_events_reporter_insert ON public.support_ticket_events;
