/**
 * W03 — DT-017 — Pastoral Triada state machine tests.
 * F(pastoral/triad-state)
 *
 * ESC-04: transitions to disbanded (terminal).
 * ESC-02: en_pausa → active round-trip.
 * ESC-03: stale version → CONCURRENCY_CONFLICT (409).
 * ESC-05: disbanded is terminal absolute — no transitions allowed.
 *
 * D13: 4 closed states — pending_confirmation, active, en_pausa, disbanded.
 * D14: 5 dissolution reasons.
 */
import { triadTransition, TRIADA_TRANSITIONS } from '@/lib/platform/pastoral/triad-state'
import {
  TRIADA_STATES,
  TRIADA_DISSOLUTION_REASONS,
  type PastoralTriada,
  type TriadaEstado,
  type TriadaAccion,
} from '@/lib/platform/pastoral/types'

function makeTriada(overrides: Partial<PastoralTriada> = {}): PastoralTriada {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    mentorOficialPersonaId: '00000000-0000-0000-0000-000000000002',
    autorPersonaId: '00000000-0000-0000-0000-000000000002',
    estado: 'pending_confirmation',
    contexto: 'nuevo_paso',
    motivoDisolucion: null,
    version: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('Pastoral Triada state machine (DT-017)', () => {
  describe('TRIADA_STATES — D13 closed set', () => {
    it('has exactly 4 closed states', () => {
      expect(TRIADA_STATES).toHaveLength(4)
    })

    it('contains all required states', () => {
      expect(TRIADA_STATES).toContain('pending_confirmation')
      expect(TRIADA_STATES).toContain('active')
      expect(TRIADA_STATES).toContain('en_pausa')
      expect(TRIADA_STATES).toContain('disbanded')
    })
  })

  describe('TRIADA_TRANSITIONS — D13 closed matrix', () => {
    it('has an entry for every state', () => {
      for (const estado of TRIADA_STATES) {
        expect(TRIADA_TRANSITIONS).toHaveProperty(estado)
      }
    })

    it('pending_confirmation → active (via confirm action)', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'pending_confirmation', version: 1 }),
        accion: 'confirm',
        version: 1,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('active')
        expect(result.triadaNueva.version).toBe(2)
      }
    })

    it('pending_confirmation can disband directly', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'pending_confirmation', version: 1 }),
        accion: 'disband',
        version: 1,
        motivo: 'pastoral_decision',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('disbanded')
      }
    })

    it('active → en_pausa via pause action', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'pause',
        version: 2,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('en_pausa')
        expect(result.triadaNueva.version).toBe(3)
      }
    })

    it('active → disbanded via disband action with motivo', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: 'gdv_liderazgo_removed',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('disbanded')
        expect(result.triadaNueva.motivoDisolucion).toBe('gdv_liderazgo_removed')
        expect(result.triadaNueva.version).toBe(3)
      }
    })

    it('en_pausa → active via resume action (round-trip — ESC-02)', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'en_pausa', version: 3 }),
        accion: 'resume',
        version: 3,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('active')
        expect(result.triadaNueva.version).toBe(4)
      }
    })

    it('en_pausa → disbanded via disband action', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'en_pausa', version: 3 }),
        accion: 'disband',
        version: 3,
        motivo: 'cambio_de_temporada',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('disbanded')
      }
    })
  })

  describe('ESC-04: transitions to disbanded', () => {
    it.each`
      fromState              | accion     | motivo
      ${'pending_confirmation'} | ${'disband'} | ${'pastoral_decision'}
      ${'active'}               | ${'disband'} | ${'servicio_retirado'}
      ${'en_pausa'}             | ${'disband'} | ${'cambio_de_temporada'}
    `('from $fromState → disbanded with motivo $motivo', ({ fromState, accion, motivo }) => {
      const result = triadTransition({
        triada: makeTriada({ estado: fromState as TriadaEstado, version: 2 }),
        accion: accion as TriadaAccion,
        version: 2,
        motivo: motivo as typeof TRIADA_DISSOLUTION_REASONS[number],
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.triadaNueva.estado).toBe('disbanded')
        expect(result.triadaNueva.motivoDisolucion).toBe(motivo)
      }
    })
  })

  describe('ESC-02: en_pausa → active round-trip', () => {
    it('full round-trip: pending_confirmation → active → en_pausa → active', () => {
      // Step 1: confirm
      const s1 = triadTransition({
        triada: makeTriada({ estado: 'pending_confirmation', version: 1 }),
        accion: 'confirm',
        version: 1,
      })
      expect(s1.ok).toBe(true)

      // Step 2: pause
      const s2 = triadTransition({
        triada: s1.ok ? s1.triadaNueva : makeTriada(),
        accion: 'pause',
        version: 2,
      })
      expect(s2.ok).toBe(true)
      if (s2.ok) expect(s2.triadaNueva.estado).toBe('en_pausa')

      // Step 3: resume back to active
      const s3 = triadTransition({
        triada: s2.ok ? s2.triadaNueva : makeTriada(),
        accion: 'resume',
        version: 3,
      })
      expect(s3.ok).toBe(true)
      if (s3.ok) {
        expect(s3.triadaNueva.estado).toBe('active')
        expect(s3.triadaNueva.version).toBe(4)
      }
    })
  })

  describe('ESC-05: disbanded is terminal absolute — no transitions allowed', () => {
    it('cannot transition from disbanded to any other state', () => {
      const disband = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: 'otro',
      })
      expect(disband.ok).toBe(true)
      if (!disband.ok) return

      const reActivate = triadTransition({
        triada: disband.triadaNueva,
        accion: 'resume',
        version: 3,
      })
      expect(reActivate.ok).toBe(false)
      if (!reActivate.ok) {
        expect(reActivate.error.code).toBe('TERMINAL_STATE')
      }

      const reConfirm = triadTransition({
        triada: disband.triadaNueva,
        accion: 'confirm',
        version: 3,
      })
      expect(reConfirm.ok).toBe(false)
      if (!reConfirm.ok) {
        expect(reConfirm.error.code).toBe('TERMINAL_STATE')
      }
    })

    it('disbanded cannot be reached again after disband', () => {
      const r1 = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: 'gdv_liderazgo_removed',
      })
      expect(r1.ok).toBe(true)
      if (!r1.ok) return

      const r2 = triadTransition({
        triada: r1.triadaNueva,
        accion: 'disband',
        version: 3,
        motivo: 'pastoral_decision',
      })
      expect(r2.ok).toBe(false)
      if (!r2.ok) {
        expect(r2.error.code).toBe('TERMINAL_STATE')
      }
    })
  })

  describe('ESC-03: stale version → CONCURRENCY_CONFLICT (409)', () => {
    it('rejects stale version', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 5 }),
        accion: 'disband',
        version: 3, // stale
        motivo: 'otro',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('CONCURRENCY_CONFLICT')
        expect(result.error.context).toMatchObject({ expected: 5, received: 3 })
      }
    })

    it('accepts matching version', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: 'pastoral_decision',
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('disband requires motivo from closed catalog (ESC-05 of pastoral-triada-disband)', () => {
    it('rejects disband without motivo', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        // missing motivo
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_MOTIVO')
      }
    })

    it('rejects disband with motivo outside closed catalog', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: 'invalid_motivo' as typeof TRIADA_DISSOLUTION_REASONS[number],
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MOTIVO_FOR_TRANSITION')
      }
    })

    it.each`
      motivo
      ${'gdv_liderazgo_removed'}
      ${'servicio_retirado'}
      ${'cambio_de_temporada'}
      ${'pastoral_decision'}
      ${'otro'}
    `('accepts valid motivo: $motivo', ({ motivo }) => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'disband',
        version: 2,
        motivo: motivo as typeof TRIADA_DISSOLUTION_REASONS[number],
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('invalid state transitions are rejected', () => {
    it('pending_confirmation cannot go directly to en_pausa', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'pending_confirmation', version: 1 }),
        accion: 'pause',
        version: 1,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
      }
    })

    it('pending_confirmation cannot be resumed', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'pending_confirmation', version: 1 }),
        accion: 'resume',
        version: 1,
      })
      expect(result.ok).toBe(false)
    })

    it('confirm is only valid from pending_confirmation', () => {
      const result = triadTransition({
        triada: makeTriada({ estado: 'active', version: 2 }),
        accion: 'confirm',
        version: 2,
      })
      expect(result.ok).toBe(false)
    })
  })
})
