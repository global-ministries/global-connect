-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Events + Services + EventInstance Schema
-- Fase 3 — Additive migration. Does NOT modify existing Fase 1/Fase 2 tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Event kind discriminator (camp rejected per spec)
CREATE TYPE operating_core_event_kind AS ENUM (
  'service', 'group_meeting', 'workshop', 'activity', 'custom'
);

-- Event lifecycle state
CREATE TYPE operating_core_event_estado AS ENUM (
  'active', 'cancelled'
);

-- Service lifecycle state
CREATE TYPE operating_core_service_estado AS ENUM (
  'active', 'disabled', 'removed'
);

-- EventInstance concrete occurrence lifecycle
CREATE TYPE operating_core_instance_lifecycle AS ENUM (
  'scheduled', 'ongoing', 'completed', 'cancelled'
);

-- ── Tables ───────────────────────────────────────────────────────────────────

-- Service: configured weekly schedule (template for events)
-- Single-campus per row; experiencia text provides scope (multi-tenant OUT of scope)
CREATE TABLE operating_core_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Single-campus scope: experiencia text (NOT campus_id) — multi-tenant OUT of Fase 3 scope
  experiencia text NOT NULL,
  kind operating_core_event_kind NOT NULL DEFAULT 'service',
  label text NOT NULL,
  -- 0=Sunday, 1=Monday, ... 6=Saturday
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  -- HH:mm format
  start_time text NOT NULL,
  -- Capacity ceiling for this service's events
  capacity_base integer NOT NULL DEFAULT 0 CHECK (capacity_base >= 0),
  estado operating_core_service_estado NOT NULL DEFAULT 'active',
  -- Optional metadata (PII CHECK enforced below)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    NOT (metadata ? 'cedula') AND
    NOT (metadata ? 'telefono') AND
    NOT (metadata ? 'email')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event: planned occurrence. References Service when kind = 'service'.
CREATE TABLE operating_core_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK to Service for kind=service events; null for other kinds
  service_id uuid REFERENCES operating_core_services(id) ON DELETE SET NULL,
  kind operating_core_event_kind NOT NULL,
  estado operating_core_event_estado NOT NULL DEFAULT 'active',
  title text NOT NULL,
  -- ISO date string YYYY-MM-DD
  start_date text NOT NULL,
  -- Optional recurrence rule (RRULE-like structure)
  recurrence_rule jsonb CHECK (
    recurrence_rule IS NULL OR (
      recurrence_rule ? 'freq' AND
      recurrence_rule ? 'interval' AND
      recurrence_rule ? 'count'
    )
  ),
  -- Visibility scope (experiencia name)
  visibility_scope text NOT NULL DEFAULT 'default',
  -- Optional metadata (PII CHECK enforced below)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    NOT (metadata ? 'cedula') AND
    NOT (metadata ? 'telefono') AND
    NOT (metadata ? 'email')
  ),
  -- Self-reference for series/recurring events
  parent_event_id uuid REFERENCES operating_core_events(id) ON DELETE SET NULL,
  -- Optional Dream Team assignment (read-only FK)
  responsible_dream_team_servicio_id uuid REFERENCES public.dream_team_servicios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- EventInstance: materialized concrete occurrence with own lifecycle
CREATE TABLE operating_core_event_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES operating_core_events(id) ON DELETE CASCADE,
  -- ISO date string YYYY-MM-DD
  instance_date text NOT NULL,
  estado operating_core_event_estado NOT NULL DEFAULT 'active',
  lifecycle operating_core_instance_lifecycle NOT NULL DEFAULT 'scheduled',
  -- Effective times for this specific instance
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  -- Capacity for this instance (override or base from service)
  capacity_operativa integer NOT NULL DEFAULT 0 CHECK (capacity_operativa >= 0),
  -- Optional metadata (PII CHECK enforced below)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    NOT (metadata ? 'cedula') AND
    NOT (metadata ? 'telefono') AND
    NOT (metadata ? 'email')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Instance date + event must be unique (no duplicate instances)
  CONSTRAINT uq_event_instance UNIQUE (event_id, instance_date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Production safety: non-concurrent indexes within lock_timeout block.
-- If an index times out, retry during quieter window or fix-forward.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX idx_oc_services_experiencia ON operating_core_services(experiencia);
CREATE INDEX idx_oc_services_estado ON operating_core_services(estado);
CREATE INDEX idx_oc_services_kind ON operating_core_services(kind);

CREATE INDEX idx_oc_events_service_id ON operating_core_events(service_id);
CREATE INDEX idx_oc_events_kind ON operating_core_events(kind);
CREATE INDEX idx_oc_events_estado ON operating_core_events(estado);
CREATE INDEX idx_oc_events_parent ON operating_core_events(parent_event_id);
CREATE INDEX idx_oc_events_start_date ON operating_core_events(start_date);
CREATE INDEX idx_oc_events_responsible_dream_team ON operating_core_events(responsible_dream_team_servicio_id);

CREATE INDEX idx_oc_event_instances_event_id ON operating_core_event_instances(event_id);
CREATE INDEX idx_oc_event_instances_date ON operating_core_event_instances(instance_date);
CREATE INDEX idx_oc_event_instances_lifecycle ON operating_core_event_instances(lifecycle);
CREATE INDEX idx_oc_event_instances_estado ON operating_core_event_instances(estado);
CREATE INDEX idx_oc_event_instances_start ON operating_core_event_instances(start_time);

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS: Deny-by-default ──────────────────────────────────────────────────────

ALTER TABLE operating_core_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_core_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_core_event_instances ENABLE ROW LEVEL SECURITY;

-- Revoke all direct access from anon/authenticated
REVOKE ALL ON TABLE operating_core_services FROM anon, authenticated;
REVOKE ALL ON TABLE operating_core_events FROM anon, authenticated;
REVOKE ALL ON TABLE operating_core_event_instances FROM anon, authenticated;

-- Service_role retains full access for server-side operations
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operating_core_services TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operating_core_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operating_core_event_instances TO service_role;

-- ── RLS Helper Function ────────────────────────────────────────────────────────

-- auth_has_operating_core_capability(p_capability text)
-- Mirrors dream_team auth_has_dream_team_capability pattern.
-- Binds identity to auth.uid() server-side — does NOT accept caller-supplied p_auth_id.
-- Returns true if the authenticated user has the specified capability.
CREATE OR REPLACE FUNCTION public.auth_has_operating_core_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants
    WHERE persona_id = auth.uid()
      AND capability_key = p_capability
      AND revoked_at IS NULL
  )
