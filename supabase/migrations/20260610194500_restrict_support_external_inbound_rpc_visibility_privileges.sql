-- Restrict the external inbound support RPC to the service role only.

REVOKE ALL ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text, boolean) TO service_role;
