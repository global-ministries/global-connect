-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Participation Ledger Schema
-- Fase 3 — Additive migration. Does NOT modify existing Fase 1/Fase 2 tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

-- 11 closed kinds per S02 kinds.ts (excluded kinds noted there)
CREATE TYPE operating_core_participation_kind AS ENUM (
  'visitor_capture',
  'registration',
  'cancellation',
  'check_in',
  'check_out',
  'attendance',
  'attendance_update',
  'service_assignment',
  'requirement_update',
  'transition',
  'document_received'
);

-- Append-only lifecycle status
CREATE TYPE operating_core_participation_status AS ENUM (
  'recorded',
  'corrected',
  'superseded',
  'rejected'
);

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE operating_core_participation_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 11-kind closed union
  kind operating_core_participation_kind NOT NULL,

  -- Subject of the event (person, registration, event instance, etc.)
  subject_id uuid NOT NULL,

  -- When the event actually occurred (not when persisted)
  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- Auditable actor
  actor_persona_id uuid NOT NULL,

  -- Capture source
  capture_source text NOT NULL,

  -- Experience scope (multi-tenant OUT of scope; single per row)
  experience text NOT NULL,

  -- Optional OC entity references
  event_id uuid REFERENCES operating_core_events(id) ON DELETE SET NULL,
  service_id uuid REFERENCES operating_core_services(id) ON DELETE SET NULL,
  event_instance_id uuid REFERENCES operating_core_event_instances(id) ON DELETE SET NULL,

  -- Append-only correction: self-reference to the original event this one corrects
  corrects_event_id uuid REFERENCES operating_core_participation_eventos(id) ON DELETE SET NULL,

  -- Lifecycle status (default: recorded; corrections are NEW rows with corrected/superseded)
  status operating_core_participation_status NOT NULL DEFAULT 'recorded',

  -- Bounded metadata with PII CHECK (5 keys rejected per spec)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    NOT (metadata ? 'cedula') AND
    NOT (metadata ? 'telefono') AND
    NOT (metadata ? 'email') AND
    NOT (metadata ? 'nombre') AND
    NOT (metadata ? 'apellido')
  ),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: same (subject, kind, occurred_at) cannot duplicate
  CONSTRAINT uq_participation_record UNIQUE (subject_id, kind, occurred_at)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Production safety: non-concurrent indexes within lock_timeout block.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX idx_oc_participation_kind ON operating_core_participation_eventos(kind);
CREATE INDEX idx_oc_participation_subject ON operating_core_participation_eventos(subject_id);
CREATE INDEX idx_oc_participation_occurred_at ON operating_core_participation_eventos(occurred_at);
CREATE INDEX idx_oc_participation_actor ON operating_core_participation_eventos(actor_persona_id);
CREATE INDEX idx_oc_participation_event ON operating_core_participation_eventos(event_id);
CREATE INDEX idx_oc_participation_service ON operating_core_participation_eventos(service_id);
CREATE INDEX idx_oc_participation_instance ON operating_core_participation_eventos(event_instance_id);
CREATE INDEX idx_oc_participation_corrects ON operating_core_participation_eventos(corrects_event_id);
CREATE INDEX idx_oc_participation_status ON operating_core_participation_eventos(status);

-- Composite index for common query pattern: subject + kind + time
CREATE INDEX idx_oc_participation_subject_kind_occurred
  ON operating_core_participation_eventos(subject_id, kind, occurred_at DESC);

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS: deny-by-default ──────────────────────────────────────────────────────

ALTER TABLE operating_core_participation_eventos ENABLE ROW LEVEL SECURITY;

-- Revoke all direct access from anon/authenticated
REVOKE ALL ON TABLE operating_core_participation_eventos FROM PUBLIC, anon, authenticated;

-- service_role: INSERT + SELECT only (append-only invariant — no UPDATE/DELETE)
GRANT SELECT, INSERT ON TABLE operating_core_participation_eventos TO service_role;

-- ── RLS policies via auth_has_operating_core_capability (defined in S03) ─────

CREATE POLICY "oc_participation_select" ON operating_core_participation_eventos
  FOR SELECT USING (
    auth_has_operating_core_capability('operating_core.participation.read')
    OR auth_has_operating_core_capability('operating_core.participation.manage')
    OR auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_participation_insert" ON operating_core_participation_eventos
  FOR INSERT WITH CHECK (
    auth_has_operating_core_capability('operating_core.participation.manage')
    OR auth_has_operating_core_capability('operating_core.events.manage')
  );

-- NO UPDATE/DELETE policies — append-only enforced at DB level by trigger

-- ── Append-only enforcement trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.operating_core_participation_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'operating_core_participation_eventos is append-only; corrections must be new rows with corrects_event_id';
END; $$;

CREATE TRIGGER enforce_participation_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON operating_core_participation_eventos -- noqa: truncate
  FOR EACH STATEMENT EXECUTE FUNCTION public.operating_core_participation_append_only();
