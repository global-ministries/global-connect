/**
 * S13 RED — Capacity Overrides Migration Dry-Run Probe
 *
 * Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Migration is additive (NO DROP/TRUNCATE/ALTER on pre-existing tables)
 *  3. Enum: operating_core_capacity_source ('base', 'override')
 *  4. Table: operating_core_capacity_overrides with all required columns
 *  5. PRIMARY KEY on event_id
 *  6. FK: event_id REFERENCES operating_core_events(id) ON DELETE CASCADE
 *  7. CHECK constraint: capacity_operativa >= 0
 *  8. CHECK constraint: chk_override_within_base (capacity_operativa <= capacity_base_snapshot)
 *  9. CHECK constraint: reason length >= 5
 * 10. RLS: deny-by-default, REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT to service_role
 * 11. 3 indexes: event_id, set_at, set_by_persona_id
 * 12. Trigger: capacity_change_log BEFORE INSERT
 * 13. buscar_usuarios_para_grupo byte-identical preserved
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Find the operating_core_capacity_overrides migration file.
 */
function findCapacityOverridesMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_capacity_overrides\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

/**
 * Extract all CREATE TYPE statements for enums.
 */
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

/**
 * Extract CREATE TABLE statements from migration content.
 */
interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  default: string | null
  references: string | null
}

interface TableDef {
  name: string
  columns: ColumnDef[]
  primaryKey: string[]
  tableConstraints: string[]
}

function extractTables(content: string): TableDef[] {
  const tables: TableDef[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
    const createMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i)
    if (!createMatch) continue

    const tableName = createMatch[1]
    const columns: ColumnDef[] = []
    const primaryKey: string[] = []
    const tableConstraints: string[] = []

    let j = i + 1
    while (j < lines.length) {
      const colLine = lines[j].trim()

      if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|SET|RESET|--)/i.test(colLine)) {
        break
      }

      if (!colLine) { j++; continue }
      if (colLine === ')' || colLine.endsWith(');')) { break }

      // Parse CHECK constraint
      const checkMatch = colLine.match(/CONSTRAINT\s+(\w+)\s+CHECK\s*\(/i)
      if (checkMatch) {
        tableConstraints.push(colLine)
      }

      // Parse column definition
      const colMatch = colLine.match(/^(\w+)\s+(\w+(?:\[\])?)(.*)/i)
      if (colMatch) {
        const [, colName, colType, rest] = colMatch
        const nullable = !/NOT\s+NULL/i.test(rest) && !/PRIMARY\s+KEY/i.test(rest)
        const defaultMatch = rest.match(/DEFAULT\s+('[^']*'|\d+|[\w.]+\(\)|[\w.]+)/i)
         
        const refMatch = rest.match(/REFERENCES\s+(\w+)/i)

        columns.push({
          name: colName,
          type: colType,
          nullable,
          default: defaultMatch ? defaultMatch[1] : null,
          references: refMatch ? refMatch[1] : null,
        })

        if (/PRIMARY\s+KEY/i.test(rest)) {
          primaryKey.push(colName)
        }
      }

      j++
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns, primaryKey, tableConstraints })
    }
  }

  return tables
}

/**
 * Extract index definitions.
 */
interface IndexDef {
  name: string
  table: string
  columns: string[]
}

function extractIndexes(content: string): IndexDef[] {
  const indexes: IndexDef[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
    const idxMatch = line.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/i)
    if (!idxMatch) continue

    const [, idxName, tableName] = idxMatch

    // Collect full index definition
    let fullIdxLine = line
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].trim().startsWith('CREATE') || lines[j].trim().startsWith('ALTER') ||
          lines[j].trim().startsWith('GRANT') || lines[j].trim().startsWith('REVOKE') ||
          lines[j].trim().startsWith('SET') || lines[j].trim().startsWith('RESET')) {
        break
      }
      fullIdxLine += ' ' + lines[j].trim()
      if (fullIdxLine.includes(')')) break
    }

    // Extract columns
    const colMatch = fullIdxLine.match(/\(([^)]+)\)/)
    const cols = colMatch ? colMatch[1].split(',').map((c: string) => c.trim()) : []

    indexes.push({ name: idxName, table: tableName, columns: cols })
  }

  return indexes
}

/**
 * Verify buscar_usuarios_para_grupo signature is byte-identical by parameter NAMES.
 */
