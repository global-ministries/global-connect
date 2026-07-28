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
 */

import { execSync } from 'node:child_process'

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

describe('Byte-identity — protected files unchanged', () => {
  it('no diff on protected files between main and HEAD', () => {
    let diffOutput: string

    try {
      diffOutput = execSync(
        `git diff main...HEAD -- ${PROTECTED_PATHS.join(' ')}`,
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

    // If diffOutput is empty, no files changed — test passes
    // If diffOutput has content, protected files were modified — test fails
    expect(diffOutput.trim()).toBe('')
  })

  it('protected files exist and are accessible', () => {
    const { existsSync } = require('node:fs')

    for (const pathStr of PROTECTED_PATHS) {
      const fullPath = require('path').join(process.cwd(), pathStr)
      expect(existsSync(fullPath)).toBe(true)
    }
  })
})
