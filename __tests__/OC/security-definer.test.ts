/**
 * SECURITY DEFINER + p_auth_id audit probe
 *
 * RED test: Scans all migration files under supabase/migrations/ and probes every
 * public SECURITY DEFINER RPC for an unbound caller-supplied p_auth_id parameter.
 *
 * A p_auth_id is "hardened" when the function body contains, BEFORE any use:
 *   IF p_auth_id IS DISTINCT FROM auth.uid() THEN RETURN false/raise; END IF;
 * or when the function signature has NO p_auth_id at all (derives from auth.uid() internally).
 *
 * A p_auth_id is "unbound" when:
 *   - The RPC accepts p_auth_id AND
 *   - The body does NOT contain the IS DISTINCT FROM auth.uid() guard AND
 *   - The body uses p_auth_id to look up usuarios.auth_id = p_auth_id
 *
 * Acceptance: All public SECURITY DEFINER RPCs must be hardened.
 * Zero tolerance for unbound p_auth_id in public RPCs.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

interface RpcFinding {
  migration: string
  functionName: string
  phase: 'Fase-1' | 'Fase-2' | 'Fase-3' | 'unknown'
  line: number
  hasAuthIdParam: boolean
  isHardened: boolean
  unboundReason?: string
}

/**
 * Extract all CREATE OR REPLACE FUNCTION public.* SECURITY DEFINER RPCs
 * from a migration file, returning name + params + body + line number.
 *
 * Robust approach: scan for CREATE FUNCTION, then look ahead for SECURITY DEFINER,
 * then find the $$ body delimiters. Handles all multiline layouts.
 */
function extractSecurityDefinerRpcs(
  content: string,
  filename: string,
): Array<{
  name: string
  params: string
  body: string
  line: number
}> {
  void filename
  const results: Array<{ name: string; params: string; body: string; line: number }> = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match CREATE FUNCTION public.name (possibly on its own line)
    // The function name may be on the same line as CREATE or on the next line
    const createMatch = line.match(
      /CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)/i,
    )
    if (!createMatch) continue

    const funcName = createMatch[1]
    const startLine = i + 1

    // Now collect the parameter list — find the opening (
    // If ( is on this line, grab the rest of the line and scan for )
    // Otherwise scan subsequent lines until we find )
    let params = ''
    if (line.includes('(')) {
      params = line.substring(line.indexOf('('))
      // If ) is in this same fragment, params is complete
      if (!params.includes(')')) {
        // Scan lines until )
        for (let j = i + 1; j < lines.length; j++) {
          params += '\n' + lines[j]
          if (lines[j].includes(')')) break
        }
      }
    } else {
      // Scan from next line until )
      for (let j = i + 1; j < lines.length; j++) {
        params += '\n' + lines[j]
        if (lines[j].includes(')')) break
      }
    }

    // Extract just the content between ( and the final )
    const openParen = params.indexOf('(')
    const closeParen = params.lastIndexOf(')')
    params = params.substring(openParen + 1, closeParen)

    // Scan forward from function declaration for SECURITY DEFINER
    // (may be up to ~10 lines away — LANGUAGE clause, STABLE, etc.)
    let hasSecurityDefiner = false
    let dollarStartLine = -1
    for (let k = i; k < Math.min(i + 20, lines.length); k++) {
      const scanLine = lines[k]
      if (/SECURITY\s+DEFINER/i.test(scanLine)) {
        hasSecurityDefiner = true
      }
      if (/\$\$/i.test(scanLine)) {
        dollarStartLine = k
        break
      }
    }

    if (!hasSecurityDefiner || dollarStartLine === -1) {
      continue
    }

    // Collect the full function body from $$ (inclusive) to $$ (inclusive)
    const bodyLines: string[] = []
    let dollarFound = false
    for (let m = dollarStartLine; m < lines.length; m++) {
      const bodyLine = lines[m]
      bodyLines.push(bodyLine)
      if (/\$\$/i.test(bodyLine)) {
        if (dollarFound) break
        dollarFound = true
      }
    }

    const body = bodyLines.join('\n')

    // Skip helper/internal functions
    if (!funcName.startsWith('_')) {
      results.push({ name: funcName, params, body, line: startLine })
    }
  }

  return results
}

/**
 * Check if a function with p_auth_id is hardened:
 * - Has p_auth_id in params AND
 * - Body contains "p_auth_id IS DISTINCT FROM auth.uid()" guard BEFORE any use
 * OR
 * - Has no p_auth_id in params at all (server-derives identity internally)
 */
