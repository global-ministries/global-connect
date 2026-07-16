/**
 * S02 TDD RED — kinds module
 * Verifies the 11-kind Operating Core participation union and one_on_one_logged exclusion.
 */
import { OPERATING_CORE_PARTICIPATION_KINDS, type OperatingCoreParticipationKind } from '@/lib/platform/operating-core/kinds'

// The canonical 11 kinds as specified in design.md
const CANONICAL_KINDS = [
  'attendance',
  'visitor_capture',
  'registration',
  'cancellation',
  'check_in',
  'check_out',
  'attendance_update',
  'service_assignment',
  'requirement_update',
  'transition',
  'document_received',
] as const

describe('OPERATING_CORE_PARTICIPATION_KINDS', () => {
  it('should contain exactly 11 kinds', () => {
    expect(OPERATING_CORE_PARTICIPATION_KINDS).toHaveLength(11)
  })

  it('should contain all canonical kinds', () => {
    for (const kind of CANONICAL_KINDS) {
      expect(OPERATING_CORE_PARTICIPATION_KINDS).toContain(kind)
    }
  })

  it('should NOT contain one_on_one_logged', () => {
    expect(OPERATING_CORE_PARTICIPATION_KINDS).not.toContain('one_on_one_logged')
    expect(OPERATING_CORE_PARTICIPATION_KINDS).not.toContain('uno_a_uno')
  })

  it('should have no duplicates', () => {
    const unique = new Set(OPERATING_CORE_PARTICIPATION_KINDS)
    expect(unique.size).toBe(OPERATING_CORE_PARTICIPATION_KINDS.length)
  })

  it('should be readonly (as const)', () => {
    // @ts-expect-error — should be readonly
    OPERATING_CORE_PARTICIPATION_KINDS.push('fake')
    // @ts-expect-error — should be readonly
    OPERATING_CORE_PARTICIPATION_KINDS[0] = 'fake'
  })
})

describe('OperatingCoreParticipationKind', () => {
  it('should be the union type of the as-const array values', () => {
    type Expected = 'attendance' | 'visitor_capture' | 'registration' | 'cancellation' |
      'check_in' | 'check_out' | 'attendance_update' | 'service_assignment' |
      'requirement_update' | 'transition' | 'document_received'
    const _typeCheck: Expected = '' as OperatingCoreParticipationKind
    void _typeCheck
  })

  it('should accept every canonical kind', () => {
    const acceptAll = (k: OperatingCoreParticipationKind) => k
    for (const kind of CANONICAL_KINDS) {
      acceptAll(kind)
    }
  })

  it('should reject one_on_one_logged at compile time', () => {
    const acceptAll = (k: OperatingCoreParticipationKind) => k
    // @ts-expect-error — one_on_one_logged is NOT a valid OperatingCoreParticipationKind
    acceptAll('one_on_one_logged')
  })
})
