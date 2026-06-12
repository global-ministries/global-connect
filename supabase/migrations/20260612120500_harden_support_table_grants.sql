-- Harden support table privileges after production verification found broad default grants.
-- Production safety: privilege hardening only; no data mutation, no schema mutation, and no RLS policy changes.

REVOKE ALL PRIVILEGES ON TABLE public.support_user_capabilities FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.support_tickets FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_messages FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_attachments FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_events FROM anon;

REVOKE ALL PRIVILEGES ON TABLE public.support_user_capabilities FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_tickets FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_messages FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_attachments FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_ticket_events FROM authenticated;

GRANT SELECT ON TABLE public.support_user_capabilities TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_ticket_messages TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_ticket_attachments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_ticket_events TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.support_user_capabilities TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_tickets TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_ticket_messages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_ticket_attachments TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_ticket_events TO service_role;

DO $$
DECLARE
  support_ticket_number_sequence text;
BEGIN
  SELECT format('%I.%I', n.nspname, c.relname)
  INTO support_ticket_number_sequence
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = to_regclass('public.support_tickets_ticket_number_seq')
    AND c.relkind = 'S';

  IF support_ticket_number_sequence IS NOT NULL THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM anon', support_ticket_number_sequence);
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM authenticated', support_ticket_number_sequence);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', support_ticket_number_sequence);
    EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE %s TO service_role', support_ticket_number_sequence);
  END IF;
END $$;
