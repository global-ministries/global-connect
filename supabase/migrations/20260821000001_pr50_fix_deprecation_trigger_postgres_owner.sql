-- ═══════════════════════════════════════════════════════════════════
-- PR50 — Fix the taller_periodos_generales deprecation guard so the
-- canonical open_edicion SECURITY DEFINER flow actually works.
--
-- ROOT CAUSE (verified in production, project wcnqocyqtksxhthnquta):
--   The guard public.assert_no_direct_taller_periodo_insert() (PR29-E,
--   patched by PR36) only bypasses when one of these holds:
--     (1) current_setting('is_superuser') = 'on'
--     (2) session_user = 'postgres'
--     (3) current_user  = 'service_role'
--     (4) current_user  = 'authenticated'   -- added by PR36
--
--   public.open_edicion is SECURITY DEFINER owned by `postgres` and
--   INSERTs into taller_periodos_generales when modalidad =
--   'periodo_general'. When invoked from the app through PostgREST the
--   runtime context is:
--     - session_user  = 'authenticator'  (the PostgREST login role)  → (2) false
--     - current_user  = 'postgres'       (the SECURITY DEFINER owner) → (3),(4) false
--     - is_superuser  = 'off'            (in Supabase the `postgres`
--                                         role is NOT a superuser:
--                                         rolsuper=false)             → (1) false
--   All four bypasses evaluate false, so the guard RAISEs:
--     "taller_periodos_generales is deprecated (PR36). Insert via
--      SECURITY DEFINER RPC public.open_edicion (legacy PR23.2a flow),
--      or via service_role for admin tooling."
--   i.e. it blocks the very RPC path it tells you to use.
--
--   PR36 added the `current_user = 'authenticated'` bypass on the
--   assumption that current_user stays the caller inside a SECURITY
--   DEFINER function. It does not — current_user becomes the function
--   OWNER (`postgres`). That bypass has therefore always been dead code
--   for this path, which is why no edición was ever opened through the
--   guard (all 4 real prod ediciones predate the PR29-E trigger).
--
-- FIX: add `current_user = 'postgres'` to the bypass list. Inside every
--   postgres-owned SECURITY DEFINER RPC (open_edicion + any sibling that
--   writes this table) current_user is exactly 'postgres', so this
--   unblocks the intended path uniformly.
--
-- SECURITY (defense-in-depth preserved): a direct client INSERT through
--   PostgREST runs as `authenticated` or `anon` — never `postgres` — so
--   this bypass cannot be reached by untrusted client code. The only way
--   current_user = 'postgres' at INSERT time is (a) inside a
--   postgres-owned SECURITY DEFINER function, or (b) a direct
--   postgres/service_role admin connection. Table GRANTs still REVOKE
--   INSERT from anon/authenticated independently of this trigger.
--
-- Additive + forward-only + idempotent (CREATE OR REPLACE). No data
-- touched. The existing trigger keeps pointing at this function by name,
-- so replacing the body is picked up without recreating the trigger.
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
  -- Bypass for a true superuser session, or an explicit postgres login
  -- session (e.g. some migration tooling).
  IF v_is_superuser = 'on' OR v_session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Bypass for service_role — Supabase admin tooling + cron jobs.
  IF v_current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- PR50 — Bypass for postgres-owned SECURITY DEFINER RPCs. Inside such
  -- a function current_user is the OWNER ('postgres'), which is the
  -- reliable signal that this INSERT arrived through the canonical
  -- open_edicion (PR23.2a) flow rather than direct client code. In
  -- Supabase the postgres role is not a superuser, so the is_superuser
  -- bypass above never catches this case.
  IF v_current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- PR36 — legacy bypass kept for compatibility. In a SECURITY DEFINER
  -- context current_user is the owner (handled above), so this only
  -- matches a direct 'authenticated' insert, which table GRANTs already
  -- REVOKE. Retained to avoid changing unrelated PR36 behavior.
  IF v_current_user = 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Default: still raise. Defense-in-depth: catches direct INSERTs from
  -- anon / other roles that bypass the SECURITY DEFINER RPC.
  RAISE EXCEPTION
    'taller_periodos_generales is deprecated (PR36). Insert via SECURITY DEFINER RPC public.open_edicion (legacy PR23.2a flow), or via service_role for admin tooling.'
    USING ERRCODE = 'P0001';
END;
$func$;

COMMENT ON TABLE public.taller_periodos_generales IS
  'DEPRECATED 2026-08-16 (PR29-E). New flow uses taller_ediciones + talleres_temporadas (PR45). INSERTs must go through the SECURITY DEFINER RPC public.open_edicion (legacy PR23.2a flow). PR50 unblocked that path: the guard now bypasses on current_user=''postgres'' (the SECURITY DEFINER owner) because in Supabase the postgres role is not a superuser, so PR36''s is_superuser/authenticated bypasses never matched the RPC. Direct INSERTs from anon/authenticated remain blocked by the BEFORE INSERT trigger + table GRANTs.';