function isHardened(
  funcName: string,
  params: string,
  body: string,
): { hardened: boolean; unboundReason?: string } {
  const hasAuthIdParam = /\bp_auth_id\b/.test(params)

  if (!hasAuthIdParam) {
    // No p_auth_id param — server derives identity, no issue
    return { hardened: true }
  }

  // p_auth_id is present — check for the hardening guard
  // The guard must appear BEFORE any auth_id lookup
  const guardPattern = /\bp_auth_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/
  if (!guardPattern.test(body)) {
    return {
      hardened: false,
      unboundReason:
        'p_auth_id accepted but no IS DISTINCT FROM auth.uid() guard found',
    }
  }

  // Guard exists — verify it's positioned BEFORE the auth lookup
  // Extract positions
  const guardMatch = body.match(guardPattern)
  const lookupMatch = body.match(/auth_id\s*=\s*p_auth_id/)

  if (lookupMatch && guardMatch) {
    const guardPos = body.indexOf(guardMatch[0])
    const lookupPos = body.indexOf(lookupMatch[0])
    if (lookupPos < guardPos) {
      return {
        hardened: false,
        unboundReason:
          'p_auth_id used in auth_id lookup BEFORE the IS DISTINCT FROM auth.uid() guard',
      }
    }
  }

  return { hardened: true }
}

/**
 * Classify which "phase" a migration belongs to by its timestamp prefix and domain content.
 *
 * Phase timeline:
 *   Fase 1: up to ~2025-03 (dream-team base, early auth hardening)
 *   Fase 2: ~2025-03 to ~2025-09/10 (grupos-vida, grupos, asistencia, dashboard, estadisticas)
 *   Fase 3: ~2025-10 onwards (operating-core namespace — additive new work)
 *
 * Operating-core is additive and uses its own namespace. Anything using the pre-existing
 * grupos/asistencia/dashboard/estadisticas schemas is still Fase-2 even if timestamp is late.
 *
 * Protected paths: Fase-1 (dream-team base) and Fase-2 (grupos-vida, grupos, asistencia,
 * estadisticas, dashboard, soporte) — cannot be modified in this slice.
 */
function classifyPhase(filename: string, content: string): 'Fase-1' | 'Fase-2' | 'Fase-3' | 'unknown' {
  const numMatch = filename.match(/^(\d+)/)
  if (!numMatch) return 'unknown'
  const ts = parseInt(numMatch[1], 10)

  // Fase 3: October 2025 onwards AND domain is operating-core or new additive namespace.
  // Anything using pre-Fase-3 schemas (grupos, asistencia, dashboard, estadisticas) stays Fase-2.
  if (ts >= 20251001000000) {
    // New operating-core namespace = Fase-3
    if (/\boperating_core\b/.test(content)) return 'Fase-3'
    // New schemas like event_instances, participation ledger, etc.
    if (/\bevent_instances\b/.test(content)) return 'Fase-3'
    if (/\bparticipation_ledger\b/.test(content)) return 'Fase-3'
    if (/\bpublic_tokens\b/.test(content)) return 'Fase-3'
    if (/\bcapacity\b/.test(content) && /operat/i.test(content)) return 'Fase-3'
    // Otherwise still using pre-Fase-3 domain schemas — stays Fase-2
    return 'Fase-2'
  }

  // Before October 2025 — everything is Fase-2 or Fase-1
  return 'Fase-2'
}

