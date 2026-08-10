/**
 * PR1 — DT-002 — Talleres errors tests.
 */

import { talleresError, routeAccessError, isInvalidStateTransition, isMissingMotivo, isTerminalState, isConcurrencyConflict, isTallerNotFound, isTallerAccessDenied, isInvalidEnrollmentState, isSessionSequenceViolation, isDuplicateEnrollment, isRouteAccessDenied, isRouteNotFound, isFlagDisabled, TERMINAL_TALLER_ESTADOS, TERMINAL_PARTICIPANT_ESTADOS, TERMINAL_REPORT_ESTADOS, type TalleresErrorCode, type RouteAccessErrorCode } from '@/lib/platform/talleres/errors'

describe('talleresError factory', () => {
  it('creates an error with code and message', () => {
    const error = talleresError('TALLER_NOT_FOUND', 'Taller not found')
    expect(error.code).toBe('TALLER_NOT_FOUND')
    expect(error.message).toBe('Taller not found')
    expect(error.context).toBeUndefined()
  })

  it('creates an error with context', () => {
    const error = talleresError('INVALID_STATE_TRANSITION', 'Invalid transition', {
      currentState: 'cerrado',
      attemptedTransition: 'abierto',
    })
    expect(error.code).toBe('INVALID_STATE_TRANSITION')
    expect(error.context).toEqual({
      currentState: 'cerrado',
      attemptedTransition: 'abierto',
    })
  })
})

describe('TalleresErrorCode discriminator', () => {
  it('all error codes are recognized', () => {
    const codes: TalleresErrorCode[] = [
      'INVALID_STATE_TRANSITION',
      'MISSING_MOTIVO',
      'TERMINAL_STATE',
      'INVALID_MOTIVO_FOR_TRANSITION',
      'CONCURRENCY_CONFLICT',
      'SELF_TRANSITION',
      'TALLER_NOT_FOUND',
      'TALLER_ACCESS_DENIED',
      'INVALID_CARDINALITY',
      'INVALID_ENROLLMENT_STATE',
      'SESSION_SEQUENCE_VIOLATION',
      'DUPLICATE_ENROLLMENT',
      'INVALID_MODALITY_CHANGE',
    ]
    for (const code of codes) {
      const error = talleresError(code, code)
      expect(error.code).toBe(code)
    }
  })
})

describe('TalleresError type guards', () => {
  it('isInvalidStateTransition returns true for INVALID_STATE_TRANSITION', () => {
    const error = talleresError('INVALID_STATE_TRANSITION', 'Invalid')
    expect(isInvalidStateTransition(error)).toBe(true)
  })

  it('isMissingMotivo returns true for MISSING_MOTIVO', () => {
    const error = talleresError('MISSING_MOTIVO', 'Missing')
    expect(isMissingMotivo(error)).toBe(true)
  })

  it('isTerminalState returns true for TERMINAL_STATE', () => {
    const error = talleresError('TERMINAL_STATE', 'Terminal')
    expect(isTerminalState(error)).toBe(true)
  })

  it('isTallerNotFound returns true for TALLER_NOT_FOUND', () => {
    const error = talleresError('TALLER_NOT_FOUND', 'Not found')
    expect(isTallerNotFound(error)).toBe(true)
  })

  it('isTallerAccessDenied returns true for TALLER_ACCESS_DENIED', () => {
    const error = talleresError('TALLER_ACCESS_DENIED', 'Access denied')
    expect(isTallerAccessDenied(error)).toBe(true)
  })

  it('isConcurrencyConflict returns true for CONCURRENCY_CONFLICT', () => {
    const error = talleresError('CONCURRENCY_CONFLICT', 'Conflict')
    expect(isConcurrencyConflict(error)).toBe(true)
  })

  it('isInvalidEnrollmentState returns true for INVALID_ENROLLMENT_STATE', () => {
    const error = talleresError('INVALID_ENROLLMENT_STATE', 'Invalid enrollment')
    expect(isInvalidEnrollmentState(error)).toBe(true)
  })

  it('isSessionSequenceViolation returns true for SESSION_SEQUENCE_VIOLATION', () => {
    const error = talleresError('SESSION_SEQUENCE_VIOLATION', 'Sequence violation')
    expect(isSessionSequenceViolation(error)).toBe(true)
  })

  it('isDuplicateEnrollment returns true for DUPLICATE_ENROLLMENT', () => {
    const error = talleresError('DUPLICATE_ENROLLMENT', 'Duplicate')
    expect(isDuplicateEnrollment(error)).toBe(true)
  })
})

