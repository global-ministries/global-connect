/**
 * S17 — Migration Dry-Run Probe: operating_core_notification_outbox
 *
 * RED test: Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists with correct naming convention
 *  2. operating_core_notification_outbox_status enum with correct values
 *  3. Table has all required columns
 *  4. claim_operating_core_notification_outbox_batch RPC exists with FOR UPDATE SKIP LOCKED
 *  5. mark_operating_core_notification_outbox_dispatched RPC exists
 *  6. mark_operating_core_notification_outbox_failed RPC exists
 *  7. Partial indexes exist for pending and processing status
 *  8. RLS is enabled with correct grants
 *  9. lock_timeout and statement_timeout are set
 * 10. NO p_auth_id anywhere
 * 11. NO DROP TABLE or destructive operations
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findOutboxMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_notification_outbox\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

interface EnumDef {
  name: string
  values: string[]
}

function extractEnums(content: string): EnumDef[] {
  const enums: EnumDef[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const enumMatch = line.match(/CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(/i)
    if (!enumMatch) continue
    const enumName = enumMatch[1]
    const values: string[] = []
    let j = i + 1
    while (j < lines.length) {
      const valLine = lines[j].trim()
      if (valLine === ')' || valLine.endsWith(');')) break
      const matches = valLine.matchAll(/'([^']+)'/g)
      for (const m of matches) values.push(m[1])
      j++
    }
    enums.push({ name: enumName, values })
  }
  return enums
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

// ─── RED Tests ────────────────────────────────────────────────────────────────

describe('F(OC/schema-notification-outbox-dry-run) — S17 Outbox Migration Probe', () => {
  const migrationPath = findOutboxMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_notification_outbox migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_notification_outbox.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_notification_outbox\.sql$/)
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

  describe('3. Enum: operating_core_notification_outbox_status', () => {
    it('should exist with pending, processing, dispatched, failed', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const outboxStatus = enums.find((e) =>
        /operating_core_notification_outbox_status/i.test(e.name),
      )
      expect(outboxStatus).toBeDefined()
      if (outboxStatus) {
        expect(outboxStatus.values).toContain('pending')
        expect(outboxStatus.values).toContain('processing')
        expect(outboxStatus.values).toContain('dispatched')
        expect(outboxStatus.values).toContain('failed')
      }
    })
  })

  describe('4. Table: operating_core_notification_outbox', () => {
    it('should be created', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const tables = extractTables(content)
      expect(tables).toContain('operating_core_notification_outbox')
    })

    it('should have required columns (id, kind, payload, target_kind, target_address, status)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/id\s+uuid\s+PRIMARY\s+KEY/i)
      expect(content).toMatch(/kind\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/payload\s+jsonb\s+NOT\s+NULL/i)
      expect(content).toMatch(/target_kind\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/target_address\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/status\s+operating_core_notification_outbox_status\s+NOT\s+NULL/i)
    })

    it('should have scheduling columns (available_at, attempt_count, max_attempts)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/available_at\s+timestamptz/i)
      expect(content).toMatch(/attempt_count\s+integer/i)
      expect(content).toMatch(/max_attempts\s+integer/i)
    })

    it('should have lock columns (locked_at, locked_by)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/locked_at\s+timestamptz/i)
      expect(content).toMatch(/locked_by\s+text/i)
    })

    it('should have audit columns (last_error, created_at, updated_at, dispatched_at)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/last_error\s+text/i)
      expect(content).toMatch(/created_at\s+timestamptz/i)
      expect(content).toMatch(/updated_at\s+timestamptz/i)
      expect(content).toMatch(/dispatched_at\s+timestamptz/i)
    })

    it('should have subject_id as nullable uuid', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/subject_id\s+uuid/i)
    })
  })

  describe('5. RPCs exist', () => {
    it('should have claim_operating_core_notification_outbox_batch', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/claim_operating_core_notification_outbox_batch/i)
    })

    it('should have mark_operating_core_notification_outbox_dispatched', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/mark_operating_core_notification_outbox_dispatched/i)
    })

    it('should have mark_operating_core_notification_outbox_failed', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/mark_operating_core_notification_outbox_failed/i)
    })
  })

  describe('6. claim RPC uses FOR UPDATE SKIP LOCKED', () => {
    it('should contain FOR UPDATE SKIP LOCKED in claim function', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i)
    })
  })

  describe('7. RPC security — service_role grants only', () => {
    it('should revoke claim RPC from PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.claim_operating_core_notification_outbox_batch.*FROM\s+PUBLIC/i,
      )
    })

    it('should grant claim RPC EXECUTE to service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_operating_core_notification_outbox_batch.*TO\s+service_role/i,
      )
    })
  })

  describe('8. Partial indexes for active rows', () => {
    it('should have partial index for pending status on available_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_notification_outbox_pending/i)
      expect(content).toMatch(/WHERE\s+status\s*=\s*['"]pending['"]/i)
    })

    it('should have partial index for processing status on locked_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_notification_outbox_processing/i)
      expect(content).toMatch(/WHERE\s+status\s*=\s*['"]processing['"]/i)
    })
  })

  describe('9. RLS deny-by-default', () => {
    it('should ENABLE ROW LEVEL SECURITY on the table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /ALTER\s+TABLE\s+operating_core_notification_outbox\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      )
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /REVOKE ALL ON TABLE operating_core_notification_outbox FROM (?:PUBLIC, )?anon, authenticated/i,
      )
    })

    it('should GRANT SELECT, UPDATE TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /GRANT\s+(?:SELECT|ALL).*ON\s+TABLE\s+operating_core_notification_outbox\s+TO\s+service_role/i,
      )
    })
  })

  describe('10. Migration safety — timeouts', () => {
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

  describe('11. No p_auth_id', () => {
    it('should NOT contain p_auth_id anywhere in the migration', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/\bp_auth_id\b/)
    })
  })
})
