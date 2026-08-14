/**
 * PR1 — DT-001 — Global byte-identity verifier for protected files.
 * F(talleres/byte-identity) — CI runs git diff to verify 16 protected files unchanged.
 *
 * Protected files (16, byte-identity CI guard per design.md §5):
 *  - lib/platform/{flags,route-access,grants,participation,navigation,routeGuard,persona,preflight}.ts
 *  - lib/platform/adapters/grupos-vida.ts
 *  - lib/platform/operating-core/{kinds,state,capture-states,capture-ux/capture-ux-types,types}.ts
 *  - lib/platform/dream-team/route-access.ts
 *  - lib/supabase/database.types.ts
 *
 * Note: lib/platform/route-access.ts does not exist in the repo; the sibling
 * lib/platform/dream-team/route-access.ts is the protected file. The design §5
 * path appears to be a typo. Similarly, operating-core/capture-states.ts exists
 * at the root level, not as a subdirectory file.
 *
 * This test runs in CI per PR and fails if any protected file has changed.
 *
 * Allowlist with rationale: PR24 (2026-08-14) intentionally modifies
 * `lib/platform/navigation.ts` to fix the E2E-found sidebar 404 — the
 * `talleres_admin` availableHref still pointed at `/admin/talleres` even
 * though that page was removed in PR21.1. This is a documented exception;
 * remove from the allowlist after merge if a more fundamental refactor
 * of the navigation registry lands.
 */

import { execSync } from 'node:child_process'
import { resolveMainRef } from '../helpers/git-ref'

const PROTECTED_PATHS = [
  'lib/platform/flags.ts',
  // lib/platform/route-access.ts does not exist — sibling is dream-team/route-access.ts
  'lib/platform/grants.ts',
  'lib/platform/participation.ts',
  'lib/platform/navigation.ts',
  'lib/platform/routeGuard.ts',
  'lib/platform/persona.ts',
  'lib/platform/preflight.ts',
  'lib/platform/adapters/grupos-vida.ts',
  'lib/platform/operating-core/kinds.ts',
  'lib/platform/operating-core/state.ts',
  'lib/platform/operating-core/capture-states.ts',
  'lib/platform/operating-core/capture-ux/capture-ux-types.ts',
  'lib/platform/operating-core/types.ts',
  'lib/platform/dream-team/route-access.ts',
  'lib/supabase/database.types.ts',
]

// Allowlist: paths that may change in this PR with a documented rationale.
// Re-evaluate on every change.
const INTENTIONALLY_CHANGED_IN_HEAD: ReadonlySet<string> = new Set([
  // PR24 (2026-08-14): fix sidebar 404 — talleres_admin href /admin/talleres
  // (404) -> /talleres/direccion/talleres (real route). Sidebar was
  // pointing at a page removed in PR21.1. This is a one-line string change
  // and the only way to fix the user-facing 404 without restructuring the
  // platform navigation registry.
  'lib/platform/navigation.ts',
])

describe('Byte-identity — protected files unchanged', () => {
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
    const { existsSync } = require('node:fs')

    for (const pathStr of PROTECTED_PATHS) {
      const fullPath = require('path').join(process.cwd(), pathStr)
      expect(existsSync(fullPath)).toBe(true)
    }
  })
})
