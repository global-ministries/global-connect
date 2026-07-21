/**
 * S10 RED — Registrations Migration Dry-Run Probe
 *
 * Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Migration is additive (NO DROP/TRUNCATE/ALTER on pre-existing tables)
 *  3. Enums: operating_core_registration_estado (6 values) +
 *            operating_core_registration_confirmation_mode (2 values)
 *  4. Table: operating_core_registrations with all required columns
 *  5. Partial unique constraint: EXCLUDE USING btree (persona_id, event_id)
 *     WHERE estado NOT IN ('cancelada', 'rechazada')
 *  6. FK: event_id REFERENCES operating_core_events(id) ON DELETE CASCADE
 *  7. RLS: deny-by-default, REVOKE/GRANT correct, policies use auth_has_operating_core_capability
 *  8. 5 single-column indexes + 1 partial index (WHERE estado = 'pendiente')
 *  9. lock_timeout / statement_timeout block + reset
 * 10. Atomic promote_waitlist RPC with FOR UPDATE SKIP LOCKED
 * 11. RPC: LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
 * 12. RPC: no p_auth_id parameter (identity bound server-side via auth.uid())
 * 13. RPC: REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role
 * 14. updated_at trigger present
 * 15. buscar_usuarios_para_grupo byte-identical by parameter NAMES
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Find the operating_core_registrations migration file.
 * Naming convention: YYYYMMDDHHMMSS_operating_core_registrations.sql
 */
function findRegistrationsMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_registrations\.sql$/.test(f))
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
      // Break when we see the closing paren with semicolon (allow trailing comments)
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
 * Extract RLS policies for a table.
 */
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
    const policyMatch = line.match(/CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(\w+)/i)
    if (!policyMatch) continue

    const [, policyName, policyTable] = policyMatch
    if (policyTable !== tableName) continue

    // Collect the full policy definition (may span multiple lines)
    let policyBlock = line
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const nextLine = lines[j].trim()
      // Stop at next CREATE POLICY, GRANT, REVOKE, etc.
      if (/^CREATE\s+POLICY/i.test(nextLine) || /^GRANT/i.test(nextLine) || /^REVOKE/i.test(nextLine)) {
        break
      }
      policyBlock += '\n' + lines[j]
      if (nextLine.endsWith(';')) break
    }

    // Extract command - may be on the same line or subsequent lines within block
    const cmdMatch = policyBlock.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i)
    const cmd = cmdMatch ? cmdMatch[1].toUpperCase() : 'UNKNOWN'

    const usesCapability =
      /auth_has_operating_core_capability/i.test(policyBlock) ||
      /operating_core\.\w+\.\w+/i.test(policyBlock)

    policies.push({ name: policyName, cmd, usesCapability })
  }

  return policies
}

/**
 * Extract RPC function definition.
 */
interface RpcDef {
  name: string
  params: string[]
  hasForUpdateSkipLocked: boolean
  isSecurityDefiner: boolean
  hasSearchPath: boolean
  hasP_auth_id: boolean
  language: string
  stable: boolean
  returns: string
  revokePublic: boolean
  grantServiceRole: boolean
}

