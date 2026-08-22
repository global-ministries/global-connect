/**
 * W04 — DT-025 — Invariant verifier tests.
 * F(pastoral/invariants) — verify invariants (I-18, I-19) via a pure-Node scan.
 *
 * I-18: registerPlatformUnoAUnoDecision must only appear in test files
 *       (or its single declaration site lib/platform/preflight.ts).
 * I-19: uno_a_uno_ patterns must NOT appear in lib/platform/pastoral/.
 *
 * Runs in CI on every PR and fails if an invariant is violated. Implemented
 * with Node's fs instead of `rg`: CI runners do not ship ripgrep, so shelling
 * out to `rg` throws "rg: not found" (exit 127) rather than reporting matches.
 */

import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import { extname, join } from 'node:path'

const PROJECT_ROOT = process.cwd()
const PASTORAL_DIR = join(PROJECT_ROOT, 'lib', 'platform', 'pastoral')
const LIB_DIR = join(PROJECT_ROOT, 'lib')

// Mirror `rg -t ts` file coverage.
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
// Directories ripgrep skips via .gitignore; excluding them keeps parity.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage'])

function safeReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Return every `<absolutePath>:<lineNumber>:<lineText>` whose text contains the
 * literal pattern, scanning TypeScript-family files under searchPath. Both call
 * sites pass metacharacter-free literals, so substring matching is an exact
 * equivalent of the previous `rg -- "pattern"` (regex) behaviour.
 */
function scanForPattern(pattern: string, searchPath: string): string[] {
  const matches: string[] = []
  const stack: string[] = [searchPath]

  while (stack.length > 0) {
    const dir = stack.pop() as string

    for (const entry of safeReaddir(dir)) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(fullPath)
        continue
      }
      if (!entry.isFile() || !TS_EXTENSIONS.has(extname(entry.name))) continue

      let content: string
      try {
        content = readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }
      if (!content.includes(pattern)) continue

      content.split('\n').forEach((lineText, index) => {
        if (lineText.includes(pattern)) {
          matches.push(`${fullPath}:${index + 1}:${lineText}`)
        }
      })
    }
  }

  return matches
}

describe('Invariant I-18: registerPlatformUnoAUnoDecision only in tests (or in its declaration site)', () => {
  it('registerPlatformUnoAUnoDecision not called from lib/ production code', () => {
    if (!existsSync(LIB_DIR)) return

    const results = scanForPattern('registerPlatformUnoAUnoDecision', LIB_DIR)

    // Filter to non-test, non-declaration files. The declaration site
    // lib/platform/preflight.ts is the only legitimate occurrence outside
    // tests (the function must be defined somewhere).
    const PREFLIGHT_DECLARATION = join('lib', 'platform', 'preflight.ts')
    const nonTestMatches = results
      .filter((line) => !line.includes('__tests__'))
      .filter((line) => !line.includes('.test.') && !line.includes('.spec.'))
      .filter((line) => !line.includes(PREFLIGHT_DECLARATION))

    expect(nonTestMatches).toHaveLength(0)
  })
})

describe('Invariant I-19: uno_a_uno_ not in lib/platform/pastoral/', () => {
  it('uno_a_uno_ patterns not in lib/platform/pastoral/', () => {
    if (!existsSync(PASTORAL_DIR)) return

    const results = scanForPattern('uno_a_uno_', PASTORAL_DIR)

    expect(results).toHaveLength(0)
  })
})
