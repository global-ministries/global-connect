/**
 * PR1 — DT-003 — Talleres participation kinds.
 * 5 kinds with prefix taller_ (sibling to pastoral kinds).
 * Verifies byte-identity of lib/platform/operating-core/kinds.ts (NOT edited).
 */

import { execSync } from 'child_process'
import { resolveMainRef } from '../../../../tests/helpers/git-ref'
import {
  TALLERES_PARTICIPATION_KINDS,
  type TalleresParticipationKind,
} from '@/lib/platform/talleres/participation-kinds'

// The 5 canonical Talleres kinds as specified in design.md §3
const CANONICAL_TALLERES_KINDS = [
  'taller_cohort_started',
  'taller_session_attended',
  'taller_session_missed',
  'taller_completion_recorded',
  'taller_completion_failed',
] as const

describe('TALLERES_PARTICIPATION_KINDS', () => {
  it('contains exactly 5 kinds', () => {
    expect(TALLERES_PARTICIPATION_KINDS).toHaveLength(5)
  })

  it('contains all canonical Talleres kinds', () => {
    for (const kind of CANONICAL_TALLERES_KINDS) {
      expect(TALLERES_PARTICIPATION_KINDS).toContain(kind)
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(TALLERES_PARTICIPATION_KINDS)
    expect(unique.size).toBe(TALLERES_PARTICIPATION_KINDS.length)
  })

  it('is defined with as const (type-level immutability)', () => {
    // The type-level readonly assertion is verified by the TalleresParticipationKind
    // union accepting only the 5 literal values. Mutation attempts would be caught
    // by TypeScript at compile time.
    type Expected =
      | 'taller_cohort_started'
      | 'taller_session_attended'
      | 'taller_session_missed'
      | 'taller_completion_recorded'
      | 'taller_completion_failed'
    const _typeCheck: Expected = '' as TalleresParticipationKind
    void _typeCheck
  })

  it('all kinds start with taller_ prefix', () => {
    for (const kind of TALLERES_PARTICIPATION_KINDS) {
      expect(kind).toMatch(/^taller_/)
    }
  })
})

describe('TalleresParticipationKind type', () => {
  it('accepts every canonical Talleres kind', () => {
    const acceptAll = (k: TalleresParticipationKind) => k
    for (const kind of CANONICAL_TALLERES_KINDS) {
      acceptAll(kind)
    }
  })

  it('rejects operating-core kinds at compile time', () => {
    const acceptAll = (k: TalleresParticipationKind) => k
    // @ts-expect-error — attendance is NOT a TalleresParticipationKind
    acceptAll('attendance')
    // @ts-expect-error — pastoral kinds are NOT TalleresParticipationKind
    acceptAll('pastoral_one_on_one_logged')
    // @ts-expect-error — transition is NOT a TalleresParticipationKind
    acceptAll('transition')
  })
})

describe('byte-identity of protected kinds.ts (I-10)', () => {
  it('operating-core/kinds.ts is unchanged from main', () => {
    const diff = execSync(
      `git diff ${resolveMainRef()}..HEAD -- lib/platform/operating-core/kinds.ts`,
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })
})
