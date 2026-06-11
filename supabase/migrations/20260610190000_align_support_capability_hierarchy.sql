-- Align support staff capability hierarchy for RLS and audited RPC gates.
-- Production safety: replaces only the private helper used by existing policies/RPCs; no data mutation.

CREATE OR REPLACE FUNCTION support_private.has_capability(required_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.support_user_capabilities suc ON suc.usuario_id = u.id
    WHERE u.auth_id = (select auth.uid())
      AND suc.revoked_at IS NULL
      AND (
        suc.capability = required_capability
        OR (suc.capability = 'support.reply' AND required_capability IN ('support.view', 'support.reply'))
        OR (suc.capability = 'support.manage' AND required_capability IN ('support.view', 'support.reply', 'support.manage'))
      )
  )
$$;

REVOKE ALL ON FUNCTION support_private.has_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_private.has_capability(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION support_private.has_support_configuration_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'support_private'
AS $$
  SELECT support_private.has_capability('support.manage')
    AND EXISTS (
      SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = support_private.current_usuario_id()
        AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
    )
$$;

REVOKE ALL ON FUNCTION support_private.has_support_configuration_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_private.has_support_configuration_access() TO authenticated, service_role;

DROP POLICY IF EXISTS support_capabilities_select ON public.support_user_capabilities;
CREATE POLICY support_capabilities_select ON public.support_user_capabilities
  FOR SELECT TO authenticated
  USING (usuario_id = support_private.current_usuario_id() OR support_private.has_support_configuration_access());

DROP POLICY IF EXISTS support_events_select ON public.support_ticket_events;
CREATE POLICY support_events_select ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (
    (
      ticket_id IS NULL
      AND target_type = 'support_user_capability'
      AND support_private.has_support_configuration_access()
    )
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND (st.reporter_usuario_id = support_private.current_usuario_id() OR support_private.has_capability('support.view'))
    )
  );
