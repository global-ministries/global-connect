/**
 * S06 TDD RED — kinds-guard test
 * Verifies the S02 OPERATING_CORE_PARTICIPATION_KINDS correctly excludes one_on_one_logged.
 * This is a documentation/test of the existing S02 symbol — no new implementation needed.
 */
import { OPERATING_CORE_PARTICIPATION_KINDS, type OperatingCoreParticipationKind } from '@/lib/platform/operating-core/kinds'

const CANONICAL_11_KINDS = [
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

describe('OPERATING_CORE_PARTICIPATION_KINDS — one_on_one_logged exclusion guard', () => {
  it('should contain exactly 11 kinds', () => {
    expect(OPERATING_CORE_PARTICIPATION_KINDS).toHaveLength(11)
  })

  it('should contain all canonical kinds', () => {
    for (const kind of CANONICAL_11_KINDS) {
      expect(OPERATING_CORE_PARTICIPATION_KINDS).toContain(kind)
    }
  })

  it('should NOT contain one_on_one_logged', () => {
    expect(OPERATING_CORE_PARTICIPATION_KINDS).not.toContain('one_on_one_logged')
  })

  it('should NOT contain uno_a_uno', () => {
    expect(OPERATING_CORE_PARTICIPATION_KINDS).not.toContain('uno_a_uno')
  })

  it('should have no duplicates', () => {
    const unique = new Set(OPERATING_CORE_PARTICIPATION_KINDS)
    expect(unique.size).toBe(OPERATING_CORE_PARTICIPATION_KINDS.length)
  })

  it('should accept every canonical kind as OperatingCoreParticipationKind', () => {
    const accept = (_: OperatingCoreParticipationKind) => { void _ }
    for (const kind of CANONICAL_11_KINDS) {
      accept(kind)
    }
  })

  it('should reject one_on_one_logged at compile time', () => {
    const accept = (_: OperatingCoreParticipationKind) => { void _ }
    // @ts-expect-error — one_on_one_logged is explicitly excluded
    accept('one_on_one_logged')
  })
})
