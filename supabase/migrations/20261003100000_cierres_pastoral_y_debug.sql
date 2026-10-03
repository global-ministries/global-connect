-- Close two tables that visitors and any signed-in person could reach
-- (security phase 3, batch 0).
--
-- What was wrong:
--   * pastoral_role_capability_map (created by 20260727000000) has row level
--     security disabled while anon and authenticated hold every table privilege
--     on it. This is the state on staging; production does not have the table
--     yet (the pastoral migrations were never applied there). The map decides
--     which pastoral capabilities a system role receives: the trigger
--     trg_sync_pastoral_grants_on_role_change on usuario_roles calls
--     assign_pastoral_capabilities_for_role, which copies the map into
--     dream_team_capability_grants. With the public anon key anybody could map
--     'lider' to pastoral.admin.manage (escalation on the next role change) or
--     empty the map. It is the hole 20260918130000 closed on the sibling table
--     talleres_role_capability_map.
--   * debug_toolbar_whitelist has row level security on, but its only policy,
--     select_whitelist, lets every role (PUBLIC) read every row, and anon holds
--     every table privilege. Any visitor could list the internal person ids that
--     see the debug toolbar (staging and production).
--
-- What changes:
--   1. pastoral_role_capability_map: row level security on, every privilege of
--      anon and authenticated revoked, no policy (only the owner reads or writes
--      the map). postgres and service_role keep theirs. The block is guarded by
--      to_regclass, so the file applies cleanly where the table does not exist:
--      it does nothing there. Run the block again after the pastoral migrations
--      are applied on such a database (it is idempotent): 20260727000000 creates
--      the table without row level security, and after 20261003110000 a new
--      table still gives every privilege to authenticated.
--   2. debug_toolbar_whitelist: row level security stated on; every privilege of
--      anon revoked; authenticated keeps SELECT only (its write privileges did
--      nothing under row level security, but TRUNCATE ignores row level
--      security); the open policy is replaced by a SELECT policy for
--      authenticated limited to admins and pastors, es_admin_o_pastor(auth.uid()),
--      the session-bound helper that the dg_directores_etapa policy already uses.
--      The table and its open policy were made by hand (no migration creates
--      them), so another database could name that policy differently: the last
--      block raises, and nothing is applied, when any policy other than the new
--      one is left on the table. The statements are idempotent.
--
-- Who reads these tables (inventory on staging, 2026-10-02: function bodies,
-- views, policies and the app):
--   * pastoral_role_capability_map: only assign_pastoral_capabilities_for_role
--     and sync_pastoral_grants_on_role_change, both definer functions owned by
--     postgres. The owner is not subject to row level security (it is not
--     forced on the table) and postgres has BYPASSRLS, so the auto-grant path
--     reads the map as before. No view or policy uses the table; the app never
--     reads it (only lib/supabase/database.types.ts names it).
--   * debug_toolbar_whitelist: only puede_ver_debug_toolbar(uuid), a definer
--     function owned by postgres, so it keeps answering as before. No view or
--     policy uses the table; the app never reads it directly.
--   * talleres_role_capability_map was checked as well: row level security on
--     and no privilege for anon or authenticated on staging (and on production,
--     since 20260918130000), so it is not touched.
--
-- Blast radius: a visitor that selects from either table now gets 42501
-- (permission denied) instead of rows; a signed-in person who is not an admin
-- or a pastor sees no rows of debug_toolbar_whitelist and gets 42501 on the
-- pastoral map. Nothing in the app does either. Admins and pastors still read
-- the whitelist, and every definer function above behaves as before.
-- supabase/tests/fase3-cierres-y-privilegios.test.sql pins all of this.
--
-- Rollback (restores the open state; do not use): disable row level security on
-- pastoral_role_capability_map, give anon and authenticated back every table
-- privilege on both tables, drop debug_toolbar_whitelist_select_admin_pastor
-- and recreate select_whitelist as a SELECT policy for every role whose qual is
-- the constant true.

DO $cierre_pastoral$
BEGIN
  IF to_regclass('public.pastoral_role_capability_map') IS NOT NULL THEN
    ALTER TABLE public.pastoral_role_capability_map ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.pastoral_role_capability_map FROM anon, authenticated;
  END IF;
END
$cierre_pastoral$;

ALTER TABLE public.debug_toolbar_whitelist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.debug_toolbar_whitelist FROM anon, authenticated;
GRANT SELECT ON TABLE public.debug_toolbar_whitelist TO authenticated;

DROP POLICY IF EXISTS select_whitelist ON public.debug_toolbar_whitelist;
DROP POLICY IF EXISTS debug_toolbar_whitelist_select_admin_pastor ON public.debug_toolbar_whitelist;
CREATE POLICY debug_toolbar_whitelist_select_admin_pastor
  ON public.debug_toolbar_whitelist
  FOR SELECT
  TO authenticated
  USING (public.es_admin_o_pastor((SELECT auth.uid())));

DO $cierre_debug_check$
DECLARE
  v_other text;
BEGIN
  SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO v_other
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.debug_toolbar_whitelist'::regclass
     AND pol.polname <> 'debug_toolbar_whitelist_select_admin_pastor';
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'cierres_pastoral_y_debug: debug_toolbar_whitelist keeps other policies (%); drop them or adapt this file', v_other;
  END IF;
END
$cierre_debug_check$;
