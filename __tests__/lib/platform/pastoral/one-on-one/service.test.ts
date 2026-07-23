/**
 * W05 — DT-030 — Pastoral 1:1 service tests.
 * F(pastoral/one-on-one/service)
 *
 * ESC-01 (pastoral-one-on-one-complete): happy path completion.
 *
 * Tests:
 * - ESC-01: in_progress → completed (happy path)
 * - ESC-04: resumen > 500 chars → rejection
 * - ESC-05: sensitive pattern in resumen → rejection
 * - stale version → ConcurrencyConflictError
 * - not found → PASTORAL_NOT_FOUND
 */
import { createPastoralOneOnOneService } from '@/lib/platform/pastoral/one-on-one/service'
import { ConcurrencyConflictError } from '@/lib/platform/pastoral/one-on-one/repository-fake'
import type { PastoralOneOnOne } from '@/lib/platform/pastoral/types'
import type { CompleteOneOnOneResultType } from '@/lib/platform/pastoral/one-on-one/service'

// Type helper for test assertions — narrows the union after ok check
function expectOk(r: CompleteOneOnOneResultType): asserts r is Extract<CompleteOneOnOneResultType, { ok: true }> {
  if (!r.ok) throw new Error('Expected ok=true but got: ' + JSON.stringify(r.error))
}

