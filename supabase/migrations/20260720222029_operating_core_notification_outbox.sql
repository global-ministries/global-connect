-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Notification Outbox
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TYPE operating_core_notification_outbox_status AS ENUM (
  'pending',
  'processing',
  'dispatched',
  'failed'
);

CREATE TABLE operating_core_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Routing metadata
  kind text NOT NULL,
  subject_id uuid,
  payload jsonb NOT NULL,
  -- Recipient
  target_kind text NOT NULL,
  target_address text NOT NULL,
  -- Scheduling + retry
  available_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  -- Status
  status operating_core_notification_outbox_status NOT NULL DEFAULT 'pending',
  locked_at timestamptz,
  locked_by text,
  -- Audit
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);

-- Indexes (partial WHERE clauses to optimize active rows)
CREATE INDEX idx_oc_notification_outbox_pending
  ON operating_core_notification_outbox(available_at)
  WHERE status = 'pending';

CREATE INDEX idx_oc_notification_outbox_processing
  ON operating_core_notification_outbox(locked_at)
  WHERE status = 'processing';

CREATE INDEX idx_oc_notification_outbox_status_created
  ON operating_core_notification_outbox(status, created_at);

CREATE INDEX idx_oc_notification_outbox_target
  ON operating_core_notification_outbox(target_kind, target_address);

SET lock_timeout = '5s';
SET statement_timeout = '30s';

RESET lock_timeout;
RESET statement_timeout;

-- Atomic claim RPC — FOR UPDATE SKIP LOCKED prevents double-claim under
-- concurrent drain invocations (Vercel Cron may invoke multiple instances).
CREATE OR REPLACE FUNCTION public.claim_operating_core_notification_outbox_batch(
  p_limit integer DEFAULT 10,
  p_lock_timeout interval DEFAULT interval '5 minutes'
) RETURNS SETOF operating_core_notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH candidates AS (
    SELECT id
    FROM operating_core_notification_outbox
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
  UPDATE operating_core_notification_outbox o
  SET status = 'processing',
      locked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  FROM candidates
  WHERE o.id = candidates.id
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_operating_core_notification_outbox_batch(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_operating_core_notification_outbox_batch(integer, interval) TO service_role;

-- RLS
ALTER TABLE operating_core_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE operating_core_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE operating_core_notification_outbox TO service_role;

-- Mark dispatched RPC (helper for the drain dispatcher)
CREATE OR REPLACE FUNCTION public.mark_operating_core_notification_outbox_dispatched(
  p_id uuid,
  p_dispatched_at timestamptz DEFAULT timezone('utc', now())
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE operating_core_notification_outbox
  SET status = 'dispatched',
      dispatched_at = p_dispatched_at,
      updated_at = p_dispatched_at
  WHERE id = p_id
    AND status = 'processing';
$$;

REVOKE ALL ON FUNCTION public.mark_operating_core_notification_outbox_dispatched(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_operating_core_notification_outbox_dispatched(uuid, timestamptz) TO service_role;

-- Mark failed / reschedule RPC
CREATE OR REPLACE FUNCTION public.mark_operating_core_notification_outbox_failed(
  p_id uuid,
  p_last_error text,
  p_next_attempt_at timestamptz
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE operating_core_notification_outbox
  SET status = CASE
        WHEN attempt_count + 1 >= max_attempts THEN 'failed'::operating_core_notification_outbox_status
        ELSE 'pending'::operating_core_notification_outbox_status
      END,
      attempt_count = attempt_count + 1,
      last_error = p_last_error,
      locked_at = NULL,
      locked_by = NULL,
      available_at = p_next_attempt_at,
      updated_at = timezone('utc', now())
  WHERE id = p_id
    AND status = 'processing';
$$;

REVOKE ALL ON FUNCTION public.mark_operating_core_notification_outbox_failed(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_operating_core_notification_outbox_failed(uuid, text, timestamptz) TO service_role;
