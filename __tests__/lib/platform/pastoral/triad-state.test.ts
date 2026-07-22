/**
 * W02 — DT-011 — Pastoral Triada state placeholder tests.
 * F(pastoral/triad-state)
 * Placeholder: triadTransition returns NOT_IMPLEMENTED error.
 * Full implementation in W03 DT-017.
 */
import { triadTransition, TERMINAL_TRIADA_ESTADOS } from '@/lib/platform/pastoral/triad-state'
import { TRIADA_STATES, TRIADA_DISSOLUTION_REASONS } from '@/lib/platform/pastoral/types'

describe('Pastoral Triada state (placeholder — W03 DT-017)', () => {
  describe('TRIADA_STATES', () => {
    it('has exactly 4 closed states (D13)', () => {
      expect(TRIADA_STATES).toHaveLength(4)
      expect(TRIADA_STATES).toContain('pending_confirmation')
      expect(TRIADA_STATES).toContain('active')
      expect(TRIADA_STATES).toContain('en_pausa')
      expect(TRIADA_STATES).toContain('disbanded')
    })
  })

  describe('TERMINAL_TRIADA_ESTADOS', () => {
    it('marks only disbanded as terminal (D13)', () => {
      expect([...TERMINAL_TRIADA_ESTADOS]).toEqual(['disbanded'])
    })
  })

  describe('TRIADA_DISSOLUTION_REASONS', () => {
    it('has exactly 5 closed reasons (D14)', () => {
      expect(TRIADA_DISSOLUTION_REASONS).toHaveLength(5)
      expect(TRIADA_DISSOLUTION_REASONS).toContain('gdv_liderazgo_removed')
      expect(TRIADA_DISSOLUTION_REASONS).toContain('servicio_retirado')
      expect(TRIADA_DISSOLUTION_REASONS).toContain('cambio_de_temporada')
      expect(TRIADA_DISSOLUTION_REASONS).toContain('pastoral_decision')
      expect(TRIADA_DISSOLUTION_REASONS).toContain('otro')
    })
  })

  describe('triadTransition placeholder', () => {
    it('returns NOT_IMPLEMENTED error', () => {
      const result = triadTransition()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_IMPLEMENTED')
        expect(result.error.message).toContain('W03 DT-017')
      }
    })
  })
})
