/**
 * W02 — DT-013 — Pastoral types invariants test.
 * F(pastoral/types)
 * Covers the shape invariants for PastoralOneOnOne,
 * PastoralOneOnOneParticipante, PastoralOneOnOneNota.
 */
import { PastoralErrorCode } from '@/lib/platform/pastoral/errors'
import type {
  PastoralOneOnOne,
  PastoralOneOnOneParticipante,
  PastoralOneOnOneNota,
  OneOnOneEstado,
  PastoralTriada,
  PastoralTriadaMiembro,
  PastoralTriadaEvento,
  TriadaEstado,
  TriadaDissolutionReason,
} from '@/lib/platform/pastoral/types'
import {
  ONE_ON_ONE_STATES,
  TERMINAL_ONE_ON_ONE_ESTADOS,
  TRIADA_STATES,
  TERMINAL_TRIADA_ESTADOS,
  TRIADA_DISSOLUTION_REASONS,
} from '@/lib/platform/pastoral/types'

describe('Pastoral types invariants', () => {
  describe('OneOnOneEstado', () => {
    it('ONE_ON_ONE_STATES has 6 values', () => {
      expect(ONE_ON_ONE_STATES).toHaveLength(6)
    })

    it('TERMINAL_ONE_ON_ONE_ESTADOS contains only completed, cancelled, no_realizado', () => {
      const terminals = [...TERMINAL_ONE_ON_ONE_ESTADOS]
      expect(terminals).toContain('completed')
      expect(terminals).toContain('cancelled')
      expect(terminals).toContain('no_realizado')
      expect(terminals).toHaveLength(3)
    })

    it('PastoralOneOnOne shape includes version: number', () => {
      const ooo: PastoralOneOnOne = {
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
      }
      expect(typeof ooo.version).toBe('number')
      expect(ooo.version).toBe(1)
    })

    it('PastoralOneOnOne has optional motivoCancelacion', () => {
      const ooo: PastoralOneOnOne = {
        id: '00000000-0000-0000-0000-000000000001',
        mentorOficialPersonaId: '00000000-0000-0000-0000-000000000002',
        autorPersonaId: '00000000-0000-0000-0000-000000000002',
        estado: 'completed',
        scheduledAt: '2026-08-01T10:00:00.000Z',
        completedAt: '2026-08-15T10:00:00.000Z',
        motivoCancelacion: null,
        resumen: 'Ana muestra gran crecimiento.',
        motivoNoRealizado: null,
        version: 3,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-08-15T10:00:00.000Z',
      }
      expect(ooo.motivoCancelacion).toBeNull()
    })

    it('PastoralOneOnOne has optional resumen', () => {
      const ooo: PastoralOneOnOne = {
        id: '00000000-0000-0000-0000-000000000001',
        mentorOficialPersonaId: '00000000-0000-0000-0000-000000000002',
        autorPersonaId: '00000000-0000-0000-0000-000000000002',
        estado: 'cancelled',
        scheduledAt: null,
        completedAt: null,
        motivoCancelacion: 'asistida_rechazo',
        resumen: null,
        motivoNoRealizado: null,
        version: 2,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-10T10:00:00.000Z',
      }
      expect(ooo.resumen).toBeNull()
    })
  })

  describe('PastoralOneOnOneParticipante shape', () => {
    it('has required oneOnOneId and personaId', () => {
      const p: PastoralOneOnOneParticipante = {
        id: '00000000-0000-0000-0000-000000000003',
        oneOnOneId: '00000000-0000-0000-0000-000000000001',
        personaId: '00000000-0000-0000-0000-000000000004',
        createdAt: '2026-07-01T10:00:00.000Z',
      }
      expect(p.oneOnOneId).toBeTruthy()
      expect(p.personaId).toBeTruthy()
    })
  })

  describe('PastoralOneOnOneNota shape', () => {
    it('has autor_persona_id and contenido', () => {
      const n: PastoralOneOnOneNota = {
        id: '00000000-0000-0000-0000-000000000005',
        oneOnOneId: '00000000-0000-0000-0000-000000000001',
        autorPersonaId: '00000000-0000-0000-0000-000000000002',
        contenido: 'Ana está mostrando gran progreso.',
        createdAt: '2026-07-15T10:00:00.000Z',
      }
      expect(n.contenido).toBeTruthy()
      expect(typeof n.contenido).toBe('string')
    })
  })

  describe('Triada types', () => {
    it('TRIADA_STATES has 4 values (D13)', () => {
      expect(TRIADA_STATES).toHaveLength(4)
    })

    it('TERMINAL_TRIADA_ESTADOS contains only disbanded', () => {
      expect([...TERMINAL_TRIADA_ESTADOS]).toEqual(['disbanded'])
    })

    it('TRIADA_DISSOLUTION_REASONS has 5 values (D14)', () => {
      expect(TRIADA_DISSOLUTION_REASONS).toHaveLength(5)
    })

    it('PastoralTriada shape includes version: number and motivo_disolucion optional', () => {
      const t: PastoralTriada = {
        id: '00000000-0000-0000-0000-000000000010',
        mentorOficialPersonaId: '00000000-0000-0000-0000-000000000002',
        autorPersonaId: '00000000-0000-0000-0000-000000000002',
        estado: 'active',
        contexto: 'nuevo_paso',
        motivoDisolucion: null,
        version: 1,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      }
      expect(typeof t.version).toBe('number')
      expect(t.motivoDisolucion).toBeNull()
    })
  })

  describe('PastoralErrorCode union', () => {
    it('includes CONCURRENCY_CONFLICT for version conflicts', () => {
      const code: PastoralErrorCode = 'CONCURRENCY_CONFLICT'
      expect(code).toBe('CONCURRENCY_CONFLICT')
    })
  })
})
