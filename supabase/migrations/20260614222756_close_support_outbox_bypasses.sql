-- Close legacy/direct support mutation paths now that support mutations write to
-- support_event_outbox atomically through dedicated RPCs.
-- Production safety: privilege/RLS policy hardening only; no data mutation.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_tickets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_tickets FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_messages FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_ticket_events FROM authenticated;

REVOKE UPDATE, DELETE ON TABLE public.support_ticket_attachments FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.support_ticket_attachments FROM authenticated;

-- Keep authenticated INSERT on support_ticket_attachments: the attachment intent
-- route inserts pending_upload metadata using the caller client so RLS verifies
-- the reporter/staff relationship before issuing the R2 upload URL. Finalization
-- updates already use the admin client and remain unavailable to authenticated.

DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
DROP POLICY IF EXISTS support_messages_insert ON public.support_ticket_messages;

REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_staff_support_ticket_reply(uuid, text) FROM service_role;

REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid, text) FROM service_role;