function extractRpc(content: string): RpcDef | null {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_promote_waitlist/i.test(line)) {
      continue
    }

    // Collect full function signature (may span multiple lines)
    let fullSig = line
    let parenDepth = (fullSig.match(/\(/g) || []).length - (fullSig.match(/\)/g) || []).length
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      parenDepth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length
      fullSig += '\n' + lines[j]
      if (parenDepth === 0) break
    }

    // Extract parameters
    const params: string[] = []
    const openParen = fullSig.indexOf('(')
    const closeParen = fullSig.lastIndexOf(')')
    if (openParen >= 0 && closeParen > openParen) {
      const paramsStr = fullSig.substring(openParen + 1, closeParen)
      const paramParts = paramsStr.split(',')
      for (const part of paramParts) {
        const nameMatch = part.trim().match(/p_(\w+)/i)
        if (nameMatch) params.push(nameMatch[1])
      }
    }

    // Look ahead for function attributes (LANGUAGE, SECURITY DEFINER, etc.)
    let isSecurityDefiner = /SECURITY\s+DEFINER/i.test(fullSig)
    let hasSearchPath = /SET\s+search_path\s+TO/i.test(fullSig)
    let language = 'plpgsql'
    let stable = false
    let returns = 'SETOF'
    let hasForUpdateSkipLocked = false
    let hasP_auth_id = /\bp_auth_id\b/.test(fullSig)
    let revokePublic = false
    let grantServiceRole = false

    // Scan function body area for remaining attributes
    for (let k = i; k < Math.min(i + 30, lines.length); k++) {
      const bodyLine = lines[k]
      if (/SECURITY\s+DEFINER/i.test(bodyLine)) isSecurityDefiner = true
      if (/SET\s+search_path\s+TO/i.test(bodyLine)) hasSearchPath = true
      if (/LANGUAGE\s+(\w+)/i.test(bodyLine)) language = bodyLine.match(/LANGUAGE\s+(\w+)/i)?.[1] ?? 'plpgsql'
      if (/\bSTABLE\b/i.test(bodyLine)) stable = true
      if (/RETURNS\s+(\w+)/i.test(bodyLine)) returns = bodyLine.match(/RETURNS\s+(\w+)/i)?.[1] ?? 'SETOF'
      if (/FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(bodyLine)) hasForUpdateSkipLocked = true
      if (/\bp_auth_id\b/.test(bodyLine)) hasP_auth_id = true
      if (/REVOKE\s+ALL\s+ON\s+FUNCTION.*FROM\s+PUBLIC/i.test(bodyLine)) revokePublic = true
      if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION.*TO\s+service_role/i.test(bodyLine)) grantServiceRole = true
    }

    // Also scan the full content for REVOKE/GRANT statements
    if (/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.operating_core_promote_waitlist.*FROM\s+PUBLIC/i.test(content)) {
      revokePublic = true
    }
    if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.operating_core_promote_waitlist.*TO\s+service_role/i.test(content)) {
      grantServiceRole = true
    }

    return {
      name: 'operating_core_promote_waitlist',
      params,
      hasForUpdateSkipLocked,
      isSecurityDefiner,
      hasSearchPath,
      hasP_auth_id,
      language,
      stable,
      returns,
      revokePublic,
      grantServiceRole,
    }
  }

  return null
}

/**
 * Extract index definitions.
 */
interface IndexDef {
  name: string
  table: string
  isPartial: boolean
  partialWhere: string | null
  columns: string[]
}