function makeOneOnOne(overrides: Partial<PastoralOneOnOne> = {}): PastoralOneOnOne {
  return {
    id: 'ooo-1',
    mentorOficialPersonaId: 'mentor-1',
    autorPersonaId: 'mentor-1',
    estado: 'in_progress',
    scheduledAt: '2026-08-01T10:00:00.000Z',
    completedAt: null,
    motivoCancelacion: null,
    resumen: null,
    motivoNoRealizado: null,
    version: 2,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

// ─── Mock repository ──────────────────────────────────────────────────────────

function createMockRepository() {
  const storage: { oneOnOnes: PastoralOneOnOne[] } = { oneOnOnes: [] }
  const mockEmit = jest.fn()

  async function getById(id: string) {
    return storage.oneOnOnes.find((o) => o.id === id) ?? null
  }

  async function update(id: string, update: { estado: string; resumen: string; expectedVersion: number }) {
    const current = storage.oneOnOnes.find((o) => o.id === id)
    if (!current) throw new Error(`Not found: ${id}`)
    if (update.expectedVersion !== current.version) {
      throw new ConcurrencyConflictError(`version mismatch`, { id, expectedVersion: update.expectedVersion, currentVersion: current.version })
    }
    const updated: PastoralOneOnOne = {
      ...current,
      estado: update.estado as PastoralOneOnOne['estado'],
      resumen: update.resumen,
      version: current.version + 1,
      completedAt: update.estado === 'completed' ? new Date().toISOString() : current.completedAt,
      updatedAt: new Date().toISOString(),
    }
    storage.oneOnOnes = storage.oneOnOnes.map((o) => (o.id === id ? updated : o))
    return updated
  }

  return { storage, mockEmit, getById, update }
}

// ─── Mock ledger writer ───────────────────────────────────────────────────────

function createMockLedgerWriter() {
  const events: unknown[] = []
  return {
    emitPastoralEvent: jest.fn().mockImplementation(async (input) => {
      events.push(input)
      return {
        id: 'ledger-event-1',
        kind: input.kind,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        actorPersonaId: input.actorPersonaId,
        captureSource: input.captureSource ?? 'manual',
        experience: 'pastoral',
        eventId: null,
        serviceId: null,
        eventInstanceId: null,
        correctsEventId: null,
        status: 'recorded' as const,
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
      }
    }),
    emit: jest.fn().mockImplementation(async (input) => {
      events.push(input)
      return {
        id: 'ledger-event-1',
        kind: input.kind,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        actorPersonaId: input.actorPersonaId,
        captureSource: input.captureSource ?? 'manual',
        experience: 'pastoral',
        eventId: null,
        serviceId: null,
        eventInstanceId: null,
        correctsEventId: null,
        status: 'recorded' as const,
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
      }
    }),
    events,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PastoralOneOnOneService — completeOneOnOne', () => {
  let mockRepo: ReturnType<typeof createMockRepository>
  let mockLedger: ReturnType<typeof createMockLedgerWriter>
  let service: ReturnType<typeof createPastoralOneOnOneService>

  beforeEach(() => {
    mockRepo = createMockRepository()
    mockLedger = createMockLedgerWriter()

    // Create a minimal mock repository that matches the PastoralOneOnOneRepository interface
    const repo = {
      createOneOnOne: jest.fn(),
      getOneOnOneById: mockRepo.getById,
      listOneOnOnes: jest.fn(),
      updateOneOnOne: mockRepo.update,
      addParticipante: jest.fn(),
      listParticipantes: jest.fn(),
      addNota: jest.fn(),
      listNotas: jest.fn(),
      emitPastoralEvent: mockLedger.emitPastoralEvent,
    }

    service = createPastoralOneOnOneService(repo as never, mockLedger)
  })

  // ESC-01: happy path — in_progress → completed
  describe('ESC-01: happy path completion', () => {
    it('completes in_progress 1:1 and emits pastoral_one_on_one_completed event', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 2 }))

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'Good session, discussed growth areas.',
        expectedVersion: 2,
      })

      expect(result.ok).toBe(true)
      expectOk(result)
      expect(result.oneOnOne.estado).toBe('completed')
      expect(result.oneOnOne.resumen).toBe('Good session, discussed growth areas.')
      expect(result.oneOnOne.version).toBe(3)
      expect(result.oneOnOne.completedAt).toBeDefined()
    })

    it('emits pastoral_one_on_one_completed to the ledger', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 2 }))

      await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'Summary of session',
        expectedVersion: 2,
      })

      expect(mockLedger.emitPastoralEvent).toHaveBeenCalledTimes(1)
      const emittedEvent = mockLedger.emitPastoralEvent.mock.calls[0]![0]
      expect(emittedEvent.kind).toBe('pastoral_one_on_one_completed')
      expect(emittedEvent.actorPersonaId).toBe('mentor-1')
    })

    it('bumps version by 1 on completion', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 5 }))

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'Session complete',
        expectedVersion: 5,
      })

      expect(result.ok).toBe(true)
      expectOk(result)
      expect(result.oneOnOne.version).toBe(6)
    })
  })

  // ESC-04: resumen > 500 chars → rejection
  describe('ESC-04: resumen too long (>500 chars)', () => {
    it('rejects with error when resumen exceeds 500 characters', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 2 }))
      const longResumen = 'a'.repeat(501)

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: longResumen,
        expectedVersion: 2,
      })

      expect(result.ok).toBe(false)
      const e = result as Extract<CompleteOneOnOneResultType, { ok: false }>
      expect(e.error.code).toBe('MISSING_MOTIVO')
    })
  })

  // ESC-05: sensitive pattern in resumen → rejection
  describe('ESC-05: sensitive pattern in resumen', () => {
    it('rejects when resumen contains sensitive pattern (D17, P4)', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 2 }))

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'The person mentioned having thoughts of suicidio during the session',
        expectedVersion: 2,
      })

      expect(result.ok).toBe(false)
      const e = result as Extract<CompleteOneOnOneResultType, { ok: false }>
      expect(e.error.code).toBe('INVALID_STATE_TRANSITION')
    })

    it('rejects resumen with cedula pattern', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 2 }))

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'The person shared their cedula number during the session',
        expectedVersion: 2,
      })

      expect(result.ok).toBe(false)
    })
  })

  // Concurrency conflict
  describe('ConcurrencyConflictError', () => {
    it('returns CONCURRENCY_CONFLICT error on stale version', async () => {
      mockRepo.storage.oneOnOnes.push(makeOneOnOne({ estado: 'in_progress', version: 5 }))

      const result = await service.completeOneOnOne({
        oneOnOneId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        resumen: 'Session summary',
        expectedVersion: 3, // stale — current is 5
      })

      expect(result.ok).toBe(false)
      const e = result as Extract<CompleteOneOnOneResultType, { ok: false }>
      expect(e.error.code).toBe('CONCURRENCY_CONFLICT')
    })
  })

  // Not found
  describe('PASTORAL_NOT_FOUND', () => {
    it('returns PASTORAL_NOT_FOUND when 1:1 does not exist', async () => {
      const result = await service.completeOneOnOne({
        oneOnOneId: 'not-found',
        actorPersonaId: 'mentor-1',
        resumen: 'Session summary',
        expectedVersion: 1,
      })

      expect(result.ok).toBe(false)
      const e = result as Extract<CompleteOneOnOneResultType, { ok: false }>
      expect(e.error.code).toBe('PASTORAL_NOT_FOUND')
    })
  })
})
