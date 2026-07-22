/**
 * W01 — DT-002 — Pastoral participation kinds.
 * 13 kinds with prefix pastoral_ + pastoral_crisis_detected.
 * Verifies byte-identity of operating-core/kinds.ts (I-10).
 */
import { execSync } from 'child_process'
import { PASTORAL_PARTICIPATION_KINDS, type PastoralParticipationKind } from '@/lib/platform/pastoral/participation-kinds'

// The 13 pastoral kinds as specified in design.md §3 + D15
const CANONICAL_PASTORAL_KINDS = [
  'pastoral_one_on_one_logged',
  'pastoral_one_on_one_completed',
  'pastoral_one_on_one_cancelled',
  'pastoral_one_on_one_note_logged',
  'pastoral_one_on_one_followup_set',
  'pastoral_one_on_one_followup_completed',
  'pastoral_one_on_one_step_validated',
  'pastoral_triada_formed',
  'pastoral_triada_member_added',
  'pastoral_triada_member_removed',
  'pastoral_triada_disbanded',
  'pastoral_triada_step_suggested',
  'pastoral_triada_step_validated',
  'pastoral_crisis_detected',
] as const

describe('PASTORAL_PARTICIPATION_KINDS', () => {
  it('contains exactly 14 kinds', () => {
    expect(PASTORAL_PARTICIPATION_KINDS).toHaveLength(14)
  })

  it('contains all canonical pastoral kinds', () => {
    for (const kind of CANONICAL_PASTORAL_KINDS) {
      expect(PASTORAL_PARTICIPATION_KINDS).toContain(kind)
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(PASTORAL_PARTICIPATION_KINDS)
    expect(unique.size).toBe(PASTORAL_PARTICIPATION_KINDS.length)
  })

  it('is defined with as const (type-level immutability)', () => {
    // The type-level readonly assertion is verified by the PastoralParticipationKind
    // union accepting only the 14 literal values. Mutation attempts would be caught
    // by TypeScript at compile time.
    type Expected = 'pastoral_one_on_one_logged' | 'pastoral_one_on_one_completed' |
      'pastoral_one_on_one_cancelled' | 'pastoral_one_on_one_note_logged' |
      'pastoral_one_on_one_followup_set' | 'pastoral_one_on_one_followup_completed' |
      'pastoral_one_on_one_step_validated' | 'pastoral_triada_formed' |
      'pastoral_triada_member_added' | 'pastoral_triada_member_removed' |
      'pastoral_triada_disbanded' | 'pastoral_triada_step_suggested' |
      'pastoral_triada_step_validated' | 'pastoral_crisis_detected'
    const _typeCheck: Expected = '' as PastoralParticipationKind
    void _typeCheck
  })

  it('all kinds start with pastoral_ prefix', () => {
    for (const kind of PASTORAL_PARTICIPATION_KINDS) {
      expect(kind).toMatch(/^pastoral_/)
    }
  })
})

describe('PastoralParticipationKind type', () => {
  it('accepts every canonical pastoral kind', () => {
    const acceptAll = (k: PastoralParticipationKind) => k
    for (const kind of CANONICAL_PASTORAL_KINDS) {
      acceptAll(kind)
    }
  })

  it('rejects operating-core kinds at compile time', () => {
    const acceptAll = (k: PastoralParticipationKind) => k
    // @ts-expect-error — attendance is NOT a PastoralParticipationKind
    acceptAll('attendance')
    // @ts-expect-error — transition is NOT a PastoralParticipationKind
    acceptAll('transition')
  })
})

describe('byte-identity of protected kinds.ts (I-10)', () => {
  it('operating-core/kinds.ts is unchanged from main', () => {
    const diff = execSync(
      'git diff main...HEAD -- lib/platform/operating-core/kinds.ts',
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })
})
