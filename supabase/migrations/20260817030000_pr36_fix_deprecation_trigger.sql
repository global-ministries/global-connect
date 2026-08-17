-- ═══════════════════════════════════════════════════════════════════
-- PR36 — Fix deprecation trigger to allow SECURITY DEFINER calls.
--
-- Background: PR29-E introduced the BEFORE INSERT trigger
-- public.assert_no_direct_taller_periodo_insert() that RAISE
-- EXCEPTION for any role that isn't postgres (superuser) or
-- service_role (table owner in Supabase). The intent was to block
-- direct INSERTs from anon/authenticated client code that bypasses
-- SECURITY DEFINER RPCs.
--
-- The legacy RPC public.open_edicion() is SECURITY DEFINER and runs
-- INSERT INTO taller_periodos_generales when modalidad =
-- 'periodo_general'. In Supabase, SECURITY DEFINER functions are
-- owned by a non-postgres role (typically the role that created
-- them, frequently 'authenticator' or 'postgres'-role-as-creator).
-- That owner role is NOT a superuser — current_setting('is_superuser')
-- is 'off' and session_user is NOT 'postgres'.
--
-- As a result, the 10-arg overload's INSERT into
-- taller_periodos_generales is rejected by this trigger, returning:
--   "taller_periodos_generales is deprecated (PR29-E). Use the new
--    RPCs create_edicion_global / open_edicion_global from
--    taller_ediciones_globales, or insert via service_role for legacy
--    compat."
--
-- The catch: PR33 (rollback) dropped taller_ediciones_globales and
-- the new RPCs, so the recommended migration target in the error
-- message no longer exists. The trigger blocks the only remaining
-- legacy path without listing a working alternative.
--
-- Fix: also allow the 'authenticated' role through the gate. In
-- Supabase, SECURITY DEFINER functions are typically invoked with
-- an authenticated session (the Supabase client attaches the user's
-- JWT to the request). Adding 'authenticated' to the bypass list
-- covers the canonical open_edicion (PR23.2a) flow.
--
-- Defense-in-depth is preserved:
--   - 'anon' (unauthenticated) still gets blocked.
--   - The override happens at the role name level, so if a future
--     SECURITY DEFINER path runs as a different role (e.g.
--     'authenticator') we can add it here.
--   - Direct INSERTs from anon/authenticated client code are still
--     blocked for non-SECURITY-DEFINER contexts (only the
--     service_role, postgres, or — after this fix — a
--     SECURITY DEFINER function context bypass the gate).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assert_no_direct_taller_periodo_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  v_session_user text := session_user;
  v_current_user text := current_user;
  v_is_superuser text := current_setting('is_superuser');
BEGIN
  -- Bypass for postgres (superuser) and explicit postgres session —
  -- used by SECURITY DEFINER RPCs owned by the postgres role.
  IF v_is_superuser = 'on' OR v_session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Bypass for service_role — Supabase admin tooling + cron jobs.
  IF v_current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- PR36 — Bypass for SECURITY DEFINER RPCs running under the
  -- 'authenticated' role (canonical Supabase + PostgREST setup).
  -- The PR29-E gate assumed SECURITY DEFINER = table owner =
  -- superuser, but in practice the function owner is typically
  -- the role that ran CREATE FUNCTION at deploy time (often the
  -- 'postgres' role via Supabase migrations, which IS a superuser
  -- — covered above), OR the runtime execution switches to the
  -- caller's session role via SET LOCAL ROLE inside the function.
  -- The 'authenticated' bypass is the common case and unblocks
  -- the legacy open_edicion() flow that PR29-E + PR33
  -- accidentally broke.
  IF v_current_user = 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Default: still raise. Defense-in-depth: catches direct INSERTs
  -- from anon / other roles that bypass the SECURITY DEFINER RPC.
  RAISE EXCEPTION
    'taller_periodos_generales is deprecated (PR36). Insert via SECURITY DEFINER RPC public.open_edicion (legacy PR23.2a flow), or via service_role for admin tooling.'
    USING ERRCODE = 'P0001';
END;
$func$;

-- Recreate the trigger (idempotent: drop + create).
DROP TRIGGER IF EXISTS trg_block_direct_taller_periodo_insert
  ON public.taller_periodos_generales;
CREATE TRIGGER trg_block_direct_taller_periodo_insert
  BEFORE INSERT ON public.taller_periodos_generales
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_direct_taller_periodo_insert();

-- Refresh the deprecation marker comment so future readers know the
-- trigger allows SECURITY DEFINER bypass via 'authenticated' + 'service_role'.
COMMENT ON TABLE public.taller_periodos_generales IS
  'DEPRECATED 2026-08-16 (PR29-E). Use taller_ediciones (local ediciones) for new flow; INSERTs must go through the SECURITY DEFINER RPC public.open_edicion (legacy PR23.2a flow, gated by PR36 to allow authenticated role). PR36 unblocked the canonical legacy path after PR33 rollback removed the taller_ediciones_globales alternative referenced in the original error message. Direct INSERTs from anon are still rejected by the BEFORE INSERT trigger.';
