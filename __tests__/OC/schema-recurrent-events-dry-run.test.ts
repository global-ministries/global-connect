/**
 * S22 — Schema Recurrent Events Dry-Run Probe
 *
 * RED test: Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Adds operating_core_recurrence_freq enum (daily, weekly, monthly, yearly)
 *  3. Adds recurrence_rule jsonb column to operating_core_event_instances
 *  4. Adds horizon_days integer column with DEFAULT 90
 *  5. CHECK constraint for recurrence_rule shape
 *  6. Index on (event_id, horizon_days)
 *  7. operating_core_materialize_event_instances RPC exists
 *  8. Idempotent via UNIQUE (event_id, instance_date) + ON CONFLICT DO NOTHING
 *  9. Default horizonDays = 90
 * 10. No DROP/TRUNCATE/unparameterized DELETE
 * 11. RLS helper auth_has_operating_core_capability still works (unchanged)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findRecurrentMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_recurrent_events\.sql$/.test(f))
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
      if (valLine === ');' || valLine === ')') break
      const matches = valLine.matchAll(/'([^']+)'/g)
      for (const match of matches) {
        values.push(match[1])
      }
      j++
    }

    enums.push({ name: enumName, values })
  }

  return enums
}

interface LintFinding {
  rule: string
  severity: 'ERROR' | 'WARN' | 'INFO'
  line: number
  message: string
}

function lintMigrationContent(content: string): LintFinding[] {
  const findings: LintFinding[] = []
  const lines = content.split('\n')

  // Rule 1: drop-table
  if (/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im.test(content)) {
    findings.push({ rule: 'drop-table', severity: 'ERROR', line: 1, message: 'DROP TABLE without IF EXISTS' })
  }

  // Rule 2: truncate
  if (/(?:^|\s)TRUNCATE\s/im.test(content)) {
    findings.push({ rule: 'truncate', severity: 'ERROR', line: 1, message: 'TRUNCATE in migration' })
  }

  // Rule 3: rls-using-true
  if (/USING\s*\(\s*true\s*\)/im.test(content)) {
    const lineNum = content.match(/USING\s*\(\s*true\s*\)/im)?.index
    findings.push({
      rule: 'rls-using-true',
      severity: 'WARN',
      line: lineNum ? content.substring(0, lineNum).split('\n').length : 1,
      message: 'RLS policy with USING (true)',
    })
  }

  // Rule 4: security-definer-no-search-path
  const definerLines: number[] = []
  const searchPathLines: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/SECURITY\s+DEFINER/i.test(lines[i])) definerLines.push(i)
    if (/SET\s+search_path\s+TO/i.test(lines[i])) searchPathLines.push(i)
  }
  if (definerLines.length > 0 && searchPathLines.length === 0) {
    findings.push({
      rule: 'security-definer-no-search-path',
      severity: 'WARN',
      line: definerLines[0] + 1,
      message: 'SECURITY DEFINER without SET search_path',
    })
  }

  // Rule 5: delete-from-no-where
  let inFunction = false
  let dollarDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
    if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(line)) inFunction = true
    dollarDepth += (line.match(/\$\$/g) || []).length
    if (inFunction && dollarDepth >= 2) { inFunction = false; dollarDepth = 0 }

    if (/DELETE\s+FROM/i.test(line) && !inFunction) {
      const nextLines = lines.slice(i, i + 5).join('\n')
      if (!/WHERE/i.test(nextLines)) {
        findings.push({
          rule: 'delete-from-no-where',
          severity: 'ERROR',
          line: i + 1,
          message: 'DELETE FROM without WHERE',
        })
      }
    }
  }

  return findings
}

// ─── RED Tests ────────────────────────────────────────────────────────────────

describe('F(OC/schema-recurrent-events-dry-run) — S22 Recurrent Events Migration Probe', () => {
  const migrationPath = findRecurrentMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_recurrent_events migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_recurrent_events.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_recurrent_events\.sql$/)
    })
  })

  describe('2. Migration content', () => {
    it('should have migration header comment referencing S22', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Operating.*Core.*Recurrent/i)
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

  describe('3. Recurrence enum exists', () => {
    it('should have operating_core_recurrence_freq enum with daily, weekly, monthly, yearly', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const freqEnum = enums.find((e) => /recurrence_freq/i.test(e.name))
      expect(freqEnum).toBeDefined()
      if (freqEnum) {
        expect(freqEnum.values).toContain('daily')
        expect(freqEnum.values).toContain('weekly')
        expect(freqEnum.values).toContain('monthly')
        expect(freqEnum.values).toContain('yearly')
      }
    })
  })

  describe('4. ALTER TABLE operating_core_event_instances — additive columns', () => {
    it('should add recurrence_rule jsonb column', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?operating_core_event_instances\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?recurrence_rule/i)
    })

    it('should add horizon_days integer column with DEFAULT 90', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // horizon_days is added via ADD COLUMN (single or multi-column statement)
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?horizon_days/i)
      expect(content).toMatch(/horizon_days\s+integer\s+NOT\s+NULL\s+DEFAULT\s+90/i)
    })
  })

  describe('5. recurrence_rule CHECK constraint', () => {
    it('should have CHECK constraint for recurrence_rule shape', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should check that when set, recurrence_rule has required keys
      // The spec says: freq, interval, count (or until), byDay, start_time
      expect(content).toMatch(/ADD\s+CONSTRAINT.*chk_recurrence_rule_shape/i)
      expect(content).toMatch(/recurrence_rule\s+IS\s+NULL\s+OR\s+\(/i)
    })
  })

  describe('6. Index on (event_id, horizon_days)', () => {
    it('should create index on (event_id, horizon_days)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_event_instances.*horizon/i)
    })
  })

  describe('7. operating_core_materialize_event_instances RPC', () => {
    it('should create the materialize RPC function', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/operating_core_materialize_event_instances/i)
    })

    it('should accept p_event_id, p_horizon_days, p_now_iso parameters', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/p_event_id\s+uuid/i)
      expect(content).toMatch(/p_horizon_days\s+integer/i)
      expect(content).toMatch(/p_now_iso\s+timestamptz/i)
    })

    it('should be STABLE and SECURITY DEFINER', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/LANGUAGE\s+plpgsql\s+STABLE\s+SECURITY\s+DEFINER/i)
    })

    it('should use ON CONFLICT DO NOTHING for idempotency', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/ON\s+CONFLICT\s*\(\s*event_id.*instance_date\s*\)\s+DO\s+NOTHING/i)
    })
  })

  describe('8. Default horizonDays = 90', () => {
    it('should default horizon_days to 90', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Default 90 in the column definition
      expect(content).toMatch(/horizon_days\s+integer\s+NOT\s+NULL\s+DEFAULT\s+90/i)
    })

    it('should use 90 as fallback in the materialize RPC', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // COALESCE(p_horizon_days, 90) or similar fallback
      expect(content).toMatch(/COALESCE\s*\(\s*p_horizon_days.*90/i)
    })
  })

  describe('9. No modifications to existing S03 tables', () => {
    it('should NOT CREATE TABLE operating_core_events (already exists in S03)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).not.toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_events/i)
    })

    it('should NOT CREATE TABLE operating_core_event_instances (already exists in S03)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // We only ALTER it, not CREATE it
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).not.toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_event_instances/i)
    })
  })

  describe('10. RLS unchanged (auth_has_operating_core_capability still works)', () => {
    it('should NOT DROP or ALTER auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/DROP\s+FUNCTION.*auth_has_operating_core_capability/i)
      expect(content).not.toMatch(/ALTER\s+FUNCTION.*auth_has_operating_core_capability/i)
    })
  })

  describe('11. lint:migrations passes with zero ERRORS', () => {
    it('should have zero ERROR-level lint findings', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const errors = lintMigrationContent(content)
      const errorFindings = errors.filter((f) => f.severity === 'ERROR')
      expect(errorFindings).toHaveLength(0)
    })
  })
})
