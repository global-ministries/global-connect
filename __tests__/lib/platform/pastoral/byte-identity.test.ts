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
 */

import { execSync } from 'node:child_process'

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

describe('Byte-identity — protected files unchanged (I-1 to I-16)', () => {
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
