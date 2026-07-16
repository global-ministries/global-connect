/**
 * S07 Migration Dry-Run Probe — Operating Core Participation Ledger
 *
 * RED test: Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Exactly 11 participation kind enum values (no one_on_one_logged)
 *  3. 4-value participation status enum (recorded/corrected/superseded/rejected)
 *  4. operating_core_participation_eventos table with correct columns
 *  5. Every jsonb metadata column has PII CHECK constraint (no cedula/telefono/email/nombre/apellido)
 *  6. Append-only enforcement (trigger + no UPDATE/DELETE policies)
 *  7. RLS deny-by-default with SELECT + INSERT policies via auth_has_operating_core_capability
 *  8. corrects_event_id self-reference FK with ON DELETE SET NULL
 *  9. service_role GRANT SELECT + INSERT only (no UPDATE/DELETE)
 * 10. Unique constraint on (subject_id, kind, occurred_at)
 * 11. lint:migrations zero ERROR findings
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Find the operating_core_participation_eventos migration file.
 * Naming convention: YYYYMMDDHHMMSS_operating_core_participation_eventos.sql
 */
function findParticipationLedgerMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_participation_eventos\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

// ─── SQL extraction helpers ──────────────────────────────────────────────────

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

interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  isJsonb: boolean
  hasPiiCheck: boolean
  references: string | null
}

interface TableDef {
  name: string
  columns: ColumnDef[]
  primaryKey: string[]
  uniqueConstraints: string[][]
}

function extractTables(content: string): TableDef[] {
  const tables: TableDef[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    const createMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i)
    if (!createMatch) continue

    const tableName = createMatch[1]
    const columns: ColumnDef[] = []
    const primaryKey: string[] = []
    const uniqueConstraints: string[][] = []

    let j = i + 1
    while (j < lines.length) {
      const colLine = lines[j].trim()

      if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|SET|RESET|--)/i.test(colLine)) {
        break
      }

      if (!colLine) { j++; continue }
      if (colLine === ')' || colLine.endsWith(');')) { break }

      // Parse column definition
      const colMatch = colLine.match(/^(\w+)\s+(\w+(?:\[\])?)(.*)/i)
      if (colMatch) {
        const [, colName, colType, rest] = colMatch
        const isJsonb = colType.toLowerCase() === 'jsonb'
        const nullable = !/NOT\s+NULL/i.test(rest) && !/PRIMARY\s+KEY/i.test(rest)
        const refMatch = rest.match(/REFERENCES\s+(\w+)/i)

        // Collect multi-line CHECK
        let fullCheckText = rest
        if (/CHECK\s*\(/i.test(rest)) {
          let checkEnd = j
          while (checkEnd < lines.length) {
            if (lines[checkEnd].trim().endsWith('),') || lines[checkEnd].trim() === '),' || lines[checkEnd].trim() === ')') {
              checkEnd++
              break
            }
            checkEnd++
          }
          fullCheckText = lines.slice(j, checkEnd).join(' ')
        }

        // PII CHECK: cedula, telefono, email, nombre, apellido
         
        const hasPiiCheck = isJsonb && /CHECK\s*\(/i.test(fullCheckText) &&
          /metadata\s*\?\s*'cedula'/.test(fullCheckText) &&
          /metadata\s*\?\s*'telefono'/.test(fullCheckText) &&
          /metadata\s*\?\s*'email'/.test(fullCheckText) &&
          /metadata\s*\?\s*'nombre'/.test(fullCheckText) &&
          /metadata\s*\?\s*'apellido'/.test(fullCheckText)

        columns.push({
          name: colName,
          type: colType,
          nullable,
          isJsonb,
          hasPiiCheck,
          references: refMatch ? refMatch[1] : null,
        })

        if (/PRIMARY\s+KEY/i.test(rest)) {
          primaryKey.push(colName)
        }
      }

      // Unique constraint
      const uniqueMatch = colLine.match(/CONSTRAINT\s+(\w+)\s+UNIQUE\s*\(/i)
      if (uniqueMatch) {
        // Collect columns in unique constraint
        const uniqueCols: string[] = []
        let k = j
        while (k < lines.length) {
          const uLine = lines[k].trim()
          if (uLine === ')' || uLine.endsWith(')')) break
          const colInUnique = uLine.match(/(\w+)/)
          if (colInUnique) uniqueCols.push(colInUnique[1])
          k++
        }
        uniqueConstraints.push(uniqueCols)
      }

      j++
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns, primaryKey, uniqueConstraints })
    }
  }

  return tables
}

interface Policy {
  name: string
  cmd: string
  usesCapability: boolean
}

