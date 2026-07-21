-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Notification State (S19)
-- Fase 3 — Additive migration. Does NOT modify existing tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- ══════════════════════════════════════════════════════════════════════════════

-- ALTER TABLE the S17 outbox to add retry + sent columns (additive, IF NOT EXISTS)
ALTER TABLE operating_core_notification_outbox
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

ALTER TABLE operating_core_notification_outbox
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Bump default max_attempts from 5 (S17) to 6
ALTER TABLE operating_core_notification_outbox
  ALTER COLUMN max_attempts SET DEFAULT 6;

-- CREATE new system_notifications table for in-app notifications (with read state)
CREATE TABLE operating_core_system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  outbox_id uuid REFERENCES operating_core_notification_outbox(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_url text,
  read_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (timezone('utc', now()) + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oc_system_notif_persona
  ON operating_core_system_notifications(persona_id, created_at DESC);

CREATE INDEX idx_oc_system_notif_unread
  ON operating_core_system_notifications(persona_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX idx_oc_system_notif_expires
  ON operating_core_system_notifications(expires_at);

SET lock_timeout = '5s';
SET statement_timeout = '30s';

RESET lock_timeout;
RESET statement_timeout;

ALTER TABLE operating_core_system_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE operating_core_system_notifications FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON TABLE operating_core_system_notifications TO service_role;

CREATE POLICY "oc_system_notif_select" ON operating_core_system_notifications FOR SELECT USING (
  auth_has_operating_core_capability('operating_core.notifications.read')
  OR auth_has_operating_core_capability('operating_core.notifications.manage')
);

CREATE POLICY "oc_system_notif_update" ON operating_core_system_notifications FOR UPDATE USING (
  auth_has_operating_core_capability('operating_core.notifications.manage')
);
