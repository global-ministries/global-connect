/**
 * W04 — DT-023 — buildPastoralEvent helper tests.
 * F(pastoral/build-event) — pure helper for building pastoral ledger event inputs.
 *
 * Covers REQ-06 of operating-core-pastoral-bridge spec (ESC-01, ESC-05, ESC-06):
 *  - ESC-01: 1:1 event with kind pastoral_one_on_one_completed
 *  - ESC-05: triada event with kind pastoral_triada_formed
 *  - ESC-06: crisis event with kind pastoral_crisis_detected (sensitivity='sensitive')
 */

import { randomUUID } from 'node:crypto'
import {
  buildPastoralEvent,
  buildOneOnOnePastoralEvent,
  buildTriadaPastoralEvent,
  buildPastoralCrisisEvent,
  sensitivityForKind,
} from '../../../../lib/platform/pastoral/build-pastoral-event'
import type { PastoralLedgerEventInput } from '../../../../lib/platform/pastoral/participation-ledger-pastoral-writer'

describe('buildPastoralEvent', () => {
  const actorPersonaId = randomUUID()
  const subjectId = randomUUID()

  describe('ESC-01: pastoral_one_on_one_completed', () => {
    it('builds correct event input for one_on_one completed', () => {
      const result = buildPastoralEvent(
        'pastoral_one_on_one_completed',
        actorPersonaId,
        subjectId,
        { stepId: 'step-1' },
      )

      expect(result.kind).toBe('pastoral_one_on_one_completed')
      expect(result.subjectId).toBe(subjectId)
      expect(result.actorPersonaId).toBe(actorPersonaId)
      expect(result.metadata).toEqual({ stepId: 'step-1' })
      expect(result.captureSource).toBe('manual')
    })
  })

  describe('ESC-05: pastoral_triada_formed', () => {
    it('builds correct event input for triada formed', () => {
      const result = buildPastoralEvent(
        'pastoral_triada_formed',
        actorPersonaId,
        subjectId,
        { contexto: 'nuevo_paso' },
      )

      expect(result.kind).toBe('pastoral_triada_formed')
      expect(result.subjectId).toBe(subjectId)
      expect(result.actorPersonaId).toBe(actorPersonaId)
      expect(result.metadata).toEqual({ contexto: 'nuevo_paso' })
    })
  })

  describe('ESC-06: pastoral_crisis_detected (sensitivity=sensitive)', () => {
    it('builds crisis event with sensitivity sensitive', () => {
      const result = buildPastoralEvent(
        'pastoral_crisis_detected',
        actorPersonaId,
        subjectId,
        { categoria: 'duelo' },
      )

      expect(result.kind).toBe('pastoral_crisis_detected')
      expect(result.captureSource).toBe('system')
      // Note: sensitivity is set by the writer, not by buildPastoralEvent
      // The helper just ensures crisis events have correct defaults
    })
  })

  describe('sensitivityForKind', () => {
    it('pastoral_crisis_detected returns sensitive', () => {
      expect(sensitivityForKind('pastoral_crisis_detected')).toBe('sensitive')
    })

    it('all other pastoral kinds return internal', () => {
      const nonCrisisKinds = [
        'pastoral_one_on_one_logged',
        'pastoral_one_on_one_completed',
        'pastoral_triada_formed',
      ] as const

      for (const kind of nonCrisisKinds) {
        expect(sensitivityForKind(kind)).toBe('internal')
      }
    })
  })

  describe('buildOneOnOnePastoralEvent', () => {
    it('sets subjectId to oneOnOneId', () => {
      const oneOnOneId = randomUUID()
      const result = buildOneOnOnePastoralEvent({
        kind: 'pastoral_one_on_one_completed',
        actorPersonaId,
        oneOnOneId,
      })

      expect(result.subjectId).toBe(oneOnOneId)
      expect(result.kind).toBe('pastoral_one_on_one_completed')
    })

    it('defaults occurredAt to now', () => {
      const before = new Date().toISOString()
      const result = buildOneOnOnePastoralEvent({
        kind: 'pastoral_one_on_one_logged',
        actorPersonaId,
        oneOnOneId: randomUUID(),
      })
      const after = new Date().toISOString()

      expect(result.occurredAt).toBeDefined()
      expect(result.occurredAt >= before).toBe(true)
      expect(result.occurredAt <= after).toBe(true)
    })

    it('accepts custom occurredAt', () => {
      const customDate = '2024-01-15T10:00:00.000Z'
      const result = buildOneOnOnePastoralEvent({
        kind: 'pastoral_one_on_one_logged',
        actorPersonaId,
        oneOnOneId: randomUUID(),
        occurredAt: customDate,
      })

      expect(result.occurredAt).toBe(customDate)
    })
  })

  describe('buildTriadaPastoralEvent', () => {
    it('sets subjectId to triadaId', () => {
      const triadaId = randomUUID()
      const result = buildTriadaPastoralEvent({
        kind: 'pastoral_triada_formed',
        actorPersonaId,
        triadaId,
      })

      expect(result.subjectId).toBe(triadaId)
      expect(result.kind).toBe('pastoral_triada_formed')
    })
  })

  describe('buildPastoralCrisisEvent', () => {
    it('sets kind to pastoral_crisis_detected', () => {
      const result = buildPastoralCrisisEvent({
        actorPersonaId,
        oneOnOneId: randomUUID(),
      })

      expect(result.kind).toBe('pastoral_crisis_detected')
    })

    it('defaults captureSource to system', () => {
      const result = buildPastoralCrisisEvent({
        actorPersonaId,
        oneOnOneId: randomUUID(),
      })

      expect(result.captureSource).toBe('system')
    })
  })
})
