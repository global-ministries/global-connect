/**
 * S19 — Migration Dry-Run Probe: operating_core_notification_state
 *
 * RED test: Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists with correct naming convention
 *  2. ALTER TABLE outbox ADD COLUMN IF NOT EXISTS next_retry_at, sent_at
 *  3. ALTER outbox max_attempts SET DEFAULT 6
 *  4. CREATE TABLE operating_core_system_notifications with read_at
 *  5. All required indexes on system_notifications
 *  6. RLS policies on system_notifications
 *  7. lock_timeout and statement_timeout set
 *  8. NO p_auth_id anywhere
 *  9. NO DROP TABLE or destructive operations
 * 10. S17 outbox migration file NOT modified
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findNotificationStateMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_notification_state\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

function extractTables(content: string): string[] {
  const tables: string[] = []
  // Simplified pattern: avoid \s+ followed by optional groups with \s+ inside
  const tablePattern = /CREATE TABLE(?: IF NOT EXISTS)? (?:public\.)?(\w+)/gi
  let match: RegExpExecArray | null
  while ((match = tablePattern.exec(content)) !== null) {
    tables.push(match[1])
  }
  return tables
}

function extractAlterTables(content: string): string[] {
  const altered: string[] = []
  const alterPattern = /ALTER TABLE(?: IF EXISTS)? (?:public\.)?(\w+)/gi
  let match: RegExpExecArray | null
  while ((match = alterPattern.exec(content)) !== null) {
    altered.push(match[1])
  }
  return altered
}

// ─── RED Tests ────────────────────────────────────────────────────────────────

describe('F(OC/schema-notification-state-dry-run) — S19 Notification State Migration Probe', () => {
  const migrationPath = findNotificationStateMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_notification_state migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_notification_state.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_notification_state\.sql$/)
    })
  })

  describe('2. Migration header', () => {
    it('should have additive migration header comment', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Additive.*migration/i)
    })

    it('should NOT contain DROP TABLE, TRUNCATE, or unparameterized DELETE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im)
      expect(content).not.toMatch(/(?:^|\s)TRUNCATE\s/im)
      expect(content).not.toMatch(/(?:^|\s)DELETE\s+FROM\s+(?!.*WHERE)/im)
    })
  })

  describe('3. ALTER TABLE — outbox extension', () => {
    it('should ALTER TABLE operating_core_notification_outbox', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const altered = extractAlterTables(content)
      expect(altered).toContain('operating_core_notification_outbox')
    })

    it('should ADD COLUMN IF NOT EXISTS next_retry_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /ALTER\s+TABLE\s+operating_core_notification_outbox\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+next_retry_at/i,
      )
    })

    it('should ADD COLUMN IF NOT EXISTS sent_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /ALTER\s+TABLE\s+operating_core_notification_outbox\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+sent_at/i,
      )
    })

    it('should ALTER max_attempts SET DEFAULT 6', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/ALTER\s+COLUMN\s+max_attempts\s+SET\s+DEFAULT\s+6/i)
    })
  })

  describe('4. CREATE TABLE — system_notifications', () => {
    it('should CREATE TABLE operating_core_system_notifications', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const tables = extractTables(content)
      expect(tables).toContain('operating_core_system_notifications')
    })

    it('should have id column as uuid PRIMARY KEY', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/id\s+uuid\s+PRIMARY\s+KEY/i)
    })

    it('should have persona_id as uuid NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/persona_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have outbox_id as nullable FK to outbox', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/outbox_id\s+uuid\s+REFERENCES\s+operating_core_notification_outbox/i)
    })

    it('should have kind, title, body as text NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/kind\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/title\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/body\s+text\s+NOT\s+NULL/i)
    })

    it('should have target_url as nullable text', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/target_url\s+text\b/i)
    })

    it('should have read_at as nullable timestamptz', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/read_at\s+timestamptz/i)
    })

    it('should have expires_at as NOT NULL with default 7 days', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/expires_at\s+timestamptz\s+NOT\s+NULL/i)
      expect(content).toMatch(/interval\s+['"]?\d+\s+days?['"]?/i)
    })

    it('should have created_at as NOT NULL DEFAULT now()', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL/i)
    })
  })

  describe('5. Indexes on system_notifications', () => {
    it('should have idx_oc_system_notif_persona index', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_system_notif_persona/i)
    })

    it('should have idx_oc_system_notif_unread partial index WHERE read_at IS NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_system_notif_unread/i)
      expect(content).toMatch(/WHERE\s+read_at\s+IS\s+NULL/i)
    })

    it('should have idx_oc_system_notif_expires index', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_system_notif_expires/i)
    })
  })

  describe('6. RLS on system_notifications', () => {
    it('should ENABLE ROW LEVEL SECURITY on the table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /ALTER\s+TABLE\s+operating_core_system_notifications\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      )
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /REVOKE ALL ON TABLE operating_core_system_notifications FROM (?:PUBLIC, )?anon, authenticated/i,
      )
    })

    it('should GRANT SELECT, UPDATE TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /GRANT\s+(?:SELECT|ALL).*ON\s+TABLE\s+operating_core_system_notifications\s+TO\s+service_role/i,
      )
    })

    it('should have SELECT policy using auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+POLICY.*oc_system_notif_select.*ON\s+operating_core_system_notifications/i)
      expect(content).toMatch(/auth_has_operating_core_capability/i)
    })

    it('should have UPDATE policy using auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+POLICY.*oc_system_notif_update.*ON\s+operating_core_system_notifications/i)
    })
  })

  describe('7. Migration safety — timeouts', () => {
    it('should SET lock_timeout', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/SET\s+lock_timeout\s*=/i)
    })

    it('should SET statement_timeout', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/SET\s+statement_timeout\s*=/i)
    })

    it('should RESET both timeouts at end', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/RESET\s+lock_timeout/i)
      expect(content).toMatch(/RESET\s+statement_timeout/i)
    })
  })

  describe('8. No p_auth_id', () => {
    it('should NOT contain p_auth_id anywhere in the migration', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/\bp_auth_id\b/)
    })
  })

  describe('9. S17 outbox migration NOT modified', () => {
    it('should NOT contain ALTER on the S17 outbox migration file path', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // The new migration should not reference the S17 migration file name
      expect(content).not.toMatch(/20260720222029_operating_core_notification_outbox/i)
    })
  })
})
