ALTER TABLE public.support_event_outbox
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.support_event_outbox
  DROP CONSTRAINT IF EXISTS support_event_outbox_status_check;

ALTER TABLE public.support_event_outbox
  ADD CONSTRAINT support_event_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'dispatched', 'failed'));

CREATE INDEX IF NOT EXISTS support_event_outbox_processing_idx
  ON public.support_event_outbox (locked_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.claim_support_event_outbox_batch(
  p_limit integer DEFAULT 10,
  p_lock_timeout interval DEFAULT interval '5 minutes'
)
RETURNS SETOF public.support_event_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.support_event_outbox
    WHERE (
      status = 'pending'
      AND available_at <= timezone('utc', now())
    ) OR (
      status = 'processing'
      AND locked_at < timezone('utc', now()) - p_lock_timeout
    )
    ORDER BY created_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.support_event_outbox outbox
  SET status = 'processing',
      locked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
$$;

REVOKE ALL ON FUNCTION public.claim_support_event_outbox_batch(integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_support_event_outbox_batch(integer, interval) FROM anon;
REVOKE ALL ON FUNCTION public.claim_support_event_outbox_batch(integer, interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_support_event_outbox_batch(integer, interval) TO service_role;
