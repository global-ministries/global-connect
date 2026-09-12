-- ══════════════════════════════════════════════════════════════════════════════
-- PR11 — DT-041 — Talleres period closer helper + scheduled job (R1/R5).
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-041(a)  Partial index on talleres_crecimiento_cohortes(fecha_cierre_real)
--           for the scheduler scan (only OPEN cohorts are scanned).
-- DT-041(b)  Helper function taller_emit_overdue_event(taller_id, current_date)
--           that emits an internal participation_eventos row of kind
--           'taller_session_overdue'. NEVER auto-closes — R5 closed decision.
-- DT-041(c)  REMOVED AFTER THE FACT (2026-09-12). See section 3 below.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Index for the scheduler scan. Plain (no partial predicate):
--    predicates with CURRENT_DATE are not IMMUTABLE in Postgres and
--    would fail index creation. The scheduler query still benefits from
--    this index on (fecha_cierre_real).
CREATE INDEX IF NOT EXISTS idx_taller_periodos_generales_cierre_real
  ON public.taller_periodos_generales (fecha_cierre_real);

-- 2) Helper function: emits a taller_session_overdue participation event.
--    Doesn't close anything; just signals the operator.
CREATE OR REPLACE FUNCTION public.taller_emit_overdue_event(
  p_taller_id uuid,
  p_current_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.operating_core_participation_eventos (
    kind, subject_id, occurred_at, actor_persona_id, capture_source, experience,
    status, sensitivity, metadata
  )
  SELECT
    'taller_session_overdue',
    p_taller_id,
    now(),
    p_taller_id, -- self-reference: the taller (subject) triggers the audit
    'system',
    'talleres_crecimiento',
    'recorded',
    'internal',
    jsonb_build_object(
      'current_date', p_current_date,
      'detected_at', now()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.taller_emit_overdue_event(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.taller_emit_overdue_event(uuid, date) TO service_role;

-- 3) The pg_cron job — REMOVED AFTER THE FACT (2026-09-12).
--
--    What was wrong, in the order it mattered:
--
--    a) The block could not execute. The call to `schedule(...)` was missing
--       its closing parenthesis — the `$job$` dollar-quote was followed
--       straight by `;` — so the DO block was a syntax error and this whole
--       migration aborted. Every migration after it was unreachable by a
--       `db reset`.
--    b) Even balanced, it called `pg_cron.schedule`. pg_cron installs its
--       functions in schema `cron`, so it would have failed with
--       `schema "pg_cron" does not exist`.
--    c) The command it scheduled closed nothing. It was a `SELECT COUNT(*)`:
--       it counted the ediciones whose periodo had lapsed, discarded the
--       number and returned. No UPDATE, no state transition, no event — and
--       it never called `taller_emit_overdue_event` either. The real closing
--       logic was never implemented, and inventing it here is a separate
--       decision that has not been made.
--    d) It read `talleres_crecimiento_metadata`, renamed away to
--       `taller_ediciones`, so the copy that runs in production errors every
--       night.
--
--    The job that exists in production was scheduled by hand with the same
--    command; 20260912140100 unschedules it. The block is removed here rather
--    than repaired so that a `db reset` does not schedule it straight back.
--
--    The helper function and the index above stay: they are what an
--    application-level scheduler (Vercel Cron / cron-job.org) would call.
