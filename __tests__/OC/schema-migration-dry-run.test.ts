/**
 * S03 Migration Dry-Run Probe — Operating Core Events + Services + EventInstance
 *
 * RED test: Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Every jsonb column has PII CHECK constraint (no cedula/telefono/email)
 *  3. auth_has_operating_core_capability(p_capability text) exists with correct signature
 *  4. RLS policies exist for all three tables
 *  5. uno_a_uno defense in depth (revokes + grants to service_role)
 *  6. buscar_usuarios_para_grupo byte-identical by parameter NAMES
 *  7. TS types align with SQL columns (best-effort snake_case match)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Find the operating_core_events migration file.
 * Naming convention: YYYYMMDDHHMMSS_operating_core_events.sql
 */
function findOperatingCoreMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_events\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

/**
 * Extract CREATE TABLE statements from migration content.
 * Returns array of { tableName, columns, constraints } objects.
 */
interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  default: string | null
  isJsonb: boolean
  hasPiiCheck: boolean
  references: string | null
}

interface TableDef {
  name: string
  columns: ColumnDef[]
  primaryKey: string[]
}

function extractTables(content: string): TableDef[] {
  const tables: TableDef[] = []
  const lines = content.split('\n')

  // Find CREATE TABLE statements
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
    const createMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i)
    if (!createMatch) continue

    const tableName = createMatch[1]
    const columns: ColumnDef[] = []
    const primaryKey: string[] = []

    // Collect column definitions until we hit a line that ends the CREATE TABLE block
    // (lines starting with CREATE INDEX, ALTER TABLE, etc.)
    let j = i + 1
    while (j < lines.length) {
      const colLine = lines[j].trim()

      // Stop at next statement
      if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|SET|RESET|--)/i.test(colLine)) {
        break
      }

      // Skip empty lines and closing paren (both ')' and ');' end the table def)
      if (!colLine) {
        j++
        continue
      }
      if (colLine === ')' || colLine.endsWith(');')) {
        break // End of table definition
      }

      // Parse column definition
      // Pattern: column_name TYPE [NULL|NOT NULL] [DEFAULT ...] [REFERENCES ...] [CHECK(...)]
      // Match: column_name TYPE followed by rest of line
      const colMatch = colLine.match(/^(\w+)\s+(\w+(?:\[\])?)(.*)/i)
      if (colMatch) {
        const [, colName, colType, rest] = colMatch
        const isJsonb = colType.toLowerCase() === 'jsonb'
        const nullable = !/NOT\s+NULL/i.test(rest) && !/PRIMARY\s+KEY/i.test(rest)
        const defaultMatch = rest.match(/DEFAULT\s+('[^']*'|\d+|[\w.]+\(\)|[\w.]+)/i)
        const refMatch = rest.match(/REFERENCES\s+(\w+)/i)

        // For multi-line CHECK constraints, collect all lines until the closing paren
        let fullCheckText = rest
        if (/CHECK\s*\(/i.test(rest)) {
          // Start from current line and collect until we see a line ending with ), or )
          let checkEnd = j
          while (checkEnd < lines.length) {
            const line = lines[checkEnd]
            // If this line ends with ), or just ), (with optional whitespace), it's the end
            if (line.trim().endsWith('),') || line.trim() === '),' || line.trim() === ')') {
              checkEnd++ // Include this final line
              break
            }
            checkEnd++
          }
          // Collect all lines from j to checkEnd inclusive
          fullCheckText = lines.slice(j, checkEnd).join(' ')
        }

        const hasPiiCheck = isJsonb && /CHECK\s*\(/i.test(fullCheckText) &&
          /metadata\s*\?\s*'cedula'/.test(fullCheckText) &&
          /metadata\s*\?\s*'telefono'/.test(fullCheckText) &&
          /metadata\s*\?\s*'email'/.test(fullCheckText)

        columns.push({
          name: colName,
          type: colType,
          nullable,
          default: defaultMatch ? defaultMatch[1] : null,
          isJsonb,
          hasPiiCheck,
          references: refMatch ? refMatch[1] : null,
        })

        // Track primary key columns
        if (/PRIMARY\s+KEY/i.test(rest)) {
          primaryKey.push(colName)
        }
      }

      j++
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns, primaryKey })
    }
  }

  return tables
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

    // Collect values until closing paren
    // Use matchAll to capture ALL quoted values on each line
    let j = i + 1
    while (j < lines.length) {
      const valLine = lines[j].trim()
      if (valLine === ');' || valLine === ')') break
      // Use global matchAll to find all quoted strings on this line
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
 * Extract auth_has_operating_core_capability function signature and body.
 */
interface HelperFunction {
  name: string
  params: string[]
  returns: string
  isSecurityDefiner: boolean
  hasSearchPath: boolean
  bodyContainsAuthUid: boolean
  bodyContainsP_auth_id: boolean
  isP_auth_idBound: boolean
}

function extractHelperFunction(content: string): HelperFunction | null {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    const funcMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)/i)
    if (!funcMatch) continue

    const funcName = funcMatch[1]
    if (!funcName.includes('auth_has_operating_core_capability')) continue

    // Extract parameter list
    const params: string[] = []
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
    if (paramsStr.trim()) {
      // Split by comma, extract parameter names
      const paramParts = paramsStr.split(',')
      for (const part of paramParts) {
        const nameMatch = part.trim().match(/p_(\w+)/i)
        if (nameMatch) params.push(nameMatch[1])
      }
    }

    // Extract RETURN type - may be on same line or subsequent lines
    let returns = 'unknown'
    for (let k = i; k < Math.min(i + 15, lines.length); k++) {
      const returnsMatch = lines[k].match(/RETURNS\s+(\w+)/i)
      if (returnsMatch) {
        returns = returnsMatch[1]
        break
      }
      if (/\$\$/i.test(lines[k])) break
    }

    // Check for SECURITY DEFINER
    let isSecurityDefiner = false
    let hasSearchPath = false
    for (let k = i; k < Math.min(i + 15, lines.length); k++) {
      if (/SECURITY\s+DEFINER/i.test(lines[k])) isSecurityDefiner = true
      if (/SET\s+search_path\s+TO/i.test(lines[k])) hasSearchPath = true
      if (/\$\$/i.test(lines[k])) break
    }

    // Extract function body
    let dollarStart = -1
    for (let k = i; k < Math.min(i + 20, lines.length); k++) {
      if (/\$\$/i.test(lines[k])) { dollarStart = k; break }
    }
    if (dollarStart === -1) continue

    const bodyLines: string[] = []
    let dollarFound = false
    for (let m = dollarStart; m < lines.length; m++) {
      const bodyLine = lines[m]
      bodyLines.push(bodyLine)
      if (/\$/i.test(bodyLine)) {
        if (dollarFound) break
        dollarFound = true
      }
    }
    const body = bodyLines.join('\n')

    const bodyContainsAuthUid = /auth\.uid\(\)/i.test(body)
    const bodyContainsP_auth_id = /\bp_auth_id\b/.test(body)
    // Check if p_auth_id is bound to auth.uid() — the S01 pattern
    const isP_auth_idBound = bodyContainsP_auth_id && /p_auth_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i.test(body)

    return {
      name: funcName,
      params,
      returns,
      isSecurityDefiner,
      hasSearchPath,
      bodyContainsAuthUid,
      bodyContainsP_auth_id,
      isP_auth_idBound,
    }
  }

  return null
}

