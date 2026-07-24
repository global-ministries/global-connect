/**
 * W04 — DT-020 / DT-021 — Pastoral kinds + sensitivity extension migration dry-run.
 * F(pastoral/schema/kinds-extension) — M4 extends kind ENUM with 14 pastoral_* values.
 * F(pastoral/schema/sensitivity-extension) — M5 adds sensitivity column with 'sensitive'.
 *
 * RED test: verifies the migration files satisfy acceptance criteria BEFORE application.
 *
 * Acceptance criteria (M4):
 *  1. M4 migration file exists with correct naming convention
 *  2. ALTER TYPE ADD VALUE for each of 14 pastoral_* kinds
 *  3. Uses IF NOT EXISTS pattern for idempotency
 *  4. Original 11 kinds still present (extension, not replacement)
 *  5. No DROP TABLE on operating_core_participation_eventos (I-6)
 *
 * Acceptance criteria (M5):
 *  1. M5 migration file exists with correct naming convention
 *  2. Adds sensitivity column (text NOT NULL DEFAULT 'internal')
 *  3. CHECK constraint accepts 'internal', 'public', 'sensitive'
 *  4. No DDL destructive (no DROP COLUMN on existing columns)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const PASTORAL_KINDS = [
  'pastoral_one_on_one_logged',
  'pastoral_one_on_one_completed',
  'pastoral_one_on_one_cancelled',
  'pastoral_one_on_one_note_logged',
  'pastoral_one_on_one_followup_set',
  'pastoral_one_on_one_followup_completed',
  'pastoral_one_on_one_step_validated',
  'pastoral_triada_formed',
  'pastoral_triada_member_added',
  'pastoral_triada_member_removed',
  'pastoral_triada_disbanded',
  'pastoral_triada_step_suggested',
  'pastoral_triada_step_validated',
  'pastoral_crisis_detected',
]

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter(function (f: string): boolean {
    return f.endsWith('.sql')
  })
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

describe('Pastoral M4 migration — kinds extension', () => {
  const migrationPath = findMigration(/_pastoral_kinds_extension\.sql$/)

  it('M4 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  it('ALTER TYPE ADD VALUE for each pastoral_* kind', () => {
    for (const kind of PASTORAL_KINDS) {
      expect(content).toMatch(new RegExp(`ALTER\\s+TYPE\\s+operating_core_participation_kind\\s+ADD\\s+VALUE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?['\"]${kind}['\"]`, 'i'))
    }
  })

  it('uses IF NOT EXISTS pattern for idempotency', () => {
    // Should use ADD VALUE IF NOT EXISTS or equivalent idempotent pattern
    expect(content).toMatch(/ADD\s+VALUE\s+IF\s+NOT\s+EXISTS/i)
  })

  it('does NOT DROP operating_core_participation_eventos table (I-6)', () => {
    expect(content).not.toMatch(/DROP\s+TABLE\s+operating_core_participation_eventos/i)
  })

  it('does NOT DROP the kind column', () => {
    expect(content).not.toMatch(/ALTER\s+TABLE.*DROP.*kind/i)
  })

  it('does NOT replace the ENUM with CHECK constraint (alter, not replace)', () => {
    // The migration should extend, not replace
    expect(content).not.toMatch(/DROP\s+TYPE\s+operating_core_participation_kind/i)
  })
})

describe('Pastoral M5 migration — sensitivity extension', () => {
  const migrationPath = findMigration(/_pastoral_sensitivity_extension\.sql$/)

  it('M5 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  it('adds sensitivity column (text NOT NULL DEFAULT internal)', () => {
    expect(content).toMatch(/ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?sensitivity/i)
    expect(content).toMatch(/text\s+NOT\s+NULL/i)
    expect(content).toMatch(/DEFAULT\s+['"]internal['"]/i)
  })

  it('CHECK constraint accepts internal, public, sensitive', () => {
    expect(content).toMatch(/CHECK\s*\(\s*sensitivity\s+IN\s*\(/i)
    expect(content).toMatch(/['"]internal['"]/i)
    expect(content).toMatch(/['"]public['"]/i)
    expect(content).toMatch(/['"]sensitive['"]/i)
  })

  it('does NOT DROP any existing column', () => {
    expect(content).not.toMatch(/DROP\s+COLUMN/i)
  })

  it('does NOT DROP the table', () => {
    expect(content).not.toMatch(/DROP\s+TABLE/i)
  })
})

describe('M4 + M5 invariant — zero DDL destructive', () => {
  const m4Path = findMigration(/_pastoral_kinds_extension\.sql$/)
  const m5Path = findMigration(/_pastoral_sensitivity_extension\.sql$/)

  it('M4 does not delete rows or truncate', () => {
    if (!m4Path) return
    const content = readFileSync(m4Path, 'utf-8')
    expect(content).not.toMatch(/DELETE\s+FROM/i)
    expect(content).not.toMatch(/TRUNCATE/i)
  })

  it('M5 does not delete rows or truncate (except where append-only trigger is disabled)', () => {
    if (!m5Path) return
    const content = readFileSync(m5Path, 'utf-8')
    // M5 may have UPDATE to set sensitivity='internal' on existing rows
    // but should not DELETE or TRUNCATE
    expect(content).not.toMatch(/DELETE\s+FROM\s+operating_core_participation_eventos/i)
    expect(content).not.toMatch(/TRUNCATE/i)
  })
})
