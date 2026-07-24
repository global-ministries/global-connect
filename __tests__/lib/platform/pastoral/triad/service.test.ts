/**
 * W07 — DT-036 — Pastoral Triada service tests.
 * F(pastoral/triad/service)
 *
 * Covers:
 * - ESC-01 of pastoral-triada-create: auto-formation by new step (P4)
 * - ESC-02 of pastoral-triada-disband: rejection without motivo
 * - Disband with audit and event emission
 */
import { createPastoralTriadaService } from '@/lib/platform/pastoral/triad/service'
import { ConcurrencyConflictError } from '@/lib/platform/pastoral/triad/repository-fake'
import type { PastoralTriada } from '@/lib/platform/pastoral/types'
import type { CreateTriadaWithAutoFormationResultType, DisbandTriadaWithAuditResultType, ConfirmTriadaResultType } from '@/lib/platform/pastoral/triad/service'

const MENTOR_ID = '00000000-0000-0000-0000-000000000001'
const ASSISTED_ID = '00000000-0000-0000-0000-000000000002'
const COORDINATOR_ID = '00000000-0000-0000-0000-000000000003'
const AUTOR_ID = MENTOR_ID

function makeTriada(overrides: Partial<PastoralTriada> = {}): PastoralTriada {
  return {
    id: 'triada-1',
    mentorOficialPersonaId: MENTOR_ID,
    autorPersonaId: AUTOR_ID,
    estado: 'active',
    contexto: 'nuevo_paso',
    motivoDisolucion: null,
    version: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

// ─── Mock repository ──────────────────────────────────────────────────────────

function createMockRepository() {
  const storage: { triadas: PastoralTriada[]; miembros: Array<{ id: string; triadaId: string; personaId: string; rolEnTriada: string; createdAt: string }> } = {
    triadas: [],
    miembros: [],
  }
  const mockEmit = jest.fn()

  async function getById(id: string) {
    return storage.triadas.find((t) => t.id === id) ?? null
  }

  async function create(input: { mentorOficialPersonaId: string; autorPersonaId: string; contexto: 'nuevo_paso' | 'simultaneidad' | 'inicial' | 'reformada' }) {
    const triada: PastoralTriada = {
      id: `triada-${Date.now()}`,
      mentorOficialPersonaId: input.mentorOficialPersonaId,
      autorPersonaId: input.autorPersonaId,
      estado: 'pending_confirmation',
      contexto: input.contexto,
      motivoDisolucion: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    storage.triadas.push(triada)
    return triada
  }

  async function update(id: string, update: { estado: string; motivoDisolucion?: string | null; expectedVersion: number }) {
    const current = storage.triadas.find((t) => t.id === id)
    if (!current) throw new Error(`Not found: ${id}`)
    if (update.expectedVersion !== current.version) {
      throw new ConcurrencyConflictError(`version mismatch`, { id, expectedVersion: update.expectedVersion, currentVersion: current.version })
    }
    const updated: PastoralTriada = {
      ...current,
      estado: update.estado as PastoralTriada['estado'],
      motivoDisolucion: update.motivoDisolucion !== undefined ? update.motivoDisolucion as PastoralTriada['motivoDisolucion'] : current.motivoDisolucion,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    storage.triadas = storage.triadas.map((t) => (t.id === id ? updated : t))
    return updated
  }

  async function addMiembro(input: { triadaId: string; personaId: string; rolEnTriada: string }) {
    // Simple cardinality check - max 3 distinct members
    // Count existing members with different personaId than the one being added
    const existingDistinctCount = storage.miembros.filter((m) => m.triadaId === input.triadaId && m.personaId !== input.personaId).length
    // If we already have 3 distinct people, trying to add a 4th should throw
    if (existingDistinctCount >= 3) {
      throw new Error('triada must have exactly 3 distinct humans')
    }
    const miembro = {
      id: `miembro-${Date.now()}`,
      triadaId: input.triadaId,
      personaId: input.personaId,
      rolEnTriada: input.rolEnTriada,
      createdAt: new Date().toISOString(),
    }
    storage.miembros.push(miembro)
    return miembro
  }

  return { storage, mockEmit, getById, create, update, addMiembro }
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

// ─── Type helper ──────────────────────────────────────────────────────────────

function expectOk(r: CreateTriadaWithAutoFormationResultType | DisbandTriadaWithAuditResultType | ConfirmTriadaResultType) {
  if (!r.ok) throw new Error('Expected ok=true but got: ' + JSON.stringify(r.error))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PastoralTriadaService — createTriadaWithAutoFormation (P4)', () => {
  let mockRepo: ReturnType<typeof createMockRepository>
  let mockLedger: ReturnType<typeof createMockLedgerWriter>
  let service: ReturnType<typeof createPastoralTriadaService>

  beforeEach(() => {
    mockRepo = createMockRepository()
    mockLedger = createMockLedgerWriter()

    const repo = {
      createTriada: mockRepo.create,
      getTriadaById: mockRepo.getById,
      listTriadas: jest.fn(),
      updateTriada: mockRepo.update,
      addMiembro: mockRepo.addMiembro,
      listMiembros: jest.fn(),
      addNota: jest.fn(),
      listNotas: jest.fn(),
      emitPastoralEvent: mockLedger.emitPastoralEvent,
    }

    service = createPastoralTriadaService(repo as never, mockLedger)
  })

  // ESC-01: happy path — auto-formation by new step (P4)
  describe('ESC-01: happy path auto-formation (P4)', () => {
    it('creates triada with contexto=nuevo_paso and 3 members', async () => {
      const result = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })

      expectOk(result)
      expect(result.triada.contexto).toBe('nuevo_paso')
      expect(result.triada.estado).toBe('pending_confirmation')
      expect(result.miembros).toHaveLength(3)
    })

    it('emits pastoral_triada_formed to the ledger', async () => {
      await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })

      expect(mockLedger.emitPastoralEvent).toHaveBeenCalledTimes(1)
      const emittedEvent = mockLedger.emitPastoralEvent.mock.calls[0]![0]
      expect(emittedEvent.kind).toBe('pastoral_triada_formed')
      expect(emittedEvent.actorPersonaId).toBe(AUTOR_ID)
      expect(emittedEvent.metadata.contexto).toBe('nuevo_paso')
    })

    it('adds mentor, assisted, and coordinator as members', async () => {
      const result = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })

      expectOk(result)
      const roles = result.miembros.map((m) => m.rolEnTriada).sort()
      expect(roles).toEqual(['asistido', 'coordinador', 'mentor'])
    })
  })
})