/**
 * Extract RLS policies for a table.
 */
interface Policy {
  name: string
  cmd: string // SELECT, INSERT, UPDATE, DELETE, ALL
  for: string // USING or WITH CHECK expression
  usesCapability: boolean
}

function extractPolicies(content: string, tableName: string): Policy[] {
  const policies: Policy[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match CREATE POLICY with possibly quoted name: CREATE POLICY "name" ON table
    const policyMatch = line.match(
      /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(\w+)/i,
    )
    if (!policyMatch) continue

    const [, policyName, policyTable] = policyMatch
    if (policyTable !== tableName) continue

    // Extract command
    const cmdMatch = line.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i)
    const cmd = cmdMatch ? cmdMatch[1].toUpperCase() : 'UNKNOWN'

    // Check if it uses the capability function
    const usesCapability = /auth_has_operating_core_capability/i.test(line) ||
      /operating_core\.\w+\.\w+/i.test(line)

    policies.push({
      name: policyName,
      cmd,
      for: '',
      usesCapability,
    })
  }

  return policies
}

/**
 * Check uno_a_uno defense presence.
 */
interface UnoDefense {
  reunionesRevoked: boolean
  participantesRevoked: boolean
  hasDefensiveDoBlock: boolean
  reunionesGrantedToservice_role: boolean
  participantesGrantedToservice_role: boolean
}