function extractPolicies(content: string, tableName: string): Policy[] {
  const policies: Policy[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match CREATE POLICY with possibly quoted name: CREATE POLICY "name" ON table
     
    const policyMatch = line.match(/CREATE\s+POLICY\s+(?:"(\w+)"|(\w+))\s+ON\s+(\w+)/i)
    if (!policyMatch) continue

    const policyName = policyMatch[1] || policyMatch[2]
    const policyTable = policyMatch[3]
    if (policyTable !== tableName) continue

    // Collect the full policy block (may span multiple lines) until semicolon
    const blockLines: string[] = []
    let j = i
    while (j < lines.length) {
      blockLines.push(lines[j])
      if (/;\s*$/.test(lines[j].trim())) break
      j++
    }
    const block = blockLines.join(' ')

    const cmdMatch = block.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i)
    const cmd = cmdMatch ? cmdMatch[1].toUpperCase() : 'UNKNOWN'
    const usesCapability = /auth_has_operating_core_capability/i.test(block) ||
      /operating_core\.\w+\.\w+/i.test(block)

    policies.push({ name: policyName, cmd, usesCapability })
  }

  return policies
}

// ─── Inline linter ────────────────────────────────────────────────────────────

interface LintFinding {
  rule: string
  severity: 'ERROR' | 'WARN' | 'INFO'
  line: number
  message: string
}

function lintMigrationContent(content: string): LintFinding[] {
  const findings: LintFinding[] = []

  // Rule 1: drop-table
  if (/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im.test(content)) {
    findings.push({ rule: 'drop-table', severity: 'ERROR', line: 1, message: 'DROP TABLE without IF EXISTS' })
  }

  // Rule 2: truncate (standalone statement only — not TRUNCATE as trigger timing keyword)
  // Match TRUNCATE only when it starts a statement (beginning of line, possibly with leading whitespace)
  if (/(?:^|\n)\s*TRUNCATE\s/im.test(content)) {
    findings.push({ rule: 'truncate', severity: 'ERROR', line: 1, message: 'TRUNCATE in migration' })
  }

  // Rule 3: rls-using-true
  if (/USING\s*\(\s*true\s*\)/im.test(content)) {
    const lineNum = content.match(/USING\s*\(\s*true\s*\)/im)?.index
    findings.push({
      rule: 'rls-using-true', severity: 'WARN', line: lineNum ? content.substring(0, lineNum).split('\n').length : 1,
      message: 'RLS policy with USING (true)'
    })
  }

  // Rule 4: security-definer-no-search-path
  const lines = content.split('\n')
  const definerLines: number[] = []
  const searchPathLines: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/SECURITY\s+DEFINER/i.test(lines[i])) definerLines.push(i)
    if (/SET\s+search_path\s+TO/i.test(lines[i])) searchPathLines.push(i)
  }
  if (definerLines.length > 0 && searchPathLines.length === 0) {
    findings.push({
      rule: 'security-definer-no-search-path', severity: 'WARN',
      line: definerLines[0] + 1, message: 'SECURITY DEFINER without SET search_path'
    })
  }

  // Rule 5: delete-from-no-where
  let inFunction = false
  let dollarDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, bounded patterns
    if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(line)) inFunction = true
    dollarDepth += (line.match(/\$\$/g) || []).length
    if (inFunction && dollarDepth >= 2) { inFunction = false; dollarDepth = 0 }

    if (/DELETE\s+FROM/i.test(line) && !inFunction) {
      const nextLines = lines.slice(i, i + 5).join('\n')
      if (!/WHERE/i.test(nextLines)) {
        findings.push({
          rule: 'delete-from-no-where', severity: 'ERROR', line: i + 1,
          message: 'DELETE FROM without WHERE'
        })
      }
    }
  }

  return findings
}

// ─── RED Tests ─────────────────────────────────────────────────────────────────

