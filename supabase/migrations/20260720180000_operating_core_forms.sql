-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Forms Schema
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE operating_core_form_lifecycle AS ENUM (
  'draft', 'published', 'archived'
);

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE operating_core_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_experience_id text NOT NULL,
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifecycle operating_core_form_lifecycle NOT NULL DEFAULT 'draft',
  created_by_persona_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_oc_forms_owner_experience ON operating_core_forms(owner_experience_id);
CREATE INDEX idx_oc_forms_lifecycle ON operating_core_forms(lifecycle);
CREATE INDEX idx_oc_forms_created_by ON operating_core_forms(created_by_persona_id);
CREATE INDEX idx_oc_forms_created_at ON operating_core_forms(created_at);

SET lock_timeout = '5s';
SET statement_timeout = '30s';

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE operating_core_forms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE operating_core_forms FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operating_core_forms TO service_role;

CREATE POLICY oc_forms_select ON operating_core_forms FOR SELECT USING (
  auth_has_operating_core_capability('operating_core.forms.manage')
);

CREATE POLICY oc_forms_insert ON operating_core_forms FOR INSERT WITH CHECK (
  auth_has_operating_core_capability('operating_core.forms.manage')
);

CREATE POLICY oc_forms_update ON operating_core_forms FOR UPDATE USING (
  auth_has_operating_core_capability('operating_core.forms.manage')
) WITH CHECK (
  auth_has_operating_core_capability('operating_core.forms.manage')
);

CREATE POLICY oc_forms_delete ON operating_core_forms FOR DELETE USING (
  auth_has_operating_core_capability('operating_core.forms.manage')
);

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.operating_core_forms_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_operating_core_forms_updated_at ON operating_core_forms;

CREATE TRIGGER set_operating_core_forms_updated_at
  BEFORE UPDATE ON operating_core_forms
  FOR EACH ROW EXECUTE FUNCTION public.operating_core_forms_set_updated_at();
