/**
 * W02 — DT-010 — Pastoral 1:1 state machine tests.
 * F(pastoral/state)
 * ESC-01: happy path transitions.
 * ESC-02: invalid transition → INVALID_STATE_TRANSITION.
 * ESC-03: stale version → CONCURRENCY_CONFLICT (409).
 */
import { transition, ONE_ON_ONE_STATES, ONE_ON_ONE_TRANSITIONS } from '@/lib/platform/pastoral/state'
import type { PastoralOneOnOne } from '@/lib/platform/pastoral/types'
import { PastoralErrorCode } from '@/lib/platform/pastoral/errors'

function makeOneOnOne(overrides: Partial<PastoralOneOnOne> = {}): PastoralOneOnOne {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    mentorOficialPersonaId: '00000000-0000-0000-0000-000000000002',
    autorPersonaId: '00000000-0000-0000-0000-000000000002',
    estado: 'pending_participant',
    scheduledAt: null,
    completedAt: null,
    motivoCancelacion: null,
    resumen: null,
    motivoNoRealizado: null,
    version: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('Pastoral 1:1 state machine', () => {
  describe('ONE_ON_ONE_STATES', () => {
    it('has exactly 6 closed states (D12)', () => {
      expect(ONE_ON_ONE_STATES).toHaveLength(6)
      expect(ONE_ON_ONE_STATES).toContain('pending_participant')
      expect(ONE_ON_ONE_STATES).toContain('scheduled')
      expect(ONE_ON_ONE_STATES).toContain('in_progress')
      expect(ONE_ON_ONE_STATES).toContain('completed')
      expect(ONE_ON_ONE_STATES).toContain('cancelled')
      expect(ONE_ON_ONE_STATES).toContain('no_realizado')
    })
  })

  describe('ESC-01: happy path', () => {
    it('pending_participant → scheduled via schedule action', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'pending_participant', version: 1 }),
        accion: 'schedule',
        version: 1,
        scheduledAt: '2026-08-01T10:00:00.000Z',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('scheduled')
        expect(result.oneOnOneNuevo.version).toBe(2)
        expect(result.oneOnOneNuevo.scheduledAt).toBe('2026-08-01T10:00:00.000Z')
      }
    })

    it('scheduled → in_progress via start action', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 2 }),
        accion: 'start',
        version: 2,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('in_progress')
        expect(result.oneOnOneNuevo.version).toBe(3)
      }
    })

    it('in_progress → completed via complete action with resumen', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'in_progress', version: 3 }),
        accion: 'complete',
        version: 3,
        resumen: 'Ana muestra crecimiento espiritual significativo.',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('completed')
        expect(result.oneOnOneNuevo.version).toBe(4)
        expect(result.oneOnOneNuevo.resumen).toBe('Ana muestra crecimiento espiritual significativo.')
        expect(result.oneOnOneNuevo.completedAt).toBeTruthy()
      }
    })

    it('pending_participant → cancelled via cancel action with motivo', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'pending_participant', version: 1 }),
        accion: 'cancel',
        version: 1,
        motivoCancelacion: 'asistida_rechazo_acompanamiento',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('cancelled')
        expect(result.oneOnOneNuevo.version).toBe(2)
        expect(result.oneOnOneNuevo.motivoCancelacion).toBe('asistida_rechazo_acompanamiento')
      }
    })

    it('scheduled → no_realizado via mark_no_realizado with motivo', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 2 }),
        accion: 'mark_no_realizado',
        version: 2,
        motivoNoRealizado: 'vencido_por_tiempo',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('no_realizado')
        expect(result.oneOnOneNuevo.version).toBe(3)
        expect(result.oneOnOneNuevo.motivoNoRealizado).toBe('vencido_por_tiempo')
      }
    })

    it('add_nota bumps version without changing state', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'in_progress', version: 3 }),
        accion: 'add_nota',
        version: 3,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.oneOnOneNuevo.estado).toBe('in_progress')
        expect(result.oneOnOneNuevo.version).toBe(4)
      }
    })
  })

  describe('ESC-02: invalid transition', () => {
    it('pending_participant → completed is rejected', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'pending_participant', version: 1 }),
        accion: 'complete',
        version: 1,
        resumen: 'test',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
      }
    })

    it('completed is terminal — cannot transition', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'completed', version: 5 }),
        accion: 'schedule',
        version: 5,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TERMINAL_STATE')
      }
    })

    it('cancelled is terminal — cannot transition', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'cancelled', version: 2 }),
        accion: 'start',
        version: 2,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TERMINAL_STATE')
      }
    })

    it('no_realizado is terminal — cannot transition', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'no_realizado', version: 3 }),
        accion: 'complete',
        version: 3,
        resumen: 'test',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TERMINAL_STATE')
      }
    })

    it('pending_participant cannot start directly', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'pending_participant', version: 1 }),
        accion: 'start',
        version: 1,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
      }
    })
  })

  describe('ESC-03: stale version → 409 CONCURRENCY_CONFLICT', () => {
    it('rejects when version does not match', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 5 }),
        accion: 'start',
        version: 3, // stale
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('CONCURRENCY_CONFLICT')
        expect(result.error.context).toMatchObject({ expected: 5, received: 3 })
      }
    })

    it('accepts when version matches', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 2 }),
        accion: 'start',
        version: 2,
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('cancel requires motivo_cancelacion', () => {
    it('rejects cancel without motivo', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 2 }),
        accion: 'cancel',
        version: 2,
        // missing motivoCancelacion
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_MOTIVO')
      }
    })

    it('rejects cancel with empty motivo', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'in_progress', version: 3 }),
        accion: 'cancel',
        version: 3,
        motivoCancelacion: '   ',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_MOTIVO')
      }
    })
  })

  describe('complete requires resumen', () => {
    it('rejects complete without resumen', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'in_progress', version: 3 }),
        accion: 'complete',
        version: 3,
        // missing resumen
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_MOTIVO')
      }
    })
  })

  describe('mark_no_realizado requires motivo_no_realizado', () => {
    it('rejects without motivo', () => {
      const result = transition({
        oneOnOne: makeOneOnOne({ estado: 'scheduled', version: 2 }),
        accion: 'mark_no_realizado',
        version: 2,
        // missing motivoNoRealizado
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_MOTIVO')
      }
    })
  })
})