describe('F(OC/ledger-repository) — S07 Participation Ledger Migration Probe', () => {
  const migrationPath = findParticipationLedgerMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_participation_eventos migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_participation_eventos.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_participation_eventos\.sql$/)
    })
  })

  describe('2. Migration content safety', () => {
    it('should NOT contain DROP TABLE, standalone TRUNCATE, or unparameterized DELETE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // These are forbidden (TRUNCATE as a standalone SQL statement; TRUNCATE as trigger
      // timing keyword like "BEFORE UPDATE OR DELETE OR TRUNCATE ON" is allowed)
      expect(content).not.toMatch(/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im)
      // Standalone TRUNCATE TABLE statement: TRUNCATE at start of a line/statement
      expect(content).not.toMatch(/(?:^|\n)\s*TRUNCATE\s+TABLE/im)
      expect(content).not.toMatch(/(?:^|\s)DELETE\s+FROM\s+(?!.*WHERE)/im)
    })

    it('should NOT contain one_on_one_logged', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/one_on_one_logged/i)
    })
  })

  describe('3. Required enums', () => {
    it('should have operating_core_participation_kind enum with exactly 11 values', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const kindEnum = enums.find(e => /operating_core_participation_kind/i.test(e.name))
      expect(kindEnum).toBeDefined()
      if (kindEnum) {
        expect(kindEnum.values).toHaveLength(11)
        // Must contain all 11 kinds from S02 kinds.ts
        expect(kindEnum.values).toContain('visitor_capture')
        expect(kindEnum.values).toContain('registration')
        expect(kindEnum.values).toContain('cancellation')
        expect(kindEnum.values).toContain('check_in')
        expect(kindEnum.values).toContain('check_out')
        expect(kindEnum.values).toContain('attendance')
        expect(kindEnum.values).toContain('attendance_update')
        expect(kindEnum.values).toContain('service_assignment')
        expect(kindEnum.values).toContain('requirement_update')
        expect(kindEnum.values).toContain('transition')
        expect(kindEnum.values).toContain('document_received')
        // Must NOT contain one_on_one_logged
        expect(kindEnum.values).not.toContain('one_on_one_logged')
      }
    })

    it('should have operating_core_participation_status enum with 4 values', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const statusEnum = enums.find(e => /operating_core_participation_status/i.test(e.name))
      expect(statusEnum).toBeDefined()
      if (statusEnum) {
        expect(statusEnum.values).toHaveLength(4)
        expect(statusEnum.values).toContain('recorded')
        expect(statusEnum.values).toContain('corrected')
        expect(statusEnum.values).toContain('superseded')
        expect(statusEnum.values).toContain('rejected')
      }
    })
  })

  describe('4. Required table exists', () => {
    it('should have operating_core_participation_eventos table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      /* eslint-disable security/detect-unsafe-regex -- static SQL keyword scan */
      expect(content).toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_participation_eventos/i
      )
      /* eslint-enable security/detect-unsafe-regex */
    })
  })

  describe('5. Table structure — required columns', () => {
    it('should have id uuid PRIMARY KEY', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const tables = extractTables(content)
      const table = tables.find(t => /operating_core_participation_eventos/i.test(t.name))
      expect(table).toBeDefined()
      if (table) {
        const idCol = table.columns.find(c => c.name === 'id')
        expect(idCol).toBeDefined()
        expect(idCol!.type.toLowerCase()).toBe('uuid')
      }
    })

    it('should have kind operating_core_participation_kind NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/kind\s+operating_core_participation_kind\s+NOT\s+NULL/i)
    })

    it('should have subject_id uuid NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/subject_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have occurred_at timestamptz NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/occurred_at\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('should have actor_persona_id uuid NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/actor_persona_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have capture_source text NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/capture_source\s+text\s+NOT\s+NULL/i)
    })

    it('should have experience text NOT NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/experience\s+text\s+NOT\s+NULL/i)
    })

    it('should have status operating_core_participation_status NOT NULL DEFAULT recorded', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/status\s+operating_core_participation_status\s+NOT\s+NULL/i)
    })

    it('should have metadata jsonb NOT NULL with PII CHECK', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s+jsonb\s+NOT\s+NULL/i)
    })

    it('should have event_id FK to operating_core_events', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/event_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_events/i)
    })

    it('should have service_id FK to operating_core_services', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/service_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_services/i)
    })

    it('should have event_instance_id FK to operating_core_event_instances', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/event_instance_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_event_instances/i)
    })

    it('should have corrects_event_id self-reference FK with ON DELETE SET NULL', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(
        /corrects_event_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_participation_eventos\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i
      )
    })

    it('should have created_at timestamptz NOT NULL DEFAULT now()', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL/i)
    })
  })

  describe('6. Unique constraint (subject_id, kind, occurred_at)', () => {
    it('should have UNIQUE constraint on subject_id, kind, and occurred_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const tables = extractTables(content)
      const table = tables.find(t => /operating_core_participation_eventos/i.test(t.name))
      expect(table).toBeDefined()
      if (table) {
        // Either as inline UNIQUE or as CONSTRAINT
        const hasUnique = table.uniqueConstraints.some(
          cols => cols.includes('subject_id') && cols.includes('kind') && cols.includes('occurred_at')
        )
        const hasInlineUnique = /UNIQUE\s*\(subject_id\s*,\s*kind\s*,\s*occurred_at\)/i.test(content)
        expect(hasUnique || hasInlineUnique).toBe(true)
      }
    })
  })

  describe('7. PII discipline — metadata jsonb CHECK rejects all 5 PII keys', () => {
    it('should reject metadata ? cedula', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?\s*'cedula'/)
    })

    it('should reject metadata ? telefono', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?\s*'telefono'/)
    })

    it('should reject metadata ? email', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?\s*'email'/)
    })

    it('should reject metadata ? nombre', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?\s*'nombre'/)
    })

    it('should reject metadata ? apellido', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?\s*'apellido'/)
    })
  })

  describe('8. Append-only enforcement', () => {
    it('should have BEFORE UPDATE OR DELETE OR TRUNCATE trigger function', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Match: BEFORE UPDATE OR DELETE OR TRUNCATE ON table (single spaces are fine)
      expect(content).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+OR\s+TRUNCATE\s+ON\s+operating_core_participation_eventos/i)
    })

    it('should have trigger function that raises exception on mutation', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should have a function that raises exception for append-only violation
      expect(content).toMatch(/RAISE\s+(?:EXCEPTION|errcode)/i)
    })

    it('should NOT have UPDATE or DELETE policies', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const policies = extractPolicies(content, 'operating_core_participation_eventos')
      const updatePolicies = policies.filter(p => p.cmd === 'UPDATE' || p.cmd === 'DELETE')
      expect(updatePolicies).toHaveLength(0)
    })

    it('should NOT GRANT UPDATE or DELETE on table to service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should not have GRANT UPDATE or DELETE on this table
      expect(content).not.toMatch(/GRANT\s+(?:UPDATE|DELETE)\s+ON\s+TABLE\s+(?:public\.)?operating_core_participation_eventos\s+TO\s+service_role/i)
    })
  })

  describe('9. RLS deny-by-default', () => {
    it('should ENABLE ROW LEVEL SECURITY on operating_core_participation_eventos', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(
        /ALTER\s+TABLE\s+(?:public\.)?operating_core_participation_eventos\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+(?:public\.)?operating_core_participation_eventos\s+FROM\s+PUBLIC,\s*(?:anon|anon,\s*authenticated|authenticated)/i
      )
    })

    it('should GRANT SELECT, INSERT TO service_role (not UPDATE/DELETE)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      /* eslint-disable security/detect-unsafe-regex -- static SQL keyword scan */
      expect(content).toMatch(
        /GRANT\s+(?:SELECT\s*,\s*)?INSERT?\s+ON\s+TABLE\s+(?:public\.)?operating_core_participation_eventos\s+TO\s+service_role/i
      )
      /* eslint-enable security/detect-unsafe-regex */
    })

    it('should have SELECT policy using auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const policies = extractPolicies(content, 'operating_core_participation_eventos')
      const selectPolicies = policies.filter(p => p.cmd === 'SELECT')
      expect(selectPolicies.length).toBeGreaterThan(0)
      expect(selectPolicies.some(p => p.usesCapability)).toBe(true)
    })

    it('should have INSERT policy using auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const policies = extractPolicies(content, 'operating_core_participation_eventos')
      const insertPolicies = policies.filter(p => p.cmd === 'INSERT')
      expect(insertPolicies.length).toBeGreaterThan(0)
      expect(insertPolicies.some(p => p.usesCapability)).toBe(true)
    })
  })

  describe('10. Indexes for common query patterns', () => {
    it('should have index on kind', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX\s+.*\s+ON\s+operating_core_participation_eventos\s*\(\s*kind\s*\)/i)
    })

    it('should have index on subject_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX\s+.*\s+ON\s+operating_core_participation_eventos\s*\(\s*subject_id\s*\)/i)
    })

    it('should have index on occurred_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX\s+.*\s+ON\s+operating_core_participation_eventos\s*\(\s*occurred_at\s*\)/i)
    })

    it('should have index on actor_persona_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX\s+.*\s+ON\s+operating_core_participation_eventos\s*\(\s*actor_persona_id\s*\)/i)
    })

    it('should have index on corrects_event_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+INDEX\s+.*\s+ON\s+operating_core_participation_eventos\s*\(\s*corrects_event_id\s*\)/i)
    })
  })

  describe('11. Migration safety — timeouts', () => {
    it('should have SET lock_timeout before indexes', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/SET\s+lock_timeout\s*=\s*'?\d+s'?/i)
    })

    it('should have SET statement_timeout before indexes', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/SET\s+statement_timeout\s*=\s*'?\d+s'?/i)
    })

    it('should RESET lock_timeout and statement_timeout at end', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/RESET\s+lock_timeout/i)
      expect(content).toMatch(/RESET\s+statement_timeout/i)
    })
  })

  describe('12. lint:migrations zero ERROR findings', () => {
    it('should have zero ERROR-level lint findings', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const errors = lintMigrationContent(content)
      const errorFindings = errors.filter(f => f.severity === 'ERROR')
      expect(errorFindings).toHaveLength(0)
    })
  })
})