describe('PastoralTriadaService — disbandTriadaWithAudit', () => {
  let mockRepo: ReturnType<typeof createMockRepository>
  let mockLedger: ReturnType<typeof createMockLedgerWriter>
  let service: ReturnType<typeof createPastoralTriadaService>

  beforeEach(() => {
    mockRepo = createMockRepository()
    mockLedger = createMockLedgerWriter()

    const repo = {
      createTriada: mockRepo.create,
      getTriadaById: mockRepo.getById,
      listTriadas: jest.fn(),
      updateTriada: mockRepo.update,
      addMiembro: mockRepo.addMiembro,
      listMiembros: jest.fn(),
      addNota: jest.fn(),
      listNotas: jest.fn(),
      emitPastoralEvent: mockLedger.emitPastoralEvent,
    }

    service = createPastoralTriadaService(repo as never, mockLedger)
  })

  // ESC-01: disband happy path
  describe('ESC-01: disband triada happy path', () => {
    it('disbands active triada with motivo and emits event', async () => {
      // First create a triada
      const createResult = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })
      expectOk(createResult)

      // Transition to active
      const activeTriada = await mockRepo.update(createResult.triada.id, {
        estado: 'active',
        expectedVersion: 1,
      })

      // Now disband
      const disbandResult = await service.disbandTriadaWithAudit({
        triadaId: activeTriada.id,
        actorPersonaId: MENTOR_ID,
        motivo: 'pastoral_decision',
        expectedVersion: 2,
      })

      expectOk(disbandResult)
      expect(disbandResult.triada.estado).toBe('disbanded')
      expect(disbandResult.triada.motivoDisolucion).toBe('pastoral_decision')
    })

    it('emits pastoral_triada_disbanded to the ledger', async () => {
      const createResult = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })
      expectOk(createResult)

      await mockRepo.update(createResult.triada.id, { estado: 'active', expectedVersion: 1 })

      await service.disbandTriadaWithAudit({
        triadaId: createResult.triada.id,
        actorPersonaId: MENTOR_ID,
        motivo: 'pastoral_decision',
        expectedVersion: 2,
      })

      expect(mockLedger.emitPastoralEvent).toHaveBeenCalledTimes(2) // formed + disbanded
      const emittedEvent = mockLedger.emitPastoralEvent.mock.calls[1]![0]
      expect(emittedEvent.kind).toBe('pastoral_triada_disbanded')
      expect(emittedEvent.actorPersonaId).toBe(MENTOR_ID)
    })
  })

  // ESC-02: rejection without motivo
  describe('ESC-02: rejection without motivo', () => {
    it('rejects disband when motivo is missing from closed catalog', async () => {
      const createResult = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })
      expectOk(createResult)

      await mockRepo.update(createResult.triada.id, { estado: 'active', expectedVersion: 1 })

      // Motivo must be from TRIADA_DISSOLUTION_REASONS
      const disbandResult = await service.disbandTriadaWithAudit({
        triadaId: createResult.triada.id,
        actorPersonaId: MENTOR_ID,
        motivo: 'invalid_motivo' as never,
        expectedVersion: 2,
      })

      expect(disbandResult.ok).toBe(false)
    })
  })

  // PASTORAL_NOT_FOUND
  describe('PASTORAL_NOT_FOUND', () => {
    it('returns PASTORAL_NOT_FOUND when triada does not exist', async () => {
      const result = await service.disbandTriadaWithAudit({
        triadaId: 'not-found',
        actorPersonaId: MENTOR_ID,
        motivo: 'pastoral_decision',
        expectedVersion: 1,
      })

      expect(result.ok).toBe(false)
      const e = result as Extract<typeof result, { ok: false }>
      expect(e.error.code).toBe('PASTORAL_NOT_FOUND')
    })
  })

  // CONCURRENCY_CONFLICT
  describe('ConcurrencyConflictError', () => {
    it('returns CONCURRENCY_CONFLICT on stale version', async () => {
      const createResult = await service.createTriadaWithAutoFormation({
        mentorOficialPersonaId: MENTOR_ID,
        autorPersonaId: AUTOR_ID,
        assistedPersonaId: ASSISTED_ID,
        coordinatorPersonaId: COORDINATOR_ID,
      })
      expectOk(createResult)

      await mockRepo.update(createResult.triada.id, { estado: 'active', expectedVersion: 1 })

      // Stale version
      const disbandResult = await service.disbandTriadaWithAudit({
        triadaId: createResult.triada.id,
        actorPersonaId: MENTOR_ID,
        motivo: 'pastoral_decision',
        expectedVersion: 1, // stale — current is 2
      })

      expect(disbandResult.ok).toBe(false)
      const e = disbandResult as Extract<typeof disbandResult, { ok: false }>
      expect(e.error.code).toBe('CONCURRENCY_CONFLICT')
    })
  })
})

