/**
 * PR11 — DT-045 — Solicitudes de retiro state machine tests.
 *
 * Pure unit tests. No DB calls (those are tested via integration).
 */

import {
  createSolicitudRetiro, // eslint-disable-line @typescript-eslint/no-unused-vars -- helpers exported for type narrowing in tests below
  InvalidSolicitudRetiroError,
  InvalidSolicitudTransitionError,
  reviewSolicitudRetiro,
  validateCreateSolicitudRetiro,
} from '@/lib/platform/talleres/solicitudes-retiro'

describe('validateCreateSolicitudRetiro', () => {
  const baseInput = {
    inscripcion_id: '00000000-0000-0000-0000-000000000001',
    grupo_asignacion_id: null,
    solicitante_persona_id: '00000000-0000-0000-0000-000000000002',
    tipo: 'participante_retiro' as const,
    motivo: 'Cambio de domicilio',
  }

  it('accepts a valid input with inscripcion_id set', () => {
    expect(() => validateCreateSolicitudRetiro(baseInput)).not.toThrow()
  })

  it('accepts a valid input with grupo_asignacion_id set', () => {
    expect(() =>
      validateCreateSolicitudRetiro({ ...baseInput, inscripcion_id: null, grupo_asignacion_id: '00000000-0000-0000-0000-000000000003' }),
    ).not.toThrow()
  })

  it('rejects empty motivo (INVALID_MOTIVO)', () => {
    try {
      validateCreateSolicitudRetiro({ ...baseInput, motivo: '   ' })
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudRetiroError)
      expect((e as InvalidSolicitudRetiroError).code).toBe('INVALID_MOTIVO')
    }
  })

  it('rejects both inscripcion_id and grupo_asignacion_id null (MISSING_TARGET)', () => {
    try {
      validateCreateSolicitudRetiro({ ...baseInput, inscripcion_id: null, grupo_asignacion_id: null })
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudRetiroError)
      expect((e as InvalidSolicitudRetiroError).code).toBe('MISSING_TARGET')
    }
  })

  it('rejects both targets set (MULTIPLE_TARGETS)', () => {
    try {
      validateCreateSolicitudRetiro({
        ...baseInput,
        inscripcion_id: '00000000-0000-0000-0000-000000000001',
        grupo_asignacion_id: '00000000-0000-0000-0000-000000000003',
      })
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudRetiroError)
      expect((e as InvalidSolicitudRetiroError).code).toBe('MULTIPLE_TARGETS')
    }
  })
})

describe('reviewSolicitudRetiro (state machine)', () => {
  it('pendiente + aprobar -> aprobada', () => {
    expect(reviewSolicitudRetiro({ estado: 'pendiente' }, 'aprobar')).toBe('aprobada')
  })

  it('pendiente + rechazar -> rechazada', () => {
    expect(reviewSolicitudRetiro({ estado: 'pendiente' }, 'rechazar')).toBe('rechazada')
  })

  it('aprobada + aprobar -> throws (terminal)', () => {
    try {
      reviewSolicitudRetiro({ estado: 'aprobada' }, 'aprobar')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudTransitionError)
      expect((e as InvalidSolicitudTransitionError).from).toBe('aprobada')
    }
  })

  it('aprobada + rechazar -> throws (terminal)', () => {
    try {
      reviewSolicitudRetiro({ estado: 'aprobada' }, 'rechazar')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudTransitionError)
    }
  })

  it('rechazada + aprobar -> throws (terminal)', () => {
    try {
      reviewSolicitudRetiro({ estado: 'rechazada' }, 'aprobar')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudTransitionError)
    }
  })

  it('rechazada + rechazar -> throws (terminal)', () => {
    try {
      reviewSolicitudRetiro({ estado: 'rechazada' }, 'rechazar')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSolicitudTransitionError)
    }
  })
})