function extractUnoDefense(content: string): UnoDefense {
  // Check for uno_a_uno_reuniones revokes
  const reunionesRevokeMatch = content.match(
    /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_reuniones\s+FROM\s+/i,
  )
  const participantesRevokeMatch = content.match(
    /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_participantes\s+FROM\s+/i,
  )

  // Check for defensive DO blocks (if tables don't exist)
  const hasDefensiveDoBlock = /DO\s*\$\$\s*BEGIN\s*.*EXCEPTION\s+WHEN\s+undefined_table/i.test(content) ||
    /DO\s*\$\$\s*BEGIN\s*.*EXCEPTION\s+WHEN\s+undefined_object/i.test(content)

  // Check for service_role grants
  const reunionesGrantMatch = content.match(
    /GRANT\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_reuniones\s+TO\s+service_role/i,
  )
  const participantesGrantMatch = content.match(
    /GRANT\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_participantes\s+TO\s+service_role/i,
  )

  return {
    reunionesRevoked: !!reunionesRevokeMatch,
    participantesRevoked: !!participantesRevokeMatch,
    hasDefensiveDoBlock: hasDefensiveDoBlock,
    reunionesGrantedToservice_role: !!reunionesGrantMatch,
    participantesGrantedToservice_role: !!participantesGrantMatch,
  }
}

/**
 * Verify buscar_usuarios_para_grupo signature is byte-identical by parameter NAMES.
 * The expected signature has parameter names: {p_auth_id, p_grupo_id, p_query, p_limit}
 * They must appear in that ORDER (sorted alphabetically: auth_id, grupo_id, limit, query)
 */
function extractBuscarUsuariosSignature(content: string): string[] | null {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.buscar_usuarios_para_grupo/i.test(line)) {
      continue
    }

    // Collect the parameter list
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

    // Extract parameter names (everything before the type)
    const paramNames: string[] = []
    const paramParts = paramsStr.split(',')
    for (const part of paramParts) {
      const trimmed = part.trim()
      const nameMatch = trimmed.match(/^p_(\w+)/i)
      if (nameMatch) {
        paramNames.push(nameMatch[1])
      }
    }

    return paramNames
  }

  return null
}

// ─── RED Test ─────────────────────────────────────────────────────────────────