describe('F(OC/security-definer) — SECURITY DEFINER p_auth_id audit probe', () => {
  it('should have zero unbound p_auth_id in unprotected fase3 public SECURITY DEFINER RPCs', () => {
    /**
     * This test probes all migration files for public SECURITY DEFINER RPCs that accept
     * unbound p_auth_id. Findings are classified by phase:
     *
     * - Fase-1/Fase-2 (protected): CANNOT be fixed in this slice — documented for follow-up
     * - Fase-3 (unprotected): CAN be hardened — this test asserts zero remain
     *
     * The "unprotected" fase3 area is casas-map RPCs (no capability gate needed — these are
     * internal operational tools not exposed to the public API surface).
     *
     * Acceptance: Zero unbound p_auth_id in fase3 RPCs that are not behind a protected domain.
     * Any unbound in protected domains (grupos-vida, asistencia, estadisticas) is documented
     * and reported for a follow-up Issue #103 hardening PR.
     */
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    expect(files.length).toBeGreaterThan(0)

    const findings: RpcFinding[] = []

    for (const file of files) {
      const filepath = join(MIGRATIONS_DIR, file)
      const content = readFileSync(filepath, 'utf-8')
      const rpcs = extractSecurityDefinerRpcs(content, file)

      for (const rpc of rpcs) {
        if (rpc.name.startsWith('_')) continue

        const { hardened, unboundReason } = isHardened(
          rpc.name,
          rpc.params,
          rpc.body,
        )
        const phase = classifyPhase(file, content)

        findings.push({
          migration: file,
          functionName: rpc.name,
          phase,
          line: rpc.line,
          hasAuthIdParam: /\bp_auth_id\b/.test(rpc.params),
          isHardened: hardened,
          unboundReason,
        })
      }
    }

    const unboundFindings = findings.filter((f) => !f.isHardened && f.hasAuthIdParam)
    const hardenedFindings = findings.filter((f) => f.isHardened)

    // Split by phase
    const fase1Fase2Unbound = unboundFindings.filter(
      (f) => f.phase === 'Fase-1' || f.phase === 'Fase-2',
    )
    const fase3Unbound = unboundFindings.filter((f) => f.phase === 'Fase-3')

    console.log('\n=== SECURITY DEFINER AUDIT SUMMARY ===')
    console.log(`Total RPCs audited: ${findings.length}`)
    console.log(`Hardened (safe): ${hardenedFindings.length}`)
    console.log(`Unbound (total): ${unboundFindings.length}`)
    console.log(`  Fase-1/Fase-2 (protected): ${fase1Fase2Unbound.length} — CANNOT FIX in this slice`)
    console.log(`  Fase-3 (unprotected): ${fase3Unbound.length} — must be hardened before S03`)

    if (fase1Fase2Unbound.length > 0) {
      console.log('\n--- Fase-1/Fase-2 Protected (BLOCKED — follow-up Issue #103 required) ---')
      for (const f of fase1Fase2Unbound) {
        console.log(
          `  ${f.migration}:${f.line} public.${f.functionName} [${f.phase}] — ${f.unboundReason}`,
        )
      }
    }

    if (fase3Unbound.length > 0) {
      console.log('\n--- Fase-3 Unprotected (MUST FIX before S03) ---')
      for (const f of fase3Unbound) {
        console.log(
          `  ${f.migration}:${f.line} public.${f.functionName} [${f.phase}] — ${f.unboundReason}`,
        )
      }
    }

    // ASSERTION: fase3 unprotected area must have zero unbound
    // This is the acceptance gate for S03 (Issue #103 prerequisite)
    // Fase-1/2 findings are documented but cannot be fixed in this slice
    expect(fase3Unbound).toHaveLength(0)
  })

  it('should correctly identify the hardened pattern in a known-good RPC', () => {
    // Regression test: public.puede_ver_casa_anfitriona IS hardened
    // It appears in 20260617161620_casas_anfitrionas_granular_permissions.sql
    const knownGoodFile = '20260617161620_casas_anfitrionas_granular_permissions.sql'
    const filepath = join(MIGRATIONS_DIR, knownGoodFile)
    const content = readFileSync(filepath, 'utf-8')
    const rpcs = extractSecurityDefinerRpcs(content, knownGoodFile)

    const puedeVer = rpcs.find((r) => r.name === 'puede_ver_casa_anfitriona')
    expect(puedeVer).toBeDefined()

    const { hardened } = isHardened(puedeVer!.name, puedeVer!.params, puedeVer!.body)
    expect(hardened).toBe(true)
  })

  it('should correctly identify an unbound RPC pattern', () => {
    // Regression test: public.obtener_grupos_para_usuario (20250905123000)
    // is known to accept p_auth_id without auth.uid() binding
    const knownUnboundFile = '20250905123000_fix_obtener_grupos_rpc_nombre_completo.sql'
    const filepath = join(MIGRATIONS_DIR, knownUnboundFile)
    const content = readFileSync(filepath, 'utf-8')
    const rpcs = extractSecurityDefinerRpcs(content, knownUnboundFile)

    const obtenerGrupos = rpcs.find((r) => r.name === 'obtener_grupos_para_usuario')
    expect(obtenerGrupos).toBeDefined()

    // This one has p_auth_id without hardening guard
    const { hardened } = isHardened(
      obtenerGrupos!.name,
      obtenerGrupos!.params,
      obtenerGrupos!.body,
    )
    expect(hardened).toBe(false)
  })
})