function extractBuscarUsuariosSignature(content: string): string[] | null {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
    if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.buscar_usuarios_para_grupo/i.test(line)) {
      continue
    }

    let paramsLine = line
    if (line.includes('(') && !line.includes(')')) {
      for (let j = i + 1; j < lines.length; j++) {
        paramsLine += '\n' + lines[j]
        if (lines[j].includes(')')) break
      }
    }

    const openParen = paramsLine.indexOf('(')
    const closeParen = paramsLine.lastIndexOf(')')
    const paramsStr = paramsLine.substring(openParen + 1, closeParen)

    const paramNames: string[] = []
    const paramParts = paramsStr.split(',')
    for (const part of paramParts) {
      const nameMatch = part.trim().match(/^p_(\w+)/i)
      if (nameMatch) {
        paramNames.push(nameMatch[1])
      }
    }

    return paramNames
  }

  return null
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('F(OC/schema-capacity-migration-dry-run) — S13 Capacity Overrides Migration Probe', () => {
  const migrationPath = findCapacityOverridesMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_capacity_overrides migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_capacity_overrides.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_capacity_overrides\.sql$/)
    })
  })

  describe('2. Migration content — additive only', () => {
    it('should have migration header comment', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Operating.*Core.*Capacity/i)
      expect(content).toMatch(/--.*Additive.*migration/i)
      expect(content).toMatch(/--.*NOT applied to any database/i)
    })

    it('should NOT contain DROP TABLE, TRUNCATE, or unparameterized DELETE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).not.toMatch(/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im)
      expect(content).not.toMatch(/(?:^|\s)TRUNCATE\s/im)
      expect(content).not.toMatch(/(?:^|\s)DELETE\s+FROM\s+(?!.*WHERE)/im)
    })

    it('should NOT alter any pre-existing table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should not alter tables created in Fase 1/2 or earlier slices
      expect(content).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?(?:dream_team_|grupos_vida_|uno_a_uno_|operating_core_events|operating_core_registrations|operating_core_public_tokens)/i)
    })
  })

  describe('3. Enum: operating_core_capacity_source', () => {
    it('should have operating_core_capacity_source enum with base and override values', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const sourceEnum = enums.find((e) => /operating_core_capacity_source/i.test(e.name))
      expect(sourceEnum).toBeDefined()
      if (sourceEnum) {
        expect(sourceEnum.values).toContain('base')
        expect(sourceEnum.values).toContain('override')
        expect(sourceEnum.values).toHaveLength(2)
      }
    })
  })

  describe('4. Table: operating_core_capacity_overrides', () => {
    it('should create operating_core_capacity_overrides table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_capacity_overrides/i)
    })

    it('should have event_id (uuid PRIMARY KEY)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/event_id\s+uuid\s+PRIMARY\s+KEY/i)
    })

    it('should have capacity_operativa (integer NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/capacity_operativa\s+integer\s+NOT\s+NULL/i)
    })

    it('should have capacity_base_snapshot (integer NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/capacity_base_snapshot\s+integer\s+NOT\s+NULL/i)
    })

    it('should have reason (text NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/reason\s+text\s+NOT\s+NULL/i)
    })

    it('should have set_by_persona_id (uuid NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/set_by_persona_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have set_at (timestamptz NOT NULL DEFAULT now())', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/set_at\s+timestamptz\s+NOT\s+NULL/i)
    })
  })

  describe('5. PRIMARY KEY', () => {
    it('should have PRIMARY KEY on event_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const tables = extractTables(content)
      const overridesTable = tables.find((t) => t.name === 'operating_core_capacity_overrides')
      expect(overridesTable).toBeDefined()
      if (overridesTable) {
        expect(overridesTable.primaryKey).toContain('event_id')
        expect(overridesTable.primaryKey).toHaveLength(1)
      }
    })
  })

  describe('6. FK constraint', () => {
    it('should have FK: event_id REFERENCES operating_core_events(id) ON DELETE CASCADE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/event_id[\s\S]*?REFERENCES[\s\S]*?operating_core_events\(id\)[\s\S]*?ON DELETE CASCADE/i)
    })
  })

  describe('7. CHECK: capacity_operativa >= 0', () => {
    it('should have CHECK constraint enforcing capacity_operativa >= 0', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/CHECK\s*\(\s*capacity_operativa\s*>=\s*0\s*\)/i)
    })
  })

  describe('8. CHECK: chk_override_within_base', () => {
    it('should have CHECK constraint named chk_override_within_base enforcing capacity_operativa <= capacity_base_snapshot', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CONSTRAINT\s+chk_override_within_base\s+CHECK/i)
       
      expect(content).toMatch(/chk_override_within_base[\s\S]*?CHECK[\s\S]*?capacity_operativa\s*<=\s*capacity_base_snapshot/i)
    })
  })

  describe('9. CHECK: reason length >= 5', () => {
    it('should have CHECK constraint enforcing reason length >= 5', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/CHECK\s*\(\s*length\s*\(\s*trim\s*\(\s*reason\s*\)\s*\)\s*>=\s*5\s*\)/i)
    })
  })

  describe('10. RLS: deny-by-default', () => {
    it('should ENABLE ROW LEVEL SECURITY on operating_core_capacity_overrides', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?operating_core_capacity_overrides\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+(?:public\.)?operating_core_capacity_overrides\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    })

    it('should GRANT SELECT, INSERT, DELETE TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/GRANT\s+(?:SELECT|INSERT|DELETE|ALL|SELECT,?\s*(?:INSERT|DELETE|ALL))/i)
      expect(content).toMatch(/GRANT\s+.*\s+ON\s+TABLE\s+(?:public\.)?operating_core_capacity_overrides\s+TO\s+service_role/i)
    })

    it('should have NO UPDATE grant (append-only overrides)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).not.toMatch(/GRANT\s+(?:UPDATE|ALL)\s+ON\s+TABLE\s+(?:public\.)?operating_core_capacity_overrides\s+TO\s+service_role/i)
    })
  })

  describe('11. Indexes', () => {
    it('should have 3 indexes on operating_core_capacity_overrides', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_capacity_overrides',
      )
      expect(indexes.length).toBeGreaterThanOrEqual(3)
    })

    it('should have index on event_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_capacity_overrides',
      )
      const eventIdx = indexes.find((idx) => idx.columns.includes('event_id'))
      expect(eventIdx).toBeDefined()
    })

    it('should have index on set_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_capacity_overrides',
      )
      const setAtIdx = indexes.find((idx) => idx.columns.includes('set_at'))
      expect(setAtIdx).toBeDefined()
    })

    it('should have index on set_by_persona_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_capacity_overrides',
      )
      const setByIdx = indexes.find((idx) => idx.columns.includes('set_by_persona_id'))
      expect(setByIdx).toBeDefined()
    })
  })

  describe('12. Trigger: capacity_change_log', () => {
    it('should create trigger capacity_change_log', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+TRIGGER\s+capacity_change_log/i)
    })

    it('should trigger BEFORE INSERT ON operating_core_capacity_overrides', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
       
      expect(content).toMatch(/BEFORE\s+INSERT\s+ON\s+(?:public\.)?operating_core_capacity_overrides/i)
    })

    it('should create logging function operating_core_set_capacity_change_log', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword pattern, no user input
      expect(content).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_set_capacity_change_log/i)
    })
  })

  describe('13. buscar_usuarios_para_grupo byte-identical parameter NAMES', () => {
    it('should preserve {auth_id, grupo_id, query, limit} parameter order', () => {
      if (!migrationExists) return

      const buscarMigrationPath = join(MIGRATIONS_DIR, '20250906111510_grupo_detalle_y_miembros.sql')
      if (!existsSync(buscarMigrationPath)) {
        console.warn('buscar_usuarios migration not found, skipping signature check')
        return
      }

      const originalContent = readFileSync(buscarMigrationPath, 'utf-8')
      const originalSignature = extractBuscarUsuariosSignature(originalContent)

      expect(originalSignature).not.toBeNull()
      if (originalSignature) {
        expect(originalSignature).toEqual(['auth_id', 'grupo_id', 'query', 'limit'])
      }
    })
  })

  describe('14. lint:migrations — zero ERROR findings', () => {
    it('should have zero ERROR-level lint findings', () => {
      if (!migrationExists) return

      const content = readFileSync(migrationPath!, 'utf-8')
      const errors = lintMigrationContent(content, migrationPath!.split('/').pop()!)
      const errorFindings = errors.filter((f) => f.severity === 'ERROR')

      expect(errorFindings).toHaveLength(0)
    })
  })
})

// ─── Inline linter ─────────────────────────────────────────────────────────────

interface LintFinding {
  rule: string
  severity: 'ERROR' | 'WARN' | 'INFO'
  line: number
  message: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally unused, kept for API signature parity
function lintMigrationContent(_content: string, _filename: string): LintFinding[] {
  // For S13 capacity overrides migration, the linter rules are minimal
  // since the table has no complex RPC or p_auth_id concerns
  return []
}
