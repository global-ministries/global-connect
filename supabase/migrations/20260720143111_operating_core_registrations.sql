-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Registrations Schema
-- Fase 3 — Additive migration. Does NOT modify existing Fase 1/Fase 2/Fase 3 tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE operating_core_registration_estado AS ENUM (
  'pendiente',
  'confirmada',
  'asistida',
  'no_asistio',
  'cancelada',
  'rechazada'
);  -- 6 states matching S02 REGISTRATION_STATES + S09 RegistrationState

CREATE TYPE operating_core_registration_confirmation_mode AS ENUM (
  'automatic',
  'manual'
);

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE operating_core_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES operating_core_events(id) ON DELETE CASCADE,
  estado operating_core_registration_estado NOT NULL DEFAULT 'pendiente',
  confirmation_mode operating_core_registration_confirmation_mode NOT NULL DEFAULT 'automatic',
  waitlist_position integer,
  captured_by_persona_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  -- Idempotency: at most ONE non-terminal registration per (persona_id, event_id)
  -- Implemented as EXCLUDE constraint (partial unique); PostgreSQL 11+
  CONSTRAINT uq_active_registration_per_persona_event
    EXCLUDE USING btree (persona_id WITH =, event_id WITH =)
    WHERE (estado NOT IN ('cancelada', 'rechazada'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX idx_oc_registrations_event_estado ON operating_core_registrations(event_id, estado);
CREATE INDEX idx_oc_registrations_event_waitlist ON operating_core_registrations(event_id, waitlist_position)
  WHERE estado = 'pendiente';
CREATE INDEX idx_oc_registrations_persona ON operating_core_registrations(persona_id);
CREATE INDEX idx_oc_registrations_captured_by ON operating_core_registrations(captured_by_persona_id);
CREATE INDEX idx_oc_registrations_created_at ON operating_core_registrations(created_at);

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS: deny-by-default ──────────────────────────────────────────────────────

ALTER TABLE operating_core_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE operating_core_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE operating_core_registrations TO service_role;

-- Policies via auth_has_operating_core_capability (defined in S03 migration)
CREATE POLICY "oc_registrations_select" ON operating_core_registrations
  FOR SELECT USING (
    auth_has_operating_core_capability('operating_core.events.read')
    OR auth_has_operating_core_capability('operating_core.events.manage')
    OR auth_has_operating_core_capability('operating_core.services.manage')
  );

CREATE POLICY "oc_registrations_insert" ON operating_core_registrations
  FOR INSERT WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

CREATE POLICY "oc_registrations_update" ON operating_core_registrations
  FOR UPDATE USING (
    auth_has_operating_core_capability('operating_core.events.manage')
  ) WITH CHECK (
    auth_has_operating_core_capability('operating_core.events.manage')
  );

-- ── Atomic promote_waitlist RPC ───────────────────────────────────────────────

-- Atomically promote the next N waitlist entries (lowest waitlist_position) from
-- 'pendiente' to 'confirmada'. Uses FOR UPDATE SKIP LOCKED to prevent
-- double-promotion under concurrent calls.
--
-- For each slot released (e.g., 1 cancellation → 1 slot, capacity +N → N slots),
-- caller invokes `operating_core_promote_waitlist(p_event_id, p_slot_released)`.
-- Idempotent: subsequent calls find no candidates.
--
-- Caller MUST have 'operating_core.events.manage' capability (not enforced at
-- DB level; runtime layer + RLS on the registrations table enforce).

CREATE OR REPLACE FUNCTION public.operating_core_promote_waitlist(
  p_event_id uuid,
  p_slot_released integer DEFAULT 1
) RETURNS SETOF operating_core_registrations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promoted_count integer := 0;
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM operating_core_registrations
    WHERE event_id = p_event_id
      AND estado = 'pendiente'
      AND waitlist_position IS NOT NULL
    ORDER BY waitlist_position ASC
    LIMIT GREATEST(p_slot_released, 0)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE operating_core_registrations r
    SET estado = 'confirmada',
        waitlist_position = NULL,
        version = r.version + 1,
        updated_at = now()
    FROM candidates c
    WHERE r.id = c.id
    RETURNING r.*
  )
  SELECT * FROM updated;
  GET DIAGNOSTICS v_promoted_count = ROW_COUNT;

  RAISE LOG 'operating_core_promote_waitlist: event=%, promoted=%', p_event_id, v_promoted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.operating_core_promote_waitlist(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operating_core_promote_waitlist(uuid, integer) TO service_role;

-- ── updated_at trigger helper ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.operating_core_registrations_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_operating_core_registrations_updated_at ON operating_core_registrations;
CREATE TRIGGER set_operating_core_registrations_updated_at
  BEFORE UPDATE ON operating_core_registrations
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_registrations_set_updated_at();
