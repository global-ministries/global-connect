-- ══════════════════════════════════════════════════════════════════════════════
-- PR11.5 — DT-046 — Widen operating_core_participation_eventos.kind CHECK
--                  to include 'taller_session_overdue' (scheduler-detected).
--
-- The original CHECK (added in PR9) covered the 5 taller_* lifecycle kinds
-- (cohort_started, session_attended, session_missed, completion_recorded,
-- completion_failed). PR11's taller_emit_overdue_event emits a 6th kind
-- ('taller_session_overdue') when the pg_cron scheduler detects an overdue
-- taller. The CHECK must allow it.
--
-- Migration strategy: DROP the existing constraint by its auto-generated
-- name and ADD a new constraint with the same name + the extra kind. This
-- is a destructive DDL exception (one-time, additive-on-data) justified by
-- the fact that the new constraint is a strict superset of the old one —
-- no existing row can fail validation after the swap.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- The original constraint was auto-named by Postgres when the table was
  -- created in PR9. We need to find its actual name (the migration was
  -- applied via supabase_global_apply_migration; the name follows
  -- the convention {table}_{column}_check).
  SELECT conname INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.operating_core_participation_eventos'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%kind%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.operating_core_participation_eventos DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END
$$;

ALTER TABLE public.operating_core_participation_eventos
  ADD CONSTRAINT operating_core_participation_eventos_kind_check
  CHECK (kind IN (
    -- 11 F3 originals
    'visitor_capture', 'registration', 'cancellation', 'check_in', 'check_out',
    'attendance', 'attendance_update', 'service_assignment', 'requirement_update',
    'transition', 'document_received',
    -- 5 F5 lifecycle kinds (PR9)
    'taller_cohort_started', 'taller_session_attended', 'taller_session_missed',
    'taller_completion_recorded', 'taller_completion_failed',
    -- 1 F5 scheduler-detected kind (PR11)
    'taller_session_overdue'
  ));
