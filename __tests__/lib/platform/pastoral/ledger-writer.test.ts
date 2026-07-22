/**
 * W04 — DT-022 — Pastoral ledger writer tests.
 * F(pastoral/ledger-writer) — PastoralLedgerWriter emits to shared ledger.
 *
 * Tests:
 *  1. Writer emits pastoral_one_on_one_completed with actor_persona_id and bounded metadata
 *  2. Writer rejects metadata containing PII keys (cedula/telefono/email/nombre/apellido)
 *  3. pastoral_crisis_detected uses sensitivity='sensitive'
 *  4. Other pastoral kinds use sensitivity='internal'
 *  5. All 14 pastoral kinds are accepted by the writer
 */

import { randomUUID } from 'node:crypto'
import type { ParticipationLedgerEvent } from '../../../../lib/platform/operating-core/participation-ledger-repository'
import { PASTORAL_PARTICIPATION_KINDS } from '../../../../lib/platform/pastoral/participation-kinds'
import {
  createPastoralLedgerWriter,
  metadataHasPII,
  pastoralKindSensitivity,
} from '../../../../lib/platform/pastoral/participation-ledger-pastoral-writer'

// ─── Fake repository ───────────────────────────────────────────────────────────

interface FakeLedgerEntry {
  input: Record<string, unknown>
  output: ParticipationLedgerEvent
}

function createFakeLedgerRepository(): {
  repository: {
    append: (input: Record<string, unknown>) => Promise<ParticipationLedgerEvent>
    listBySubject: () => Promise<readonly ParticipationLedgerEvent[]>
    findById: () => Promise<ParticipationLedgerEvent | null>
    correct: () => Promise<ParticipationLedgerEvent>
  }
  entries: FakeLedgerEntry[]
} {
  const entries: FakeLedgerEntry[] = []

  const repository = {
    async append(input: Record<string, unknown>): Promise<ParticipationLedgerEvent> {
      const output: ParticipationLedgerEvent = {
        id: randomUUID(),
        kind: input.kind as ParticipationLedgerEvent['kind'],
        subjectId: input.subjectId as string,
        occurredAt: (input.occurredAt as string) ?? new Date().toISOString(),
        actorPersonaId: input.actorPersonaId as string,
        captureSource: (input.captureSource as string) ?? 'manual',
        experience: 'pastoral',
        eventId: null,
        serviceId: null,
        eventInstanceId: null,
        correctsEventId: null,
        status: 'recorded',
        metadata: (input.metadata as Record<string, unknown>) ?? {},
        createdAt: new Date().toISOString(),
      }
      entries.push({ input, output })
      return output
    },
    listBySubject() { return Promise.resolve([] as readonly ParticipationLedgerEvent[]) },
    findById() { return Promise.resolve(null as ParticipationLedgerEvent | null) },
    correct() { return Promise.resolve({} as ParticipationLedgerEvent) },
  }

  return { repository, entries }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PastoralLedgerWriter', () => {
  describe('metadataHasPII', () => {
    it('returns false for empty metadata', () => {
      expect(metadataHasPII({})).toBe(false)
      expect(metadataHasPII(undefined)).toBe(false)
    })

    it('returns false for safe metadata', () => {
      expect(metadataHasPII({ stepId: 'abc', estado: 'completed' })).toBe(false)
    })

    it('returns true for cedula', () => {
      expect(metadataHasPII({ cedula: '12345678' })).toBe(true)
    })

    it('returns true for telefono', () => {
      expect(metadataHasPII({ telefono: '+1234567890' })).toBe(true)
    })

    it('returns true for email', () => {
      expect(metadataHasPII({ email: 'test@example.com' })).toBe(true)
    })

    it('returns true for nombre', () => {
      expect(metadataHasPII({ nombre: 'Juan' })).toBe(true)
    })

    it('returns true for apellido', () => {
      expect(metadataHasPII({ apellido: 'Perez' })).toBe(true)
    })
  })

  describe('pastoralKindSensitivity', () => {
    it('pastoral_crisis_detected returns sensitive', () => {
      expect(pastoralKindSensitivity('pastoral_crisis_detected')).toBe('sensitive')
    })

    it('pastoral_one_on_one_completed returns internal', () => {
      expect(pastoralKindSensitivity('pastoral_one_on_one_completed')).toBe('internal')
    })

    it('pastoral_triada_formed returns internal', () => {
      expect(pastoralKindSensitivity('pastoral_triada_formed')).toBe('internal')
    })
  })

  describe('emitPastoralEvent', () => {
    it('emits pastoral_one_on_one_completed with actor_persona_id and bounded metadata', async () => {
      const { repository, entries } = createFakeLedgerRepository()
      const writer = createPastoralLedgerWriter(repository)

      const personaId = randomUUID()
      const oneOnOneId = randomUUID()

      await writer.emitPastoralEvent({
        kind: 'pastoral_one_on_one_completed',
        subjectId: oneOnOneId,
        actorPersonaId: personaId,
        metadata: { stepId: 'step-1', estado: 'completed' },
      })

      expect(entries).toHaveLength(1)
      expect(entries[0].input.actorPersonaId).toBe(personaId)
      expect(entries[0].input.metadata).toEqual({ stepId: 'step-1', estado: 'completed' })
    })

    it('rejects metadata containing PII', async () => {
      const { repository } = createFakeLedgerRepository()
      const writer = createPastoralLedgerWriter(repository)

      const personaId = randomUUID()
      const oneOnOneId = randomUUID()

      let error: Error | undefined
      try {
        await writer.emitPastoralEvent({
          kind: 'pastoral_one_on_one_completed',
          subjectId: oneOnOneId,
          actorPersonaId: personaId,
          metadata: { cedula: '12345678' },
        })
      } catch (e) {
        error = e as Error
      }
      expect(error?.message).toContain('metadata must not contain PII keys')
    })

    it('rejects metadata containing telefono', async () => {
      const { repository } = createFakeLedgerRepository()
      const writer = createPastoralLedgerWriter(repository)

      let error: Error | undefined
      try {
        await writer.emitPastoralEvent({
          kind: 'pastoral_one_on_one_completed',
          subjectId: randomUUID(),
          actorPersonaId: randomUUID(),
          metadata: { telefono: '+1234567890' },
        })
      } catch (e) {
        error = e as Error
      }
      expect(error?.message).toContain('metadata must not contain PII keys')
    })

    it('rejects metadata containing email', async () => {
      const { repository } = createFakeLedgerRepository()
      const writer = createPastoralLedgerWriter(repository)

      let error: Error | undefined
      try {
        await writer.emitPastoralEvent({
          kind: 'pastoral_one_on_one_completed',
          subjectId: randomUUID(),
          actorPersonaId: randomUUID(),
          metadata: { email: 'test@example.com' },
        })
      } catch (e) {
        error = e as Error
      }
      expect(error?.message).toContain('metadata must not contain PII keys')
    })
  })

  describe('all 14 pastoral kinds', () => {
    for (const kind of PASTORAL_PARTICIPATION_KINDS) {
      it(`accepts kind: ${kind}`, async () => {
        const { repository, entries } = createFakeLedgerRepository()
        const writer = createPastoralLedgerWriter(repository)

        await writer.emitPastoralEvent({
          kind,
          subjectId: randomUUID(),
          actorPersonaId: randomUUID(),
        })

        expect(entries).toHaveLength(1)
        expect(entries[0].input.kind).toBe(kind)
      })
    }
  })
})