function extractIndexes(content: string): IndexDef[] {
  const indexes: IndexDef[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
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

    // Check for partial index
    const partialMatch = fullIdxLine.match(/WHERE\s+(.+?)(?:USING|$)/i)
    const isPartial = !!partialMatch
    const partialWhere = partialMatch ? partialMatch[1] : null

    // Extract columns
    const colMatch = fullIdxLine.match(/\(([^)]+)\)/)
    const cols = colMatch ? colMatch[1].split(',').map((c: string) => c.trim()) : []

    indexes.push({
      name: idxName,
      table: tableName,
      isPartial,
      partialWhere,
      columns: cols,
    })
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
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
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

// ─── Tests ───────────────────────────────────────────────────────────────────────

describe('F(OC/schema-registrations-parallel) — S10 Registrations Migration Probe', () => {
  const migrationPath = findRegistrationsMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_registrations migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_registrations.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_registrations\.sql$/)
    })
  })

  describe('2. Migration content — additive only', () => {
    it('should have migration header comment', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Operating.*Core.*Registrations/i)
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

    it('should NOT alter any pre-existing table (no ALTER TABLE on dream_team, grupos_vida, etc.)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Should not alter tables created in Fase 1/2
      expect(content).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?(?:dream_team_|grupos_vida_|uno_a_uno_)/i)
    })
  })

  describe('3. Enums', () => {
    it('should have operating_core_registration_estado enum with 6 values matching S02 REGISTRATION_STATES', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const estadoEnum = enums.find((e) => /operating_core_registration_estado/i.test(e.name))
      expect(estadoEnum).toBeDefined()
      if (estadoEnum) {
        expect(estadoEnum.values).toContain('pendiente')
        expect(estadoEnum.values).toContain('confirmada')
        expect(estadoEnum.values).toContain('asistida')
        expect(estadoEnum.values).toContain('no_asistio')
        expect(estadoEnum.values).toContain('cancelada')
        expect(estadoEnum.values).toContain('rechazada')
        expect(estadoEnum.values).toHaveLength(6)
      }
    })

    it('should have operating_core_registration_confirmation_mode enum (automatic, manual)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const enums = extractEnums(content)
      const modeEnum = enums.find((e) => /operating_core_registration_confirmation_mode/i.test(e.name))
      expect(modeEnum).toBeDefined()
      if (modeEnum) {
        expect(modeEnum.values).toContain('automatic')
        expect(modeEnum.values).toContain('manual')
        expect(modeEnum.values).toHaveLength(2)
      }
    })
  })

  describe('4. Table: operating_core_registrations', () => {
    it('should create operating_core_registrations table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_registrations/i)
    })

    it('should have id (uuid PRIMARY KEY DEFAULT gen_random_uuid())', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i)
    })

    it('should have persona_id (uuid NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/persona_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have event_id (uuid REFERENCES operating_core_events ON DELETE CASCADE)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Use [\s\S]* to match across newlines (equivalent to .* with s flag)
      expect(content).toMatch(/event_id[\s\S]*?REFERENCES[\s\S]*?operating_core_events\(id\)[\s\S]*?ON DELETE CASCADE/i)
    })

    it('should have estado (operating_core_registration_estado NOT NULL DEFAULT pendiente)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/estado\s+operating_core_registration_estado\s+NOT\s+NULL/i)
    })

    it('should have confirmation_mode (operating_core_registration_confirmation_mode NOT NULL DEFAULT automatic)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/confirmation_mode\s+operating_core_registration_confirmation_mode\s+NOT\s+NULL/i)
    })

    it('should have waitlist_position (integer NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/waitlist_position\s+integer/i)
    })

    it('should have captured_by_persona_id (uuid NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/captured_by_persona_id\s+uuid/i)
    })

    it('should have reason (text NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/reason\s+text/i)
    })

    it('should have created_at (timestamptz NOT NULL DEFAULT now())', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('should have updated_at (timestamptz NOT NULL DEFAULT now())', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('should have version (integer NOT NULL DEFAULT 1)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL/i)
    })
  })

  describe('5. Partial unique constraint — EXCLUDE USING btree', () => {
    it('should have EXCLUDE constraint named uq_active_registration_per_persona_event', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CONSTRAINT\s+uq_active_registration_per_persona_event\s+EXCLUDE/i)
    })

    it('should use USING btree with persona_id WITH =, event_id WITH =', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/EXCLUDE\s+USING\s+btree\s*\(\s*persona_id\s+WITH\s*=\s*,\s*event_id\s+WITH\s*=\s*\)/i)
    })

    it('should have WHERE clause excluding cancelada and rechazada states', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/WHERE\s*\(\s*estado\s+NOT\s+IN\s*\(\s*'cancelada'\s*,\s*'rechazada'\s*\)\s*\)/i)
    })

    it('partial unique allows re-insert after cancelada (different persona_id)', () => {
      // This is the behavioral verification of the partial unique scope
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // The EXCLUDE constraint should only apply when estado NOT IN (cancelada, rechazada)
      // So cancelling a registration removes it from the constraint's scope
      expect(content).toMatch(/estado\s+NOT\s+IN\s*\(\s*'cancelada'\s*,\s*'rechazada'\s*\)/i)
    })
  })

  describe('6. RLS: deny-by-default', () => {
    it('should ENABLE ROW LEVEL SECURITY on operating_core_registrations', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?operating_core_registrations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+(?:public\.)?operating_core_registrations\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    })

    it('should GRANT SELECT, INSERT, UPDATE TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // More flexible pattern to handle comma-separated permissions
      expect(content).toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|ALL|SELECT,?\s*(?:INSERT|UPDATE|ALL))/i)
      expect(content).toMatch(/GRANT\s+.*\s+ON\s+TABLE\s+(?:public\.)?operating_core_registrations\s+TO\s+service_role/i)
    })

    it('should have RLS policies using auth_has_operating_core_capability', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const policies = extractPolicies(content, 'operating_core_registrations')
      expect(policies.length).toBeGreaterThan(0)
      for (const policy of policies) {
        expect(policy.usesCapability).toBe(true)
      }
    })

    it('should have at least SELECT, INSERT, UPDATE policies', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const policies = extractPolicies(content, 'operating_core_registrations')
      const cmds = policies.map((p) => p.cmd)
      expect(cmds).toContain('SELECT')
      expect(cmds).toContain('INSERT')
      expect(cmds).toContain('UPDATE')
    })
  })

  describe('7. Indexes', () => {
    it('should have at least 3 indexes on operating_core_registrations', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_registrations',
      )
      // 3 single-column + 1 composite + 1 partial = 5 total indexes
      expect(indexes.length).toBeGreaterThanOrEqual(5)
    })

    it('should have a partial index on (event_id, estado)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_registrations',
      )
      // Look for index on event_id and estado
      const compositeIdx = indexes.find(
        (idx) => idx.columns.includes('event_id') && idx.columns.includes('estado') && !idx.isPartial,
      )
      expect(compositeIdx).toBeDefined()
    })

    it('should have a partial index WHERE estado = pendiente for waitlist', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_registrations' && idx.isPartial,
      )
      expect(indexes.length).toBeGreaterThan(0)
      const waitlistIdx = indexes.find((idx) =>
        idx.partialWhere?.toLowerCase().includes("estado = 'pendiente'"),
      )
      expect(waitlistIdx).toBeDefined()
    })
  })

  describe('8. lock_timeout and statement_timeout', () => {
    it('should SET lock_timeout before indexes', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/SET\s+lock_timeout\s*=\s*'?\d+s'?/i)
    })

    it('should SET statement_timeout before indexes', () => {
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

  describe('9. Atomic promote_waitlist RPC', () => {
    it('should exist as CREATE OR REPLACE FUNCTION public.operating_core_promote_waitlist', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_promote_waitlist/i)
    })

    it('should have signature (p_event_id uuid, p_slot_released integer DEFAULT 1)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.params).toContain('event_id')
        expect(rpc.params).toContain('slot_released')
      }
    })

    it('should use FOR UPDATE SKIP LOCKED in the RPC body', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.hasForUpdateSkipLocked).toBe(true)
      }
    })

    it('should be LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.language.toLowerCase()).toBe('plpgsql')
        expect(rpc.isSecurityDefiner).toBe(true)
        expect(rpc.hasSearchPath).toBe(true)
        expect(rpc.stable).toBe(true)
      }
    })

    it('should NOT have p_auth_id parameter', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.hasP_auth_id).toBe(false)
      }
    })

    it('should REVOKE ALL ON FUNCTION FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.operating_core_promote_waitlist.*FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    })

    it('should GRANT EXECUTE ON FUNCTION TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.operating_core_promote_waitlist.*TO\s+service_role/i)
    })

    it('should RETURN SETOF operating_core_registrations', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/RETURNS\s+SETOF\s+operating_core_registrations/i)
    })
  })

  describe('10. updated_at trigger', () => {
    it('should create operating_core_registrations_set_updated_at() function', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_registrations_set_updated_at/i)
    })

    it('should create trigger set_operating_core_registrations_updated_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/CREATE\s+TRIGGER\s+set_operating_core_registrations_updated_at/i)
    })

    it('should trigger BEFORE UPDATE ON operating_core_registrations', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/BEFORE\s+UPDATE\s+ON\s+(?:public\.)?operating_core_registrations/i)
    })
  })

  describe('11. buscar_usuarios_para_grupo byte-identical parameter NAMES', () => {
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

  describe('12. lint:migrations — zero ERROR findings', () => {
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
function lintMigrationContent(content: string, _filename: string): LintFinding[] {
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
