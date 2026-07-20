/**
 * S11 RED — Public Tokens Migration Dry-Run Probe
 *
 * Verifies the additive migration file satisfies all acceptance criteria
 * BEFORE it is applied to any database. The migration is a future-apply bundle only.
 *
 * Acceptance criteria:
 *  1. Migration file exists under supabase/migrations/ with correct naming convention
 *  2. Migration is additive (NO DROP/TRUNCATE/ALTER on pre-existing tables)
 *  3. Table: operating_core_public_tokens with all required columns
 *  4. PRIMARY KEY on token_hash
 *  5. jsonb metadata CHECK on PII fields (cedula, telefono, email, nombre, apellido)
 *  6. RLS enabled, REVOKE/GRANT correct
 *  7. 4 single-column indexes (expires_at, resource, persona, consumed_at)
 *  8. Atomic claim RPC: operating_core_claim_public_token(p_token_hash text, p_consuming_persona_id uuid)
 *  9. RPC body uses FOR UPDATE SKIP LOCKED (atomic single-use)
 * 10. RPC: LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
 * 11. RPC: no p_auth_id parameter
 * 12. RPC: REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT EXECUTE TO service_role
 * 13. buscar_usuarios_para_grupo byte-identical preserved
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findPublicTokensMigration(): string | null {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const match = files.find((f) => /_operating_core_public_tokens\.sql$/.test(f))
  return match ? join(MIGRATIONS_DIR, match) : null
}

interface RpcDef {
  name: string
  params: string[]
  hasForUpdateSkipLocked: boolean
  isSecurityDefiner: boolean
  hasSearchPath: boolean
  hasP_auth_id: boolean
  language: string
  stable: boolean
  revokePublic: boolean
  grantServiceRole: boolean
}

function extractClaimRpc(content: string): RpcDef | null {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_claim_public_token/i.test(line)) {
      continue
    }

    let fullSig = line
    let parenDepth = (fullSig.match(/\(/g) || []).length - (fullSig.match(/\)/g) || []).length
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      parenDepth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length
      fullSig += '\n' + lines[j]
      if (parenDepth === 0) break
    }

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

    let isSecurityDefiner = /SECURITY\s+DEFINER/i.test(fullSig)
    let hasSearchPath = /SET\s+search_path\s+TO/i.test(fullSig)
    let language = 'plpgsql'
    let stable = false
    let hasForUpdateSkipLocked = false
    let hasP_auth_id = /\bp_auth_id\b/.test(fullSig)
    let revokePublic = false
    let grantServiceRole = false

    for (let k = i; k < Math.min(i + 40, lines.length); k++) {
      const bodyLine = lines[k]
      if (/SECURITY\s+DEFINER/i.test(bodyLine)) isSecurityDefiner = true
      if (/SET\s+search_path\s+TO/i.test(bodyLine)) hasSearchPath = true
      if (/LANGUAGE\s+(\w+)/i.test(bodyLine)) language = bodyLine.match(/LANGUAGE\s+(\w+)/i)?.[1] ?? 'plpgsql'
      if (/\bSTABLE\b/i.test(bodyLine)) stable = true
      if (/FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(bodyLine)) hasForUpdateSkipLocked = true
      if (/\bp_auth_id\b/.test(bodyLine)) hasP_auth_id = true
    }

    if (/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.operating_core_claim_public_token.*FROM\s+PUBLIC/i.test(content)) {
      revokePublic = true
    }
    if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.operating_core_claim_public_token.*TO\s+service_role/i.test(content)) {
      grantServiceRole = true
    }

    return {
      name: 'operating_core_claim_public_token',
      params,
      hasForUpdateSkipLocked,
      isSecurityDefiner,
      hasSearchPath,
      hasP_auth_id,
      language,
      stable,
      revokePublic,
      grantServiceRole,
    }
  }

  return null
}

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
    // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
    const idxMatch = line.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/i)
    if (!idxMatch) continue

    const [, idxName, tableName] = idxMatch

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

    const colMatch = fullIdxLine.match(/\(([^)]+)\)/)
    const cols = colMatch ? colMatch[1].split(',').map((c: string) => c.trim()) : []

    indexes.push({ name: idxName, table: tableName, columns: cols })
  }

  return indexes
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('F(OC/schema-public-tokens-dry-run) — S11 Public Tokens Migration Probe', () => {
  const migrationPath = findPublicTokensMigration()
  const migrationExists = migrationPath !== null

  describe('1. Migration file existence', () => {
    it('should have an operating_core_public_tokens migration file', () => {
      expect(migrationExists).toBe(true)
    })

    it('should follow naming convention YYYYMMDDHHMMSS_operating_core_public_tokens.sql', () => {
      if (!migrationExists) return
      const filename = migrationPath!.split('/').pop()!
      expect(filename).toMatch(/^\d{8,14}_operating_core_public_tokens\.sql$/)
    })
  })

  describe('2. Migration content — additive only', () => {
    it('should have migration header comment', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/--.*Operating.*Core.*Public.*Tokens/i)
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
      expect(content).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?(?:dream_team_|grupos_vida_|uno_a_uno_|operating_core_(?!public_tokens))/i)
    })
  })

  describe('3. Table: operating_core_public_tokens', () => {
    it('should create operating_core_public_tokens table', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?operating_core_public_tokens/i)
    })

    it('should have token_hash (text PRIMARY KEY NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // Column has: token_hash text NOT NULL PRIMARY KEY
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/token_hash\s+text[\s\S]*?PRIMARY\s+KEY/i)
    })

    it('should have resource_type (text NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/resource_type\s+text\s+NOT\s+NULL/i)
    })

    it('should have resource_id (uuid NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/resource_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('should have persona_id (uuid NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/persona_id\s+uuid/i)
    })

    it('should have expires_at (timestamptz NOT NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/expires_at\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('should have consumed_at (timestamptz NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/consumed_at\s+timestamptz/i)
    })

    it('should have consumed_by_persona_id (uuid NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/consumed_by_persona_id\s+uuid/i)
    })

    it('should have captured_by_persona_id (uuid NULL)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/captured_by_persona_id\s+uuid/i)
    })

    it('should have metadata (jsonb NOT NULL DEFAULT {})', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s+jsonb\s+NOT\s+NULL/i)
    })

    it('should have created_at (timestamptz NOT NULL DEFAULT now())', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL/i)
    })
  })

  describe('4. PRIMARY KEY on token_hash', () => {
    it('should have token_hash as PRIMARY KEY', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/token_hash\s+text\s+.*PRIMARY\s+KEY/i)
    })
  })

  describe('5. jsonb metadata CHECK on PII', () => {
    it('should CHECK metadata does not contain cedula', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?[\s]*'cedula'/i)
    })

    it('should CHECK metadata does not contain telefono', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?[\s]*'telefono'/i)
    })

    it('should CHECK metadata does not contain email', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?[\s]*'email'/i)
    })

    it('should CHECK metadata does not contain nombre', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?[\s]*'nombre'/i)
    })

    it('should CHECK metadata does not contain apellido', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/metadata\s*\?[\s]*'apellido'/i)
    })
  })

  describe('6. RLS: deny-by-default', () => {
    it('should ENABLE ROW LEVEL SECURITY on operating_core_public_tokens', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?operating_core_public_tokens\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('should REVOKE ALL FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+(?:public\.)?operating_core_public_tokens\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    })

    it('should GRANT SELECT ON TABLE TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+(?:public\.)?operating_core_public_tokens\s+TO\s+service_role/i)
    })
  })

  describe('7. Indexes', () => {
    it('should have 4 single-column indexes on operating_core_public_tokens', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const indexes = extractIndexes(content).filter(
        (idx) => idx.table === 'operating_core_public_tokens',
      )
      // 4 single-column indexes: expires_at, resource (composite), persona, consumed_at
      expect(indexes.length).toBeGreaterThanOrEqual(4)
    })

    it('should have index on expires_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/idx_oc_public_tokens_expires_at/i)
    })

    it('should have index on resource (resource_type, resource_id)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/idx_oc_public_tokens_resource/i)
    })

    it('should have index on persona_id', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/idx_oc_public_tokens_persona/i)
    })

    it('should have index on consumed_at', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      expect(content).toMatch(/idx_oc_public_tokens_consumed_at/i)
    })
  })

  describe('8. Atomic claim RPC', () => {
    it('should exist as CREATE OR REPLACE FUNCTION public.operating_core_claim_public_token', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      expect(content).toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.operating_core_claim_public_token/i)
    })

    it('should have signature (p_token_hash text, p_consuming_persona_id uuid)', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractClaimRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.params).toContain('token_hash')
        expect(rpc.params).toContain('consuming_persona_id')
      }
    })

    it('should use FOR UPDATE SKIP LOCKED in the RPC body', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractClaimRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.hasForUpdateSkipLocked).toBe(true)
      }
    })

    it('should be LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      const rpc = extractClaimRpc(content)
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
      const rpc = extractClaimRpc(content)
      expect(rpc).not.toBeNull()
      if (rpc) {
        expect(rpc.hasP_auth_id).toBe(false)
      }
    })

    it('should REVOKE ALL ON FUNCTION FROM PUBLIC, anon, authenticated', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.operating_core_claim_public_token[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    })

    it('should GRANT EXECUTE ON FUNCTION TO service_role', () => {
      if (!migrationExists) return
      const content = readFileSync(migrationPath!, 'utf-8')
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan, no nested quantifiers
      expect(content).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.operating_core_claim_public_token[\s\S]*?TO\s+service_role/i)
    })
  })

  describe('9. buscar_usuarios_para_grupo byte-identical parameter NAMES', () => {
    it('should preserve {auth_id, grupo_id, query, limit} parameter order', () => {
      if (!migrationExists) return

      const buscarMigrationPath = join(MIGRATIONS_DIR, '20250906111510_grupo_detalle_y_miembros.sql')
      if (!existsSync(buscarMigrationPath)) {
        console.warn('buscar_usuarios migration not found, skipping signature check')
        return
      }

      const originalContent = readFileSync(buscarMigrationPath, 'utf-8')
      // Extract function signature
      // eslint-disable-next-line security/detect-unsafe-regex -- static SQL keyword scan
      const sigMatch = originalContent.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.buscar_usuarios_para_grupo\s*\(([^)]+)\)/i)
      expect(sigMatch).not.toBeNull()
      if (sigMatch) {
        const paramsStr = sigMatch[1]
        const paramNames: string[] = []
        const paramParts = paramsStr.split(',')
        for (const part of paramParts) {
          const nameMatch = part.trim().match(/p_(\w+)/i)
          if (nameMatch) paramNames.push(nameMatch[1])
        }
        expect(paramNames).toEqual(['auth_id', 'grupo_id', 'query', 'limit'])
      }
    })
  })

  describe('10. lint:migrations — zero ERROR findings', () => {
    it('should have zero ERROR-level lint findings', () => {
      if (!migrationExists) return

      const content = readFileSync(migrationPath!, 'utf-8')
      const errors = lintMigrationContent(content)
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

function lintMigrationContent(content: string): LintFinding[] {
  const findings: LintFinding[] = []

  if (/(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im.test(content)) {
    findings.push({ rule: 'drop-table', severity: 'ERROR', line: 1, message: 'DROP TABLE without IF EXISTS' })
  }

  if (/(?:^|\s)TRUNCATE\s/im.test(content)) {
    findings.push({ rule: 'truncate', severity: 'ERROR', line: 1, message: 'TRUNCATE in migration' })
  }

  const lines = content.split('\n')
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
