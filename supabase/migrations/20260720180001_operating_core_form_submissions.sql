-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Form Submissions Schema
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE operating_core_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES operating_core_forms(id) ON DELETE CASCADE,
  form_version_at_submission integer NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_persona_id uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: same form + persona cannot have 2 active submissions
  CONSTRAINT uq_submission_per_persona_form UNIQUE (form_id, submitted_by_persona_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_oc_form_submissions_form_id ON operating_core_form_submissions(form_id);
CREATE INDEX idx_oc_form_submissions_submitted_by ON operating_core_form_submissions(submitted_by_persona_id);
CREATE INDEX idx_oc_form_submissions_submitted_at ON operating_core_form_submissions(submitted_at);

SET lock_timeout = '5s';
SET statement_timeout = '30s';

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE operating_core_form_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE operating_core_form_submissions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE operating_core_form_submissions TO service_role;

CREATE POLICY oc_form_submissions_select ON operating_core_form_submissions FOR SELECT USING (
  auth_has_operating_core_capability('operating_core.forms.manage')
);

CREATE POLICY oc_form_submissions_insert ON operating_core_form_submissions FOR INSERT WITH CHECK (
  auth_has_operating_core_capability('operating_core.forms.manage')
  OR auth_has_operating_core_capability('operating_core.forms.submit')
);
