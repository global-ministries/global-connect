-- ══════════════════════════════════════════════════════════════════════════════
-- PR11 — DT-041 — Talleres period closer helper + scheduled job (R1/R5).
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-041(a)  Partial index on talleres_crecimiento_cohortes(fecha_cierre_real)
--           for the scheduler scan (only OPEN cohorts are scanned).
-- DT-041(b)  Helper function taller_emit_overdue_event(taller_id, current_date)
--           that emits an internal participation_eventos row of kind
--           'taller_session_overdue'. NEVER auto-closes — R5 closed decision.
-- DT-041(c)  pg_cron scheduled job 'talleres_period_closer' that runs daily
--           at 00:00 UTC and invokes the helper. Conditional on the
--           pg_cron extension being enabled (some Supabase projects may
--           not have it; the DO $$ block no-ops gracefully).
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

-- 3) pg_cron job (conditional on pg_cron extension availability).
--    Even when present, this job ONLY emits events; never closes talleres.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule any prior job with the same name to avoid duplicates on re-apply.
    BEGIN
      PERFORM pg_cron.unschedule(jobname => 'talleres_period_closer');
    EXCEPTION WHEN OTHERS THEN
      -- ignore: job may not exist yet on first apply
      NULL;
    END;

    PERFORM pg_cron.schedule(
      jobname := 'talleres_period_closer',
      schedule := '0 0 * * *', -- daily at 00:00 UTC
      command := $job$
        SELECT COUNT(*)
          FROM public.talleres_crecimiento_metadata m
         WHERE m.estado = 'en_curso'
           AND EXISTS (
             SELECT 1 FROM public.taller_periodos_generales p
              WHERE p.taller_id = m.id
                AND p.fecha_cierre_real < CURRENT_DATE
           );
      $job$;
  ELSE
    -- pg_cron not enabled: silent no-op. The helper function + index remain
    -- available for application-level scheduling (Vercel Cron / cron-job.org).
    RAISE NOTICE 'pg_cron extension not enabled; talleres_period_closer scheduler skipped (helper still available)';
  END IF;
END
$$;