// W08 — DT-047: confirmTriada tests
describe('PastoralTriadaService — confirmTriada', () => {
  let mockRepo: ReturnType<typeof createMockRepository>
  let mockLedger: ReturnType<typeof createMockLedgerWriter>
  let service: ReturnType<typeof createPastoralTriadaService>

  beforeEach(() => {
    mockRepo = createMockRepository()
    mockLedger = createMockLedgerWriter()

    const repo = {
      createTriada: mockRepo.create,
      getTriadaById: mockRepo.getById,
      listTriadas: jest.fn(),
      updateTriada: mockRepo.update,
      addMiembro: mockRepo.addMiembro,
      listMiembros: jest.fn(),
      addNota: jest.fn(),
      listNotas: jest.fn(),
      emitPastoralEvent: mockLedger.emitPastoralEvent,
    }

    service = createPastoralTriadaService(repo as never, mockLedger)
  })

  it('confirm pending_confirmation → active', async () => {
    // Create triada in pending_confirmation state
    const createResult = await service.createTriadaWithAutoFormation({
      mentorOficialPersonaId: MENTOR_ID,
      autorPersonaId: AUTOR_ID,
      assistedPersonaId: ASSISTED_ID,
      coordinatorPersonaId: COORDINATOR_ID,
    })
    expectOk(createResult)
    expect(createResult.triada.estado).toBe('pending_confirmation')

    // Confirm
    const confirmResult = await service.confirmTriada({
      triadaId: createResult.triada.id,
      actorPersonaId: MENTOR_ID,
      expectedVersion: 1,
    })

    expect(confirmResult.ok).toBe(true)
    const ok = confirmResult as Extract<ConfirmTriadaResultType, { ok: true }>
    expect(ok.triada.estado).toBe('active')
    expect(ok.triada.version).toBe(2)
    expect(mockLedger.emitPastoralEvent).toHaveBeenCalled()
  })

  it('409 stale version on confirm', async () => {
    const createResult = await service.createTriadaWithAutoFormation({
      mentorOficialPersonaId: MENTOR_ID,
      autorPersonaId: AUTOR_ID,
      assistedPersonaId: ASSISTED_ID,
      coordinatorPersonaId: COORDINATOR_ID,
    })
    expectOk(createResult)

    const confirmResult = await service.confirmTriada({
      triadaId: createResult.triada.id,
      actorPersonaId: MENTOR_ID,
      expectedVersion: 99, // stale
    })

    expect(confirmResult.ok).toBe(false)
    const err = confirmResult as Extract<ConfirmTriadaResultType, { ok: false }>
    expect(err.error.code).toBe('CONCURRENCY_CONFLICT')
  })

  it('400 invalid state when already active', async () => {
    const createResult = await service.createTriadaWithAutoFormation({
      mentorOficialPersonaId: MENTOR_ID,
      autorPersonaId: AUTOR_ID,
      assistedPersonaId: ASSISTED_ID,
      coordinatorPersonaId: COORDINATOR_ID,
    })
    expectOk(createResult)

    // Manually transition to active first
    await mockRepo.update(createResult.triada.id, { estado: 'active', expectedVersion: 1 })

    // Try to confirm again
    const confirmResult = await service.confirmTriada({
      triadaId: createResult.triada.id,
      actorPersonaId: MENTOR_ID,
      expectedVersion: 2,
    })

    expect(confirmResult.ok).toBe(false)
    const err = confirmResult as Extract<ConfirmTriadaResultType, { ok: false }>
    expect(err.error.code).toBe('INVALID_STATE_TRANSITION')
  })
})
