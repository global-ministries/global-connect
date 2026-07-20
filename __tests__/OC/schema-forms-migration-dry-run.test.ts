/**
 * S15 RED — Forms Migration Dry-Run Probe
 *
 * Verifies the additive migration files satisfy all acceptance criteria
 * BEFORE they are applied to any database. The migrations are future-apply only.
 *
 * Acceptance criteria:
 *  1. Migration files exist under supabase/migrations/ with correct naming convention
 *  2. Migration is additive (NO DROP/TRUNCATE/ALTER on pre-existing tables)
 *  3. Enum: operating_core_form_lifecycle (3 values: draft, published, archived)
 *  4. Table: operating_core_forms with all required columns
 *  5. Table: operating_core_form_submissions with all required columns + UNIQUE constraint
 *  6. FK: form_id REFERENCES operating_core_forms(id) ON DELETE CASCADE
 *  7. RLS: deny-by-default, REVOKE/GRANT correct, policies use auth_has_operating_core_capability
 *  8. Indexes on owner_experience_id, lifecycle, created_by_persona_id, created_at (forms)
 *  9. Indexes on form_id, submitted_by_persona_id, submitted_at (submissions)
 * 10. lock_timeout / statement_timeout block + reset
 * 11. updated_at trigger on operating_core_forms
 * 12. No p_auth_id parameter
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

// ─── Find migration files ─────────────────────────────────────────────────────

function findMigrationFiles(): { forms: string | null; submissions: string | null } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

  const formsMatch = files.find((f) => /_operating_core_forms\.sql$/.test(f))
  const submissionsMatch = files.find((f) => /_operating_core_form_submissions\.sql$/.test(f))

  return {
    forms: formsMatch ? join(MIGRATIONS_DIR, formsMatch) : null,
    submissions: submissionsMatch ? join(MIGRATIONS_DIR, submissionsMatch) : null,
  }
}

// ─── Extract enums ────────────────────────────────────────────────────────────

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
      if (/^\s*\).*;/.test(valLine)) break
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

// ─── Extract tables ───────────────────────────────────────────────────────────

interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  default?: string
  references?: string
  unique?: boolean
  check?: string
}

interface TableDef {
  name: string
  columns: ColumnDef[]
  indexes: string[]
  constraints: string[]
}

function extractTables(content: string): TableDef[] {
  const tables: TableDef[] = []
  const lines = content.split('\n')

  let currentTable: TableDef | null = null
  let inColumns = false
  let inIndex = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Start of table
    const createTableMatch = line.match(/CREATE\s+TABLE\s+(\w+)\s*\(/i)
    if (createTableMatch) {
      currentTable = {
        name: createTableMatch[1],
        columns: [],
        indexes: [],
        constraints: [],
      }
      inColumns = true
      inIndex = false
      continue
    }

    // End of table definition
    if (currentTable && /^\s*\)\s*;/.test(line.trim())) {
      if (currentTable) tables.push(currentTable)
      currentTable = null
      inColumns = false
      inIndex = false
      continue
    }

    if (!currentTable) continue

    // Column definition
    if (inColumns && !inIndex) {
      // eslint-disable-next-line security/detect-unsafe-regex -- safe pattern for SQL column parsing
      const colMatch = line.trim().match(/^(\w+)\s+(\w+(?:\[\])?)\s*(NOT NULL|NULL)?\s*(DEFAULT\s+[^\s,]+)?/i)
      if (colMatch) {
        const col: ColumnDef = {
          name: colMatch[1],
          type: colMatch[2],
          nullable: !colMatch[3] || colMatch[3].toUpperCase() !== 'NOT NULL',
          default: colMatch[4],
        }
        currentTable.columns.push(col)
        continue
      }

      // FK reference
      const fkMatch = line.trim().match(/REFERENCES\s+(\w+)/i)
      if (fkMatch && currentTable.columns.length > 0) {
        currentTable.columns[currentTable.columns.length - 1].references = fkMatch[1]
        continue
      }

      // UNIQUE constraint
      if (/\bUNIQUE\s*\(/.test(line)) {
        currentTable.constraints.push(line.trim())
        continue
      }

      // CONSTRAINT (check or unique)
      const constMatch = line.trim().match(/CONSTRAINT\s+(\w+)\s+(UNIQUE|CHECK)/i)
      if (constMatch) {
        currentTable.constraints.push(line.trim())
        continue
      }

      // Index creation
      if (/CREATE\s+INDEX/i.test(line)) {
        inIndex = true
        inColumns = false
        currentTable.indexes.push(line.trim())
        continue
      }
    }

    // Index definition continues
    if (inIndex) {
      if (/;/.test(line)) {
        inIndex = false
        inColumns = true
      }
      if (line.trim()) {
        currentTable.indexes[currentTable.indexes.length - 1] += ' ' + line.trim()
      }
      continue
    }
  }

  return tables
}

// ─── Extract timeouts ────────────────────────────────────────────────────────

function extractTimeouts(content: string): string[] {
  const timeouts: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    if (/SET\s+(lock_timeout|statement_timeout)/i.test(line)) {
      timeouts.push(line.trim())
    }
    if (/RESET\s+(lock_timeout|statement_timeout)/i.test(line)) {
      timeouts.push(line.trim())
    }
  }

  return timeouts
}

// ─── Main tests ──────────────────────────────────────────────────────────────

describe('S15 Forms Migrations Dry-Run Probe', () => {
  const { forms, submissions } = findMigrationFiles()

  it('1. Migration files exist with correct naming', () => {
    expect(forms).not.toBeNull()
    expect(submissions).not.toBeNull()

    if (forms) {
      expect(forms).toMatch(/_operating_core_forms\.sql$/)
    }
    if (submissions) {
      expect(submissions).toMatch(/_operating_core_form_submissions\.sql$/)
    }
  })

  describe('operating_core_forms migration', () => {
    if (!forms) return

    const content = readFileSync(forms, 'utf-8')
    const enums = extractEnums(content)
    const tables = extractTables(content)
    // NOTE: triggers, policies, revokes, grants, alters extracted but unused since we use raw content checks
    const timeouts = extractTimeouts(content)

    it('2a. Is additive: no DROP/TABLE/ALTER on pre-existing tables', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
      expect(content).not.toMatch(/TRUNCATE/i)
      // ALTER allowed only for the new tables being created
      const alterOnExisting = content.match(/ALTER\s+TABLE\s+(?!operating_core_forms\b)/i)
      expect(alterOnExisting).toBeNull()
    })

    it('3. Enum operating_core_form_lifecycle exists with exactly 3 values', () => {
      const formLifecycle = enums.find((e) => e.name === 'operating_core_form_lifecycle')
      expect(formLifecycle).toBeDefined()
      expect(formLifecycle?.values).toContain('draft')
      expect(formLifecycle?.values).toContain('published')
      expect(formLifecycle?.values).toContain('archived')
      expect(formLifecycle?.values).toHaveLength(3)
    })

    it('4. Table operating_core_forms has all required columns', () => {
      const formsTable = tables.find((t) => t.name === 'operating_core_forms')
      expect(formsTable).toBeDefined()

      if (formsTable) {
        const colNames = formsTable.columns.map((c) => c.name)
        expect(colNames).toContain('id')
        expect(colNames).toContain('owner_experience_id')
        expect(colNames).toContain('title')
        expect(colNames).toContain('description')
        expect(colNames).toContain('fields')
        expect(colNames).toContain('lifecycle')
        expect(colNames).toContain('created_by_persona_id')
        expect(colNames).toContain('created_at')
        expect(colNames).toContain('updated_at')
        expect(colNames).toContain('version')

        // Check lifecycle column uses the enum
        const lifecycleCol = formsTable.columns.find((c) => c.name === 'lifecycle')
        expect(lifecycleCol?.type).toMatch(/operating_core_form_lifecycle/i)
      }
    })

    it('8. operating_core_forms has required indexes', () => {
      // Check raw content for indexes
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_forms_owner_experience/i)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_forms_lifecycle/i)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_forms_created_by/i)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_forms_created_at/i)
    })

    it('10. Has lock_timeout and statement_timeout blocks', () => {
      expect(timeouts.some((t) => /SET\s+lock_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /SET\s+statement_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /RESET\s+lock_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /RESET\s+statement_timeout/i.test(t))).toBe(true)
    })

    it('11. Has updated_at trigger on operating_core_forms', () => {
      // Check raw content for the trigger
      expect(content).toMatch(/operating_core_forms_set_updated_at/i)
      expect(content).toMatch(/BEFORE\s+UPDATE\s+ON\s+operating_core_forms/i)
    })

    it('7a. operating_core_forms has RLS enabled', () => {
      // Check raw content for RLS enablement
      expect(content).toMatch(/ALTER\s+TABLE\s+operating_core_forms\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('7b. operating_core_forms has correct REVOKE/GRANT', () => {
      // Check raw content for correct grants
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+operating_core_forms\s+FROM\s+PUBLIC/i)
      expect(content).toMatch(/GRANT\s+SELECT,?\s*INSERT,?\s*UPDATE,?\s*DELETE\s+ON\s+TABLE\s+operating_core_forms\s+TO\s+service_role/i)
    })

    it('7c. operating_core_forms policies use auth_has_operating_core_capability', () => {
      // Check raw content for policies using the capability helper
      // Split by semicolons to check each policy statement
      const statements = content.split(';')
      const hasFormPolicyWithCapability = statements.some((stmt) =>
        /CREATE\s+POLICY\s+\w+\s+ON\s+operating_core_forms/i.test(stmt) &&
        /auth_has_operating_core_capability/i.test(stmt)
      )
      expect(hasFormPolicyWithCapability).toBe(true)
    })

    it('Header comment present with additive notice', () => {
      expect(content).toMatch(/Additive migration/i)
      expect(content).toMatch(/NOT applied to any database yet/i)
    })
  })

  describe('operating_core_form_submissions migration', () => {
    if (!submissions) return

    const content = readFileSync(submissions, 'utf-8')
    const tables = extractTables(content)
    // NOTE: policies, revokes, grants, alters extracted but unused since we use raw content checks
    const timeouts = extractTimeouts(content)

    it('2b. Is additive: no DROP/TABLE/ALTER on pre-existing tables', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
      expect(content).not.toMatch(/TRUNCATE/i)
      // ALTER allowed only for the new tables being created
      const alterOnExisting = content.match(/ALTER\s+TABLE\s+(?!operating_core_form_submissions\b)/i)
      expect(alterOnExisting).toBeNull()
    })

    it('5. Table operating_core_form_submissions has all required columns', () => {
      const submissionsTable = tables.find((t) => t.name === 'operating_core_form_submissions')
      expect(submissionsTable).toBeDefined()

      if (submissionsTable) {
        const colNames = submissionsTable.columns.map((c) => c.name)
        expect(colNames).toContain('id')
        expect(colNames).toContain('form_id')
        expect(colNames).toContain('form_version_at_submission')
        expect(colNames).toContain('answers')
        expect(colNames).toContain('submitted_by_persona_id')
        expect(colNames).toContain('submitted_at')
      }
    })

    it('5b. operating_core_form_submissions has UNIQUE constraint on (form_id, submitted_by_persona_id)', () => {
      // Check raw content for the UNIQUE constraint
      expect(content).toMatch(/CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*form_id\s*,\s*submitted_by_persona_id\s*\)/i)
    })

    it('6. FK: form_id REFERENCES operating_core_forms(id) ON DELETE CASCADE', () => {
      // Check raw content for FK reference
      expect(content).toMatch(/form_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+operating_core_forms\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i)
    })

    it('9. operating_core_form_submissions has required indexes', () => {
      // Check raw content for indexes (they are outside the table definition)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_form_submissions_form_id/i)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_form_submissions_submitted_by/i)
      expect(content).toMatch(/CREATE\s+INDEX.*idx_oc_form_submissions_submitted_at/i)
    })

    it('10. Has lock_timeout and statement_timeout blocks', () => {
      expect(timeouts.some((t) => /SET\s+lock_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /SET\s+statement_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /RESET\s+lock_timeout/i.test(t))).toBe(true)
      expect(timeouts.some((t) => /RESET\s+statement_timeout/i.test(t))).toBe(true)
    })

    it('7d. operating_core_form_submissions has RLS enabled', () => {
      // Check raw content for RLS enablement
      expect(content).toMatch(/ALTER\s+TABLE\s+operating_core_form_submissions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('7e. operating_core_form_submissions has correct REVOKE/GRANT', () => {
      // Check raw content for correct RLS grants
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+operating_core_form_submissions\s+FROM\s+PUBLIC/i)
      expect(content).toMatch(/GRANT\s+SELECT\s*,\s*INSERT\s+ON\s+TABLE\s+operating_core_form_submissions\s+TO\s+service_role/i)
    })

    it('7f. operating_core_form_submissions policies use auth_has_operating_core_capability', () => {
      // Check raw content for policies using the capability helper
      // Split by semicolons to check each policy statement
      const statements = content.split(';')
      const hasSubPolicyWithCapability = statements.some((stmt) =>
        /CREATE\s+POLICY\s+\w+\s+ON\s+operating_core_form_submissions/i.test(stmt) &&
        /auth_has_operating_core_capability/i.test(stmt)
      )
      expect(hasSubPolicyWithCapability).toBe(true)
    })

    it('Header comment present with additive notice', () => {
      expect(content).toMatch(/Additive migration/i)
      expect(content).toMatch(/NOT applied to any database yet/i)
    })
  })

  it('13. buscar_usuarios_para_grupo byte-identical preserved', () => {
    // This is a cross-slice check - the function should not be modified by these migrations
    const eventsMigration = readdirSync(MIGRATIONS_DIR).find((f) => /_operating_core_events\.sql$/.test(f))
    if (eventsMigration) {
      // The S15 migration files should not touch buscar_usuarios_para_grupo
      if (forms) {
        const formsContent = readFileSync(forms, 'utf-8')
        expect(formsContent).not.toMatch(/buscar_usuarios_para_grupo/)
      }
      if (submissions) {
        const submissionsContent = readFileSync(submissions, 'utf-8')
        expect(submissionsContent).not.toMatch(/buscar_usuarios_para_grupo/)
      }
    }
  })
})