describe('routeAccessError factory', () => {
  it('creates an error with code and message', () => {
    const error = routeAccessError('ROUTE_ACCESS_DENIED', 'Access denied')
    expect(error.code).toBe('ROUTE_ACCESS_DENIED')
    expect(error.message).toBe('Access denied')
  })

  it('creates an error with context', () => {
    const error = routeAccessError('ROUTE_ACCESS_DENIED', 'Access denied', {
      requiredCapabilities: ['talleres_crecimiento.director.read'],
    })
    expect(error.context).toEqual({
      requiredCapabilities: ['talleres_crecimiento.director.read'],
    })
  })
})

describe('RouteAccessErrorCode discriminator', () => {
  it('all error codes are recognized', () => {
    const codes: RouteAccessErrorCode[] = [
      'ROUTE_ACCESS_DENIED',
      'ROUTE_NOT_FOUND',
      'FLAG_DISABLED',
    ]
    for (const code of codes) {
      const error = routeAccessError(code, code)
      expect(error.code).toBe(code)
    }
  })
})

describe('RouteAccessError type guards', () => {
  it('isRouteAccessDenied returns true for ROUTE_ACCESS_DENIED', () => {
    const error = routeAccessError('ROUTE_ACCESS_DENIED', 'Denied')
    expect(isRouteAccessDenied(error)).toBe(true)
  })

  it('isRouteNotFound returns true for ROUTE_NOT_FOUND', () => {
    const error = routeAccessError('ROUTE_NOT_FOUND', 'Not found')
    expect(isRouteNotFound(error)).toBe(true)
  })

  it('isFlagDisabled returns true for FLAG_DISABLED', () => {
    const error = routeAccessError('FLAG_DISABLED', 'Disabled')
    expect(isFlagDisabled(error)).toBe(true)
  })
})

describe('Terminal state sets', () => {
  describe('TERMINAL_TALLER_ESTADOS', () => {
    it('contains cerrado and cancelado', () => {
      expect(TERMINAL_TALLER_ESTADOS.has('cerrado')).toBe(true)
      expect(TERMINAL_TALLER_ESTADOS.has('cancelado')).toBe(true)
    })

    it('does not contain non-terminal states', () => {
      expect(TERMINAL_TALLER_ESTADOS.has('borrador')).toBe(false)
      expect(TERMINAL_TALLER_ESTADOS.has('abierto')).toBe(false)
      expect(TERMINAL_TALLER_ESTADOS.has('en_curso')).toBe(false)
    })

  it('is readonly (reflects ReadonlySet)', () => {
    // ReadonlySet is a type-level assertion; the value is a Set with readonly index signature
    expect([...TERMINAL_TALLER_ESTADOS]).toEqual(['cerrado', 'cancelado'])
  })
  })

  describe('TERMINAL_PARTICIPANT_ESTADOS', () => {
    it('contains completado, no_completado, and abandono', () => {
      expect(TERMINAL_PARTICIPANT_ESTADOS.has('completado')).toBe(true)
      expect(TERMINAL_PARTICIPANT_ESTADOS.has('no_completado')).toBe(true)
      expect(TERMINAL_PARTICIPANT_ESTADOS.has('abandono')).toBe(true)
    })

    it('does not contain non-terminal states', () => {
      expect(TERMINAL_PARTICIPANT_ESTADOS.has('pendiente')).toBe(false)
      expect(TERMINAL_PARTICIPANT_ESTADOS.has('aprobado')).toBe(false)
    })
  })

  describe('TERMINAL_REPORT_ESTADOS', () => {
    it('contains cerrado', () => {
      expect(TERMINAL_REPORT_ESTADOS.has('cerrado')).toBe(true)
    })

    it('does not contain non-terminal states', () => {
      expect(TERMINAL_REPORT_ESTADOS.has('borrador')).toBe(false)
      expect(TERMINAL_REPORT_ESTADOS.has('enviado')).toBe(false)
      expect(TERMINAL_REPORT_ESTADOS.has('reabierto')).toBe(false)
    })
  })
})
