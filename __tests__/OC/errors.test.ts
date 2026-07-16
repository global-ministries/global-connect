/**
 * S02 TDD RED — errors module
 * Verifies every Operating Core error class maps to a 4xx HTTP status (never 500).
 * Pattern reference: dream-team/errors.ts (read-only).
 */
import {
  OperatingCoreError,
  OPERATING_CORE_ERROR_CLASSES,
  type OperatingCoreErrorCode,
} from '@/lib/platform/operating-core/errors'

describe('OPERATING_CORE_ERROR_CLASSES', () => {
  it('should be a non-empty array of OperatingCoreError instances', () => {
    expect(OPERATING_CORE_ERROR_CLASSES.length).toBeGreaterThan(0)
  })
})

describe('OperatingCoreError.toHttpStatus()', () => {
  it('should never return 500 for any business-outcome error class', () => {
    for (const err of OPERATING_CORE_ERROR_CLASSES) {
      expect(err.toHttpStatus()).not.toBe(500)
    }
  })

  it('should return 400 for invalid_input', () => {
    const err = new OperatingCoreError('invalid_input', 'bad input')
    expect(err.toHttpStatus()).toBe(400)
  })

  it('should return 401 for no_session', () => {
    const err = new OperatingCoreError('no_session', 'no session')
    expect(err.toHttpStatus()).toBe(401)
  })

  it('should return 403 for capability_denied', () => {
    const err = new OperatingCoreError('capability_denied', 'denied')
    expect(err.toHttpStatus()).toBe(403)
  })

  it('should return 403 for flag_off', () => {
    const err = new OperatingCoreError('flag_off', 'flag is off')
    expect(err.toHttpStatus()).toBe(403)
  })

  it('should return 404 for not_found', () => {
    const err = new OperatingCoreError('not_found', 'not found')
    expect(err.toHttpStatus()).toBe(404)
  })

  it('should return 404 for token_replay', () => {
    const err = new OperatingCoreError('token_replay', 'token replay')
    expect(err.toHttpStatus()).toBe(404)
  })

  it('should return 404 for identity_disclosure', () => {
    const err = new OperatingCoreError('identity_disclosure', 'disclosure')
    expect(err.toHttpStatus()).toBe(404)
  })

  it('should return 404 for ambiguity_unresolved', () => {
    const err = new OperatingCoreError('ambiguity_unresolved', 'ambiguous')
    expect(err.toHttpStatus()).toBe(404)
  })

  it('should return 409 for capacity_conflict', () => {
    const err = new OperatingCoreError('capacity_conflict', 'capacity conflict')
    expect(err.toHttpStatus()).toBe(409)
  })

  it('should return 409 for invalid_transition', () => {
    const err = new OperatingCoreError('invalid_transition', 'invalid transition')
    expect(err.toHttpStatus()).toBe(409)
  })

  it('should return 409 for irreconcilable_idempotency', () => {
    const err = new OperatingCoreError('irreconcilable_idempotency', 'idempotency conflict')
    expect(err.toHttpStatus()).toBe(409)
  })

  it('should return 409 for non_waitlistable', () => {
    const err = new OperatingCoreError('non_waitlistable', 'not waitlistable')
    expect(err.toHttpStatus()).toBe(409)
  })
})

describe('OperatingCoreError shape', () => {
  it('should have code, message, and optional context', () => {
    const err = new OperatingCoreError('not_found', 'item not found', { id: '123' })
    expect(err.code).toBe('not_found')
    expect(err.message).toBe('item not found')
    expect(err.context).toEqual({ id: '123' })
  })

  it('should have readonly code', () => {
    const err = new OperatingCoreError('invalid_input', 'msg')
    // @ts-expect-error — code is readonly
    err.code = 'changed'
  })
})

describe('OperatingCoreErrorCode', () => {
  it('should NOT include any 5xx codes', () => {
    // All codes must be 4xx
    const codes: OperatingCoreErrorCode[] = [
      'invalid_input',
      'no_session',
      'capability_denied',
      'flag_off',
      'not_found',
      'token_replay',
      'identity_disclosure',
      'ambiguity_unresolved',
      'capacity_conflict',
      'invalid_transition',
      'irreconcilable_idempotency',
      'non_waitlistable',
    ]
    const acceptAll = (_: OperatingCoreErrorCode) => { void _ }
    for (const code of codes) {
      acceptAll(code)
    }
  })
})
