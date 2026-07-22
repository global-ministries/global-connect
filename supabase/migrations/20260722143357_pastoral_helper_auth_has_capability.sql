-- ════════════════════════════════════════════════════════════════════
-- W02 — DT-007 — Pastoral helper auth_has_pastoral_capability
-- Follows the auth_has_dream_team_capability pattern (F2 §4.3) and
-- auth_has_operating_core_capability pattern (F3 S03).
-- SECURITY DEFINER binds identity server-side via auth.uid().
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auth_has_pastoral_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_capability_grants
    WHERE persona_id = auth.uid()
      AND capability_key = p_capability_key
      AND revoked_at IS NULL
  )
$$;

-- Restrict execution to service_role (RLS policies evaluate it internally).
REVOKE ALL ON FUNCTION public.auth_has_pastoral_capability(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_pastoral_capability(text) TO authenticated, service_role;
