/**
 * W04 — DT-025 — Invariant verifier tests.
 * F(pastoral/invariants) — CI runs rg to verify invariants (I-18, I-19).
 *
 * I-18: registerPlatformUnoAUnoDecision must only appear in test files
 * I-19: uno_a_uno_ patterns must NOT appear in lib/platform/pastoral/
 *
 * These tests run in CI by PR and fail if invariants are violated.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = process.cwd()
const PASTORAL_DIR = join(PROJECT_ROOT, 'lib', 'platform', 'pastoral')
const LIB_DIR = join(PROJECT_ROOT, 'lib')

function rg(pattern: string, searchPath: string, _options: { include?: string } = {}): string | null {
  try {
    // Use -t typescript for type filtering instead of --include
    const result = execSync(
      `rg -t ts -- "${pattern}" "${searchPath}"`,
      { encoding: 'utf-8', cwd: PROJECT_ROOT },
    )
    return result
  } catch (err: unknown) {
    const error = err as { status?: number }
    // rg returns 1 when no matches found
    if (error.status === 1) return null
    // Actual error
    throw err
  }
}

describe('Invariant I-18: registerPlatformUnoAUnoDecision only in tests (or in its declaration site)', () => {
  it('registerPlatformUnoAUnoDecision not called from lib/ production code', () => {
    if (!existsSync(LIB_DIR)) return

    const results = rg('registerPlatformUnoAUnoDecision', LIB_DIR, { include: '*.ts' })

    if (results === null) return // No matches — invariant satisfied

    // Filter to non-test, non-declaration files.
    // The declaration site lib/platform/preflight.ts is the only legitimate
    // occurrence outside tests (the function must be defined somewhere).
    const PREFLIGHT_DECLARATION = 'lib/platform/preflight.ts';
    const nonTestMatches = results
      .split('\n')
      .filter((line) => line.length > 0)
      .filter((line) => !line.includes('__tests__'))
      .filter((line) => !line.includes('.test.') && !line.includes('.spec.'))
      .filter((line) => !line.includes(PREFLIGHT_DECLARATION))

    expect(nonTestMatches).toHaveLength(0)
  })
})

describe('Invariant I-19: uno_a_uno_ not in lib/platform/pastoral/', () => {
  it('uno_a_uno_ patterns not in lib/platform/pastoral/', () => {
    if (!existsSync(PASTORAL_DIR)) return

    const results = rg('uno_a_uno_', PASTORAL_DIR, { include: '*.ts' })

    expect(results).toBeNull()
  })
})
