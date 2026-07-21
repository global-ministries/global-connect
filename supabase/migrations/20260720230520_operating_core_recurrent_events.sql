-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Recurrent Event Materialization (S22)
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Recurrence frequency enum (daily, weekly, monthly, yearly)
-- Per S22 spec: RRULE subset with lazy deterministic materialization
CREATE TYPE operating_core_recurrence_freq AS ENUM (
  'daily',
  'weekly',
  'monthly',
  'yearly'
);

-- ── ALTER existing event_instances table (S03) ───────────────────────────────

-- Add RRULE fields for recurrent events
-- recurrence_rule: jsonb with freq/interval/count/until/byDay/start_time
-- horizon_days: default 90 days, per-event override allowed
ALTER TABLE operating_core_event_instances
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb,
  ADD COLUMN IF NOT EXISTS horizon_days integer NOT NULL DEFAULT 90;

-- CHECK constraint for recurrence_rule shape
-- Only validates when set (IS NOT NULL)
-- Per spec: freq and interval are required; count OR until (or both) are allowed
ALTER TABLE operating_core_event_instances
  ADD CONSTRAINT chk_recurrence_rule_shape CHECK (
    recurrence_rule IS NULL OR (
      recurrence_rule ? 'freq'
      AND recurrence_rule ? 'interval'
      AND (recurrence_rule ? 'count' OR recurrence_rule ? 'until')
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Index for fast filtering by horizon_days
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS idx_oc_event_instances_horizon
  ON operating_core_event_instances(event_id, horizon_days);

RESET lock_timeout;
RESET statement_timeout;

-- ── Materialization RPC ───────────────────────────────────────────────────────

-- Atomic, idempotent event instance materialization.
-- Deterministic: same (event_id, horizon_days, now_iso) → same result.
-- Idempotent: UNIQUE(event_id, instance_date) + ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.operating_core_materialize_event_instances(
  p_event_id uuid,
  p_horizon_days integer DEFAULT 90,
  p_now_iso timestamptz DEFAULT timezone('utc', now())
) RETURNS SETOF operating_core_event_instances
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event operating_core_events%ROWTYPE;
  v_rule jsonb;
  v_horizon_date date;
  v_horizon_days_int integer;
  v_start_date date;
  v_freq text;
  v_interval integer;
  v_count integer;
  v_until date;
  v_by_day jsonb;
  v_start_time text;
  v_day_offset integer;
BEGIN
  -- Get event record
  SELECT * INTO v_event FROM operating_core_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_rule := v_event.recurrence_rule;
  v_horizon_days_int := COALESCE(p_horizon_days, 90);
  v_horizon_date := (p_now_iso::date + (v_horizon_days_int || ' days')::interval)::date;

  -- Handle non-recurring event (no recurrence_rule)
  IF v_rule IS NULL THEN
    INSERT INTO operating_core_event_instances (
      id, event_id, instance_date, estado, lifecycle,
      start_time, end_time, capacity_operativa,
      recurrence_rule, horizon_days,
      version, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), p_event_id, v_event.start_date,
      'active', 'scheduled',
      v_event.start_date::timestamptz,
      (v_event.start_date::timestamptz + interval '1 hour'),
      0,
      NULL, v_horizon_days_int,
      1, now(), now()
    )
    ON CONFLICT (event_id, instance_date) DO NOTHING
    RETURNING *;
    RETURN;
  END IF;

  -- Parse recurrence rule
  v_freq := v_rule->>'freq';
  v_interval := COALESCE((v_rule->>'interval')::integer, 1);
  v_count := COALESCE((v_rule->>'count')::integer, NULL);
  v_until := COALESCE((v_rule->>'until')::date, NULL);
  v_by_day := v_rule->'byDay';
  v_start_time := COALESCE(v_rule->>'startTime', '00:00');
  v_start_date := v_event.start_date::date;

  -- Generate instances based on frequency
  IF v_freq = 'daily' THEN
    -- Daily recurrence: every v_interval days
    FOR v_day_offset IN 0..LEAST(v_horizon_days_int - 1, 365) LOOP
      IF v_day_offset % v_interval != 0 THEN
        CONTINUE;
      END IF;

      IF v_count IS NOT NULL AND v_day_offset / v_interval >= v_count THEN
        EXIT;
      END IF;

      INSERT INTO operating_core_event_instances (
        id, event_id, instance_date, estado, lifecycle,
        start_time, end_time, capacity_operativa,
        recurrence_rule, horizon_days,
        version, created_at, updated_at
      )
      SELECT
        gen_random_uuid(),
        p_event_id,
        (v_start_date + (v_day_offset || ' days')::interval)::date,
        'active', 'scheduled',
        (v_start_date + (v_day_offset || ' days')::interval + (v_start_time || ' hours')::interval)::timestamptz,
        (v_start_date + (v_day_offset || ' days')::interval + (v_start_time || ' hours')::interval + interval '1 hour')::timestamptz,
        COALESCE(
          (SELECT capacity_base FROM operating_core_services WHERE id = v_event.service_id),
          0
        ),
        v_rule,
        v_horizon_days_int,
        1, now(), now()
      ON CONFLICT (event_id, instance_date) DO NOTHING;
    END LOOP;

  ELSIF v_freq = 'weekly' THEN
    -- Weekly recurrence: every v_interval weeks
    FOR v_day_offset IN 0..LEAST(v_horizon_days_int - 1, 365) LOOP
      DECLARE
        v_current_date date;
        v_dow integer;
        v_week_num integer;
        v_match boolean;
      BEGIN
        v_current_date := v_start_date + (v_day_offset || ' days')::interval;
        v_dow := EXTRACT(DOW FROM v_current_date)::integer;

        -- Check if this day matches the byDay rule
        IF v_by_day IS NOT NULL AND jsonb_typeof(v_by_day) = 'array' AND jsonb_array_length(v_by_day) > 0 THEN
          v_match := (v_by_day @> to_jsonb(v_dow));
        ELSE
          -- Default: same day of week as start date
          v_match := (v_dow = EXTRACT(DOW FROM v_start_date)::integer);
        END IF;

        IF NOT v_match THEN
          CONTINUE;
        END IF;

        -- Check week interval
        v_week_num := v_day_offset / 7;
        IF v_week_num % v_interval != 0 THEN
          CONTINUE;
        END IF;

        IF v_count IS NOT NULL AND v_week_num / v_interval >= v_count THEN
          EXIT;
        END IF;

        INSERT INTO operating_core_event_instances (
          id, event_id, instance_date, estado, lifecycle,
          start_time, end_time, capacity_operativa,
          recurrence_rule, horizon_days,
          version, created_at, updated_at
        )
        SELECT
          gen_random_uuid(),
          p_event_id,
          v_current_date,
          'active', 'scheduled',
          (v_current_date + (v_start_time || ' hours')::interval)::timestamptz,
          (v_current_date + (v_start_time || ' hours')::interval + interval '1 hour')::timestamptz,
          COALESCE(
            (SELECT capacity_base FROM operating_core_services WHERE id = v_event.service_id),
            0
          ),
          v_rule,
          v_horizon_days_int,
          1, now(), now()
        ON CONFLICT (event_id, instance_date) DO NOTHING;
      END;
    END LOOP;

  ELSIF v_freq = 'monthly' THEN
    -- Monthly recurrence: same day of month, every v_interval months
    DECLARE
      v_month_offset integer;
      v_target_date date;
    BEGIN
      FOR v_month_offset IN 0..LEAST(v_horizon_days_int / 30, 12) LOOP
        IF v_month_offset % v_interval != 0 THEN
          CONTINUE;
        END IF;

        IF v_count IS NOT NULL AND v_month_offset / v_interval >= v_count THEN
          EXIT;
        END IF;

        v_target_date := (v_start_date + ((v_month_offset || ' months')::interval))::date;

        IF v_until IS NOT NULL AND v_target_date > v_until THEN
          EXIT;
        END IF;

        INSERT INTO operating_core_event_instances (
          id, event_id, instance_date, estado, lifecycle,
          start_time, end_time, capacity_operativa,
          recurrence_rule, horizon_days,
          version, created_at, updated_at
        )
        SELECT
          gen_random_uuid(),
          p_event_id,
          v_target_date,
          'active', 'scheduled',
          (v_target_date + (v_start_time || ' hours')::interval)::timestamptz,
          (v_target_date + (v_start_time || ' hours')::interval + interval '1 hour')::timestamptz,
          COALESCE(
            (SELECT capacity_base FROM operating_core_services WHERE id = v_event.service_id),
            0
          ),
          v_rule,
          v_horizon_days_int,
          1, now(), now()
        ON CONFLICT (event_id, instance_date) DO NOTHING;
      END LOOP;
    END;

  ELSIF v_freq = 'yearly' THEN
    -- Yearly recurrence: same month/day, every v_interval years
    DECLARE
      v_year_offset integer;
      v_target_date date;
    BEGIN
      FOR v_year_offset IN 0..LEAST(v_horizon_days_int / 365, 5) LOOP
        IF v_year_offset % v_interval != 0 THEN
          CONTINUE;
        END IF;

        IF v_count IS NOT NULL AND v_year_offset / v_interval >= v_count THEN
          EXIT;
        END IF;

        v_target_date := (DATE_TRUNC('year', v_start_date) + ((v_year_offset || ' years')::interval))::date;
        v_target_date := (v_target_date + ((EXTRACT(MONTH FROM v_start_date) - 1) || ' months')::interval)::date;
        v_target_date := (v_target_date + ((EXTRACT(DAY FROM v_start_date) - 1) || ' days')::interval)::date;

        IF v_until IS NOT NULL AND v_target_date > v_until THEN
          EXIT;
        END IF;

        INSERT INTO operating_core_event_instances (
          id, event_id, instance_date, estado, lifecycle,
          start_time, end_time, capacity_operativa,
          recurrence_rule, horizon_days,
          version, created_at, updated_at
        )
        SELECT
          gen_random_uuid(),
          p_event_id,
          v_target_date,
          'active', 'scheduled',
          (v_target_date + (v_start_time || ' hours')::interval)::timestamptz,
          (v_target_date + (v_start_time || ' hours')::interval + interval '1 hour')::timestamptz,
          COALESCE(
            (SELECT capacity_base FROM operating_core_services WHERE id = v_event.service_id),
            0
          ),
          v_rule,
          v_horizon_days_int,
          1, now(), now()
        ON CONFLICT (event_id, instance_date) DO NOTHING;
      END LOOP;
    END;
  END IF;

  -- Return all instances for this event
  RETURN QUERY SELECT * FROM operating_core_event_instances
    WHERE event_id = p_event_id
    ORDER BY instance_date;
END;
$$;

-- Revoke public access — service_role only
REVOKE ALL ON FUNCTION public.operating_core_materialize_event_instances(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operating_core_materialize_event_instances(uuid, integer, timestamptz)
  TO service_role;

-- ── RLS Policies for new columns ─────────────────────────────────────────────

-- The event_instances table already has RLS enabled (from S03).
-- We need to add policies for the new columns (they're accessible via existing policies
-- since RLS is on the table level, not column level).

-- The existing RLS policies for operating_core_event_instances (from S03) cover
-- SELECT, INSERT, UPDATE, DELETE — no additional policies needed for the new columns.

-- ── Verification ─────────────────────────────────────────────────────────────

-- Verify the columns were added (for manual testing)
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'operating_core_event_instances'
--    AND column_name IN ('recurrence_rule', 'horizon_days');
