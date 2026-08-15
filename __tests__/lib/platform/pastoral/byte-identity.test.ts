/**
 * W04 — DT-024 — Byte-identity verifier for protected files.
 * F(pastoral/byte-identity) — CI runs git diff to verify protected files unchanged.
 *
 * Protected files (I-1 to I-16):
 *  - lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags,family}.ts
 *  - lib/platform/dream-team/
 *  - lib/platform/adapters/grupos-vida.ts
 *  - lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts
 *
 * This test runs in CI by PR and fails if any protected file has changed.
 *
 * Allowlist with rationale:
 *   PR24 (2026-08-14) intentionally modified
 *   `lib/platform/navigation.ts` to fix the E2E-found sidebar 404 —
 *   the `talleres_admin` availableHref pointed at `/admin/talleres`
 *   even though that page was removed in PR21.1.
 *
 *   PR25 (2026-08-14) retargets the same `talleres_admin`
 *   availableHref from `/talleres/direccion/talleres` to
 *   `/admin/talleres/abstracto` (the wizard entry-point). Mirror of
 *   the allow-list in
 *   `tests/byte-identity/protected-files.test.ts`.
 */

import { execSync } from 'node:child_process'
import { resolveMainRef } from '../../../../tests/helpers/git-ref'

const PROTECTED_PATHS = [
  'lib/platform/grants.ts',
  'lib/platform/participation.ts',
  'lib/platform/navigation.ts',
  'lib/platform/routeGuard.ts',
  'lib/platform/persona.ts',
  'lib/platform/preflight.ts',
  'lib/platform/flags.ts',
  'lib/platform/family.ts',
  'lib/platform/dream-team/',
  'lib/platform/adapters/grupos-vida.ts',
  'lib/platform/operating-core/kinds.ts',
  'lib/platform/operating-core/state.ts',
  'lib/platform/operating-core/capture-states.ts',
  'lib/platform/operating-core/participation-read-guard.ts',
  'lib/platform/operating-core/capture-ux/capture-ux-types.ts',
  'lib/platform/operating-core/types.ts',
]

// Allowlist: paths that may change in this PR with a documented rationale.
// Must match the allow-list in tests/byte-identity/protected-files.test.ts.
const INTENTIONALLY_CHANGED_IN_HEAD: ReadonlySet<string> = new Set([
  // PR24 (2026-08-14): fix sidebar 404 — talleres_admin href /admin/talleres
  // (404) -> /talleres/direccion/talleres (real route). One-line string.
  //
  // PR25 (2026-08-14): retarget the same talleres_admin href to
  // /admin/talleres/abstracto (real wizard entry-point). Mirror of
  // the global allow-list — same one-line string change to a
  // protected file, no structural impact on the navigation registry.
  'lib/platform/navigation.ts',
])

describe('Byte-identity — protected files unchanged (I-1 to I-16)', () => {
  it('no diff on protected files between main and HEAD', () => {
    let diffOutput: string

    try {
      diffOutput = execSync(
        `git diff ${resolveMainRef()}..HEAD -- ${PROTECTED_PATHS.join(' ')}`,
        { encoding: 'utf-8', cwd: process.cwd() },
      )
    } catch (err: unknown) {
      // git diff returns non-zero when there's no diff
      const error = err as { status?: number; stdout?: string }
      if (error.status === 0) {
        diffOutput = error.stdout ?? ''
      } else {
        // Actual error
        throw err
      }
    }

    // Filter out changes that are explicitly allow-listed in this PR.
    // Each allow-listed file must have a rationale in the comment above
    // and `INTENTIONALLY_CHANGED_IN_HEAD` must declare it.
    const filteredDiff = diffOutput
      .split(/^diff --git /m)
      .filter((block) => block.trim().length > 0)
      .filter((block) => {
        const headerMatch = block.match(/^a\/(.+?)\s+b\//)
        if (!headerMatch) return true
        const changedPath = headerMatch[1]
        return !INTENTIONALLY_CHANGED_IN_HEAD.has(changedPath)
      })
      .join('diff --git ')

    // If filteredDiff is empty, no unprotected files changed — test passes
    expect(filteredDiff.trim()).toBe('')
  })

  it('protected files exist and are accessible', () => {
    const { existsSync, statSync } = require('node:fs')

    for (const path of PROTECTED_PATHS) {
      const fullPath = require('path').join(process.cwd(), path)
      // Check parent directory exists for directories
      const pathOrParent = path.endsWith('/') ? fullPath : require('path').dirname(fullPath)

      if (path.endsWith('/')) {
        // Directory — just check parent exists
        expect(existsSync(pathOrParent)).toBe(true)
      } else {
        expect(existsSync(fullPath)).toBe(true)
      }
    }
  })
})
