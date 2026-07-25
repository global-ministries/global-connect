-- ════════════════════════════════════════════════════════════════════
-- Drift fix: auth_has_pastoral_capability references non-existent objects
-- ════════════════════════════════════════════════════════════════════
--
-- Root cause:
--   * Original migration 20260722143357 referenced `public.platform_capability_grants`
--     (table that never existed — likely a rename that didn't propagate).
--   * Deployed state was further modified to reference `public.platform_grants`
--     and a non-existent helper `public.current_persona_id()`.
--   * Net effect: every RLS evaluation that calls the helper on
--     pastoral_one_on_one*, pastoral_triada*, pastoral_crisis_*
--     raises `relation does not exist`, blocking all pastoral data access.
--
-- Canonical pattern (proven working in 20260725120000 RLS policy):
--   * Grants live in `public.dream_team_capability_grants` (F2 table, reused by F4).
--   * Persona resolution: `usuarios.id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())`.
--   * SECURITY DEFINER + check `revoked_at IS NULL`.
--
-- This migration is additive: it `CREATE OR REPLACE FUNCTION`s the helper with the
-- correct body. No destructive DDL, no RLS policy rewrites, no byte-identity breakage
-- of any prior migration file.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auth_has_pastoral_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      AND g.capability_key = p_capability_key
      AND g.revoked_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.auth_has_pastoral_capability(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_pastoral_capability(text) TO authenticated, service_role;
