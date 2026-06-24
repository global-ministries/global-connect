-- PR8 production safety gate for Casas Anfitrionas map rollout.
--
-- This file is safe-by-default for pre-apply dry-run evidence: executable
-- statements are read-only or dry-run unless the explicit post-apply assertion
-- GUC is enabled after an approved manual backfill.
-- Do not run a production apply until the dry-run inventory, staging smoke,
-- explicit approval, post-backfill verification, Supabase Security Advisor, and
-- Supabase Performance Advisor evidence are attached to the release record.
--
-- Execution note: if setup uses set_config(..., true) for JWT claims, run that
-- setup and this safety file inside one explicit BEGIN/COMMIT transaction. In
-- psql, include this file with \i inside that transaction. In Supabase SQL
-- Editor, paste this file's contents after the setup statements inside the same
-- transaction because SQL Editor does not support \i includes.

-- Gate 1: dry-run inventory before any production data change.
-- Copy-paste setup for psql / Supabase SQL Editor staging sessions inside an
-- explicit BEGIN/COMMIT transaction:
-- SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- SELECT set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true);
-- Replace the actor id with an approved admin/pastor auth id before running.
SELECT 'dry-run inventory: approved Casas eligible for audit snapshot' AS check_name,
       public.casas_map_backfill_approved_location_audit(
         nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
         p_dry_run => true
       ) AS result;

-- Gate 2: read-only rollout inventory, useful before and after staging smoke.
SELECT 'dry-run inventory: Casas map rollout counts' AS check_name,
       jsonb_build_object(
         'approved_active_casas_with_location', COUNT(*) FILTER (WHERE ca.aprobada = true AND ca.activa = true AND ca.direccion_id IS NOT NULL),
         'pending_casas_without_approved_location', COUNT(*) FILTER (WHERE ca.aprobada = false OR ca.direccion_id IS NULL),
         'groups_using_host_home', (SELECT COUNT(*) FROM public.grupos g WHERE g.activo = true AND g.eliminado = false AND g.casa_anfitriona_id IS NOT NULL),
         'groups_using_manual_address', (SELECT COUNT(*) FROM public.grupos g WHERE g.activo = true AND g.eliminado = false AND g.direccion_anfitrion_id IS NOT NULL)
       ) AS result
FROM public.casas_anfitrionas ca;

-- Gate 3: post-backfill verification after an explicitly approved manual apply.
-- Default pre-apply behavior is non-failing. Enable only after the approved
-- non-dry-run call:
-- SELECT set_config('casas_map.run_post_backfill_assertions', 'on', false);
SELECT 'post-backfill assertions mode' AS check_name,
       coalesce(nullif(current_setting('casas_map.run_post_backfill_assertions', true), ''), 'off') AS result;

DO $$
DECLARE
  v_run_post_backfill_assertions boolean := lower(coalesce(nullif(current_setting('casas_map.run_post_backfill_assertions', true), ''), 'off')) IN ('on', 'true', '1', 'yes');
  v_missing_count bigint := 0;
  v_duplicate_count bigint := 0;
BEGIN
  IF NOT v_run_post_backfill_assertions THEN
    RAISE NOTICE 'post-backfill assertions skipped; set casas_map.run_post_backfill_assertions = on after the approved manual apply to enforce them';
    RETURN;
  END IF;

  WITH eligible_approved_casas AS (
    SELECT ca.id
    FROM public.casas_anfitrionas ca
    WHERE ca.aprobada = true
      AND ca.activa = true
      AND ca.direccion_id IS NOT NULL
  ), missing_audit_snapshots AS (
    SELECT e.id
    FROM eligible_approved_casas e
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.casa_anfitriona_audit_events ae
      WHERE ae.casa_anfitriona_id = e.id
        AND ae.event_type = 'approved_location_backfill'
    )
  )
  SELECT COUNT(*)::bigint INTO v_missing_count FROM missing_audit_snapshots;

  WITH duplicate_backfill_events AS (
    SELECT ae.casa_anfitriona_id
    FROM public.casa_anfitriona_audit_events ae
    WHERE ae.event_type = 'approved_location_backfill'
    GROUP BY ae.casa_anfitriona_id
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(*)::bigint INTO v_duplicate_count FROM duplicate_backfill_events;

  RAISE NOTICE 'post-backfill verification: approved Casas without audit snapshot = %, duplicate approved-location backfill events = %', v_missing_count, v_duplicate_count;

  IF v_missing_count <> 0 THEN
    RAISE EXCEPTION 'post_backfill_missing_audit_snapshots: % approved active Casas with direccion_id lack approved_location_backfill events', v_missing_count;
  END IF;

  IF v_duplicate_count <> 0 THEN
    RAISE EXCEPTION 'post_backfill_duplicate_audit_snapshots: % Casas have duplicate approved_location_backfill events', v_duplicate_count;
  END IF;
END $$;

-- Manual apply is intentionally not executable from this safety file.
-- After staging smoke and explicit approval, an operator may run exactly this
-- reviewed call in a separate approved change window:
-- SELECT public.casas_map_backfill_approved_location_audit('<approved-admin-auth-id>'::uuid, p_dry_run => false, p_approval_reference => '<release-ticket-or-change-id>');