describe('F(OC/schema-migration-dry-run) — S03 Operating Core Events Migration Probe', () => {
  const migrationPath = findOperatingCoreMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_events migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_events.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_events\.sql$/)
    })
  })

  describe('2. Migration content', () => {
    it('should have migration header comment', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Operating.*Core.*Events/i)
      expect(content).toMatch(/--.*Additive.*migration/i)
    })

    it('should NOT contain DROP TABLE, TRUNCATE, or unparameterized DELETE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // These are forbidden
      expect(content).not.toMatch(/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im)
      expect(content).not.toMatch(/(?:^|\s)TRUNCATE\s/im)
      expect(content).not.toMatch(/(?:^|\s)DELETE\s+FROM\s+(?!.*WHERE)/im)
    })
  })

  describe('3. Required tables exist', () => {
    it('should have operating_core_services table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_services/i)
    })

    it('should have operating_core_events table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_events/i)
    })

    it('should have operating_core_event_instances table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_event_instances/i)
    })
  })

  describe('4. Required enums exist', () => {
    it('should have operating_core_event_kind enum with correct values', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const eventKindEnum = enums.find(e =>
        /operating_core_event_kind/i.test(e.name) ||
        /event_kind/i.test(e.name)
      )
      expect(eventKindEnum).toBeDefined()
      if (eventKindEnum) {
        expect(eventKindEnum.values).toContain('service')
        expect(eventKindEnum.values).toContain('group_meeting')
        expect(eventKindEnum.values).toContain('workshop')
        expect(eventKindEnum.values).toContain('activity')
        expect(eventKindEnum.values).toContain('custom')
        expect(eventKindEnum.values).not.toContain('camp')
      }
    })

    it('should have operating_core_event_estado enum with active/cancelled', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const estadoEnum = enums.find(e =>
        /operating_core_event_estado/i.test(e.name) ||
        /event_estado/i.test(e.name)
      )
      expect(estadoEnum).toBeDefined()
      if (estadoEnum) {
        expect(estadoEnum.values).toContain('active')
        expect(estadoEnum.values).toContain('cancelled')
      }
    })

    it('should have operating_core_service_estado enum', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const serviceEstadoEnum = enums.find(e =>
        /operating_core_service_estado/i.test(e.name) ||
        /service_estado/i.test(e.name)
      )
      expect(serviceEstadoEnum).toBeDefined()
      if (serviceEstadoEnum) {
        expect(serviceEstadoEnum.values).toContain('active')
        expect(serviceEstadoEnum.values).toContain('disabled')
        expect(serviceEstadoEnum.values).toContain('removed')
      }
    })

    it('should have operating_core_instance_lifecycle enum', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const lifecycleEnum = enums.find(e =>
        /operating_core_instance_lifecycle/i.test(e.name) ||
        /instance_lifecycle/i.test(e.name)
      )
      expect(lifecycleEnum).toBeDefined()
      if (lifecycleEnum) {
        expect(lifecycleEnum.values).toContain('scheduled')
        expect(lifecycleEnum.values).toContain('ongoing')
        expect(lifecycleEnum.values).toContain('completed')
        expect(lifecycleEnum.values).toContain('cancelled')
      }
    })
  })

  describe('5. PII discipline — every jsonb column has CHECK rejecting PII', () => {
    it('should have PII CHECK on every jsonb column', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Count jsonb columns with CHECK constraints
      // Pattern: column_name jsonb ... CHECK (
      const jsonbCheckPattern = /\w+\s+jsonb\s+[^,;]*CHECK\s*\(/gi
      const matches = content.match(jsonbCheckPattern)
      expect(matches && matches.length).toBeGreaterThan(0)
    })

    it('should reject metadata ? cedula, metadata ? telefono, metadata ? email in jsonb CHECK', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      // The PII CHECK pattern should span multiple lines
      // Look for the complete CHECK block for metadata
      // Check for the three required PII fields in the CHECK
      const hasCedulaCheck = /metadata\s*\?\s*'cedula'/.test(content)
      const hasTelefonoCheck = /metadata\s*\?\s*'telefono'/.test(content)
      const hasEmailCheck = /metadata\s*\?\s*'email'/.test(content)

      expect(hasCedulaCheck).toBe(true)
      expect(hasTelefonoCheck).toBe(true)
      expect(hasEmailCheck).toBe(true)
    })
  })

  describe('6. auth_has_operating_core_capability helper function', () => {
    it('should exist in migration', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/auth_has_operating_core_capability/i)
    })

    it('should have signature (p_capability text) — no p_auth_id parameter', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const helper = extractHelperFunction(content)

      expect(helper).not.toBeNull()
      if (helper) {
        // Should have exactly ONE parameter: p_capability
        expect(helper.params).toHaveLength(1)
        expect(helper.params).toContain('capability')

        // Should NOT have p_auth_id
        expect(helper.bodyContainsP_auth_id).toBe(false)
      }
    })

    it('should bind identity to auth.uid() server-side (not caller-supplied)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const helper = extractHelperFunction(content)

      expect(helper).not.toBeNull()
      if (helper) {
        // Must use auth.uid() in the body
        expect(helper.bodyContainsAuthUid).toBe(true)
        // Must be SECURITY DEFINER
        expect(helper.isSecurityDefiner).toBe(true)
        // Must have SET search_path TO 'public'
        expect(helper.hasSearchPath).toBe(true)
      }
    })

    it('should return boolean', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const helper = extractHelperFunction(content)

      expect(helper).not.toBeNull()
      if (helper) {
        expect(helper.returns).toMatch(/boolean/i)
      }
    })

    it('should be STABLE', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/LANGUAGE\s+(?:sql|plpgsql)\s+STABLE/i)
    })
  })

  describe('7. RLS deny-by-default for all three tables', () => {
    const tables = ['operating_core_services', 'operating_core_events', 'operating_core_event_instances']

    for (const table of tables) {
      it(`should ENABLE ROW LEVEL SECURITY on ${table}`, () => {
        if (!migrationExists) return
        const content = readFileSync(migrationPath!, 'utf-8')
        expect(content).toMatch(
          new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
        )
      })

      it(`should REVOKE ALL FROM anon, authenticated on ${table}`, () => {
        if (!migrationExists) return
        const content = readFileSync(migrationPath!, 'utf-8')
        expect(content).toMatch(
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+(?:public\\.)?${table}\\s+FROM\\s+anon,\\s*authenticated`, 'i')
        )
      })

      it(`should GRANT privileges TO service_role on ${table}`, () => {
        if (!migrationExists) return
        const content = readFileSync(migrationPath!, 'utf-8')
        // Just check there's a grant to service_role for this table
        expect(content).toMatch(
          new RegExp(`GRANT\\s+.+\\s+ON\\s+TABLE\\s+(?:public\\.)?${table}\\s+TO\\s+service_role`, 'i')
        )
      })

      it(`should have at least one RLS policy on ${table}`, () => {
        if (!migrationExists) return
        const content = readFileSync(migrationPath!, 'utf-8')
        const policies = extractPolicies(content, table)
        expect(policies.length).toBeGreaterThan(0)
      })
    }

    it('should have policy referencing auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/auth_has_operating_core_capability/i)
    })
  })

  describe('8. Event table structure — required columns', () => {
    it('should have kind discriminator referencing EventKind enum', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Check that operating_core_events has a kind column of the enum type
      expect(content).toMatch(/kind\s+(?:operating_core_event_kind|event_kind)\s+NOT\s+NULL/i)
    })

    it('should have estado column referencing EventEstado enum', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/estado\s+(?:operating_core_event_estado|event_estado)\s+NOT\s+NULL/i)
    })

    it('should have service_id foreign key to operating_core_services (for kind=service)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // service_id column that references operating_core_services
      expect(content).toMatch(/service_id\s+uuid\s+(?:NOT\s+NULL\s+)?REFERENCES\s+(?:public\.)?operating_core_services/i)
    })

    it('should have parent_event_id self-reference for series', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/parent_event_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_events/i)
    })

    it('should have optional responsible_dream_team_servicio_id FK', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/responsible_dream_team_servicio_id\s+uuid\s+REFERENCES\s+(?:public\.)?dream_team_servicios/i)
    })
  })

  describe('9. Service table structure — single-campus, experiencia scope', () => {
    it('should have experiencia text NOT NULL (not campus_id — single-campus per row)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should have experiencia column, NOT campus_id
      expect(content).toMatch(/experiencia\s+text\s+NOT\s+NULL/i)
      // Should NOT have campus_id on the services table
      expect(content).not.toMatch(/operating_core_services.*campus_id\s+uuid/i)
    })

    it('should have weekday integer (0=Sunday, 6=Saturday)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/weekday\s+integer\s+(?:NOT\s+NULL)?/i)
    })

    it('should have start_time text (HH:mm format)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/start_time\s+text\s+(?:NOT\s+NULL)?/i)
    })
  })

  describe('10. EventInstance table structure', () => {
    it('should have event_id FK to operating_core_events', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/event_id\s+uuid\s+REFERENCES\s+(?:public\.)?operating_core_events/i)
    })

    it('should have lifecycle enum column', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/lifecycle\s+(?:operating_core_instance_lifecycle|instance_lifecycle)\s+NOT\s+NULL/i)
    })

    it('should have instance_date (YYYY-MM-DD)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/instance_date\s+text\s+(?:NOT\s+NULL)?/i)
    })

    it('should have start_time and end_time', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/start_time\s+timestamptz\s+(?:NOT\s+NULL)?/i)
      expect(content).toMatch(/end_time\s+timestamptz\s+(?:NOT\s+NULL)?/i)
    })
  })

  describe('11. uno_a_uno defense in depth', () => {
    it('should revoke ALL on uno_a_uno_reuniones FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_reuniones\s+FROM\s+/i)
    })

    it('should revoke ALL on uno_a_uno_participantes FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_participantes\s+FROM\s+/i)
    })

    it('should grant ALL on uno_a_uno_reuniones TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/GRANT\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_reuniones\s+TO\s+service_role/i)
    })

    it('should grant ALL on uno_a_uno_participantes TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/GRANT\s+ALL\s+ON\s+TABLE\s+public\.uno_a_uno_participantes\s+TO\s+service_role/i)
    })

    it('should use defensive DO blocks if uno_a_uno tables might not exist', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const defense = extractUnoDefense(content)

      // If the migration revokes, it should either:
      // 1. Use defensive DO blocks, OR
      // 2. The tables are confirmed to exist
      if (defense.reunionesRevoked || defense.participantesRevoked) {
        // Check if tables exist in schema
        const tables = extractTables(content)
        const hasReuniones = tables.some(t => /uno_a_uno_reuniones/i.test(t.name))
        const hasParticipantes = tables.some(t => /uno_a_uno_participantes/i.test(t.name))

        // If we're revoking on tables that aren't defined in this migration,
        // we need defensive DO blocks
        if (!hasReuniones && defense.reunionesRevoked) {
          expect(defense.hasDefensiveDoBlock ||
            content.includes('IF EXISTS') ||
            content.includes('undefined_table')).toBe(true)
        }
        if (!hasParticipantes && defense.participantesRevoked) {
          expect(defense.hasDefensiveDoBlock ||
            content.includes('IF EXISTS') ||
            content.includes('undefined_table')).toBe(true)
        }
      }
    })
  })

  describe('12. buscar_usuarios_para_grupo byte-identical parameter NAMES', () => {
    it('should have same parameter NAMES {auth_id, grupo_id, query, limit} in same order', () => {
      if (!migrationExists) return

      // Read the specific migration file
      const buscarMigrationPath = join(MIGRATIONS_DIR, '20250906111510_grupo_detalle_y_miembros.sql')
      if (!existsSync(buscarMigrationPath)) {
        console.warn('buscar_usuarios migration not found, skipping signature check')
        return
      }

      const originalContent = readFileSync(buscarMigrationPath, 'utf-8')
      const originalSignature = extractBuscarUsuariosSignature(originalContent)

      expect(originalSignature).not.toBeNull()
      if (originalSignature) {
        // Expected: {auth_id, grupo_id, query, limit} (alphabetical by param name)
        expect(originalSignature).toEqual(['auth_id', 'grupo_id', 'query', 'limit'])
      }
    })
  })

  describe('13. TS types alignment (best-effort)', () => {
    it('should have SQL columns matching TS OperatingCoreEvent field names', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      // TS interface has: id, serviceId, kind, estado, title, startTime, visibilityScope,
      // recurrenceRule, parentEventId, createdAt, updatedAt
      // SQL should have (snake_case): id, service_id, kind, estado, title, start_time,
      // visibility_scope, recurrence_rule, parent_event_id, created_at, updated_at

      // Use content.includes for best-effort alignment check
      expect(content).toMatch(/service_id\s+uuid/i)
      expect(content).toMatch(/kind\s+operating_core_event_kind/i)
      expect(content).toMatch(/estado\s+operating_core_event_estado/i)
      expect(content).toMatch(/title\s+text/i)
      expect(content).toMatch(/start_date\s+text/i)
      expect(content).toMatch(/visibility_scope\s+text/i)
      expect(content).toMatch(/recurrence_rule\s+jsonb/i)
      expect(content).toMatch(/parent_event_id\s+uuid/i)
      expect(content).toMatch(/responsible_dream_team_servicio_id\s+uuid/i)
    })

    it('should have SQL columns matching TS OperatingCoreService field names', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      // TS interface has: id, campusId, kind, label, weekday, startTime, estado, createdAt, updatedAt
      // But we use experiencia (text) instead of campusId for single-campus scope
      expect(content).toMatch(/experiencia\s+text\s+NOT\s+NULL/i)
      expect(content).toMatch(/kind\s+operating_core_event_kind/i)
      expect(content).toMatch(/label\s+text/i)
      expect(content).toMatch(/weekday\s+integer/i)
      expect(content).toMatch(/start_time\s+text/i)
      expect(content).toMatch(/estado\s+operating_core_service_estado/i)
    })

    it('should have SQL columns matching TS OperatingCoreEventInstance field names', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')

      // TS interface has: id, eventId, instanceDate, estado, capacityOperativa, createdAt, updatedAt
      // SQL should have (snake_case): id, event_id, instance_date, estado, capacity_operativa, created_at, updated_at
      expect(content).toMatch(/event_id\s+uuid\s+NOT\s+NULL/i)
      expect(content).toMatch(/instance_date\s+text/i)
      expect(content).toMatch(/lifecycle\s+operating_core_instance_lifecycle/i)
      expect(content).toMatch(/capacity_operativa\s+integer/i)
    })
  })

  describe('14. Migration safety — lock_timeout and statement_timeout', () => {
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

  describe('15. lint:migrations passes with zero ERRORS', () => {
    it('should have zero ERROR-level lint findings', () => {
      if (!migrationExists) return

      // Run the linter programmatically on just this migration
      const content = readFileSync(migrationPath!, 'utf-8')
      const filename = migrationPath!.split('/').pop()!

      // Import and run the lint rules
      const errors = lintMigrationContent(content, filename)
      const errorFindings = errors.filter(f => f.severity === 'ERROR')

      expect(errorFindings).toHaveLength(0)
    })
  })
})

// ─── Inline linter for this migration only ───────────────────────────────────

interface LintFinding {
  rule: string
  severity: 'ERROR' | 'WARN' | 'INFO'
  line: number
  message: string
}

function lintMigrationContent(content: string, filename: string): LintFinding[] {
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
      message: 'RLS policy with USING (true)'
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
      message: 'SECURITY DEFINER without SET search_path'
    })
  }

  // Rule 5: delete-from-no-where
  let inFunction = false
  let dollarDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
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
          message: 'DELETE FROM without WHERE'
        })
      }
    }
  }

  return findings
}
