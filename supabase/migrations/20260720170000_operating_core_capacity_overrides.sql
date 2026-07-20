-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Capacity Overrides Schema
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- Enum: source label for effective limit queries
CREATE TYPE operating_core_capacity_source AS ENUM (
  'base',      -- implicit fallthrough when no override row exists
  'override'   -- explicit override row exists
);

CREATE TABLE operating_core_capacity_overrides (
  event_id uuid PRIMARY KEY REFERENCES operating_core_events(id) ON DELETE CASCADE,
  capacity_operativa integer NOT NULL CHECK (capacity_operativa >= 0),
  -- Snapshot of capacity_base from operating_core_events at insert time.
  -- If event.capacity_base changes later, this snapshot is stale.
  -- Spec: "WHEN unset, effective limit equals capacity_base" — handled in app layer.
  capacity_base_snapshot integer NOT NULL CHECK (capacity_base_snapshot >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  set_by_persona_id uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  -- Defense in depth: mirror of S12 domain validator.
  -- App layer (validateOverride) rejects BEFORE this constraint fires.
  CONSTRAINT chk_override_within_base CHECK (capacity_operativa <= capacity_base_snapshot)
);

-- Indexes
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX idx_oc_capacity_overrides_event_id ON operating_core_capacity_overrides(event_id);
CREATE INDEX idx_oc_capacity_overrides_set_at ON operating_core_capacity_overrides(set_at);
CREATE INDEX idx_oc_capacity_overrides_set_by ON operating_core_capacity_overrides(set_by_persona_id);

RESET lock_timeout;
RESET statement_timeout;

-- RLS
ALTER TABLE operating_core_capacity_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE operating_core_capacity_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE operating_core_capacity_overrides TO service_role;
-- No UPDATE: capacity changes are append-only (new override = delete old + insert new)

-- Trigger to log operational changes (audit trail)
CREATE OR REPLACE FUNCTION public.operating_core_set_capacity_change_log()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE LOG 'operating_core_capacity_overrides: event=%, oper=%, base=%, reason=%',
    NEW.event_id, NEW.capacity_operativa, NEW.capacity_base_snapshot, NEW.reason;
  RETURN NEW;
END; $$;

CREATE TRIGGER capacity_change_log
  BEFORE INSERT ON operating_core_capacity_overrides
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_set_capacity_change_log();
