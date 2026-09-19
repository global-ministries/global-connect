-- talleres_role_capability_map had row level security DISABLED in production
-- (the only public table flagged rls_disabled_in_public by the Supabase
-- advisor) while anon and authenticated held INSERT/UPDATE/DELETE on it.
-- The map decides which talleres capabilities a Dream Team role receives:
-- sync_talleres_grants_on_servicio_change -> assign_talleres_capabilities_for_role
-- grant whatever the map says. With the public anon key anyone could add
-- 'coordinador -> admin.manage' (escalation) or delete every row (no one
-- receives capabilities again). Verified in production inside a rolled-back
-- transaction on 2026-09-18.
--
-- Staging already had RLS enabled on this table by a hand-applied change that
-- never reached the repository or production.
--
-- Nothing in the app reads the table (only lib/supabase/database.types.ts and
-- a comment). Both functions that read it are SECURITY DEFINER owned by
-- postgres, which has BYPASSRLS, so the auto-grant path is unaffected.
--
-- No policies are created on purpose: only the owner reads or writes the map.
-- Rollback (restores the vulnerable state; do not use):
--   alter table public.talleres_role_capability_map disable row level security;
--   grant all on table public.talleres_role_capability_map to anon, authenticated;

alter table public.talleres_role_capability_map enable row level security;

revoke all on table public.talleres_role_capability_map from anon, authenticated;