$$;

-- Revoke public access to the helper (only service_role can evaluate policies)
REVOKE ALL ON FUNCTION public.auth_has_operating_core_capability(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_operating_core_capability(text) TO service_role;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

-- Services: read if you have any operating_core capability; write via manage
CREATE POLICY "oc_services_select" ON operating_core_services
  FOR SELECT USING (
    auth_has_operating_core_capability('operating_core.events.read')
    OR auth_has_operating_core_capability('operating_core.events.manage')
    OR auth_has_operating_core_capability('operating_core.services.read')
    OR auth_has_operating_core_capability('operating_core.services.manage')
  );

CREATE POLICY "oc_services_insert" ON operating_core_services
  FOR INSERT WITH CHECK (
    auth_has_operating_core_capability('operating_core.services.manage')
  );

CREATE POLICY "oc_services_update" ON operating_core_services
  FOR UPDATE USING (
    auth_has_operating_core_capability('operating_core.services.manage')
  ) WITH CHECK (
    auth_has_operating_core_capability('operating_core.services.manage')
  );

CREATE POLICY "oc_services_delete" ON operating_core_services
  FOR DELETE USING (
    auth_has_operating_core_capability('operating_core.services.manage')
  );

-- Events: read if you have events.read or events.manage; cancelled rows admin-only
CREATE POLICY "oc_events_select" ON operating_core_events
  FOR SELECT USING (
    auth_has_operating_core_capability('operating_core.events.manage')
    OR (
      auth_has_operating_core_capability('operating_core.events.read')
      AND (
        estado <> 'cancelled'
        OR auth_has_operating_core_capability('operating_core.events.manage')
      )
    )
  );

CREATE POLICY "oc_events_insert" ON operating_core_events
  FOR INSERT WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_events_update" ON operating_core_events
  FOR UPDATE USING (
    auth_has_operating_core_capability('operating_core.events.manage')
  ) WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_events_delete" ON operating_core_events
  FOR DELETE USING (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

-- EventInstances: read if you have events.read or events.manage; cancelled rows admin-only
CREATE POLICY "oc_event_instances_select" ON operating_core_event_instances
  FOR SELECT USING (
    auth_has_operating_core_capability('operating_core.events.manage')
    OR (
      auth_has_operating_core_capability('operating_core.events.read')
      AND (
        estado <> 'cancelled'
        OR auth_has_operating_core_capability('operating_core.events.manage')
      )
    )
  );

CREATE POLICY "oc_event_instances_insert" ON operating_core_event_instances
  FOR INSERT WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_event_instances_update" ON operating_core_event_instances
  FOR UPDATE USING (
    auth_has_operating_core_capability('operating_core.events.manage')
  ) WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_event_instances_delete" ON operating_core_event_instances
  FOR DELETE USING (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

-- ── uno_a_uno Defense in Depth ────────────────────────────────────────────────
-- Harden uno_a_uno tables: service_role only, no public/anon/authenticated access.
-- Defensive DO blocks handle case where tables don't exist yet (future phase).
-- per design.md D5: "uno_a_uno defense in depth ... service_role only"

DO $$
BEGIN
  REVOKE ALL ON TABLE public.uno_a_uno_reuniones FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE public.uno_a_uno_reuniones TO service_role;
EXCEPTION
  WHEN undefined_table OR undefined_object THEN
    NULL; -- Table does not exist yet; skip gracefully
END $$;

DO $$
BEGIN
  REVOKE ALL ON TABLE public.uno_a_uno_participantes FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE public.uno_a_uno_participantes TO service_role;
EXCEPTION
  WHEN undefined_table OR undefined_object THEN
    NULL; -- Table does not exist yet; skip gracefully
END $$;

-- ── Updated_at trigger helper ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.operating_core_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all three tables
DROP TRIGGER IF EXISTS set_operating_core_services_updated_at ON operating_core_services;
CREATE TRIGGER set_operating_core_services_updated_at
  BEFORE UPDATE ON operating_core_services
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_set_updated_at();

DROP TRIGGER IF EXISTS set_operating_core_events_updated_at ON operating_core_events;
CREATE TRIGGER set_operating_core_events_updated_at
  BEFORE UPDATE ON operating_core_events
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_set_updated_at();

DROP TRIGGER IF EXISTS set_operating_core_event_instances_updated_at ON operating_core_event_instances;
CREATE TRIGGER set_operating_core_event_instances_updated_at
  BEFORE UPDATE ON operating_core_event_instances
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_set_updated_at();
