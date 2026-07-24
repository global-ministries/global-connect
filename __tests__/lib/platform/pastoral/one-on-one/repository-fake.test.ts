/**
 * W05 — DT-027 — Pastoral 1:1 Repository fake tests.
 * F(pastoral/one-on-one/repository-fake)
 *
 * Covers all operations of the repository contract:
 * - createOneOnOne
 * - getOneOnOneById (null + found)
 * - listOneOnOnes (filters: mentor, autor, estado, participanteId)
 * - updateOneOnOne (happy path + stale version → ConcurrencyConflictError)
 * - addParticipante (idempotent)
 * - listParticipantes
 * - addNota
 * - listNotas
 * - emitPastoralEvent
 */
import { createInMemoryPastoralOneOnOneRepository, ConcurrencyConflictError } from '@/lib/platform/pastoral/one-on-one/repository-fake'
import type { PastoralOneOnOne } from '@/lib/platform/pastoral/types'

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

describe('PastoralOneOnOneRepository — in-memory fake', () => {
  let repo: ReturnType<typeof createInMemoryPastoralOneOnOneRepository>

  beforeEach(() => {
    repo = createInMemoryPastoralOneOnOneRepository()
  })

  // ─── createOneOnOne ────────────────────────────────────────────────────────

  describe('createOneOnOne', () => {
    it('creates a 1:1 with version 1 and pending_participant estado', async () => {
      const result = await repo.createOneOnOne({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
        scheduledAt: '2026-08-01T10:00:00.000Z',
      })
      expect(result.version).toBe(1)
      expect(result.estado).toBe('pending_participant')
      expect(result.mentorOficialPersonaId).toBe('mentor-1')
      expect(result.autorPersonaId).toBe('autor-1')
      expect(result.scheduledAt).toBe('2026-08-01T10:00:00.000Z')
      expect(result.completedAt).toBeNull()
      expect(result.resumen).toBeNull()
      expect(result.id).toBeDefined()
    })

    it('creates with null scheduledAt when not provided', async () => {
      const result = await repo.createOneOnOne({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
      })
      expect(result.scheduledAt).toBeNull()
    })
  })

  // ─── getOneOnOneById ───────────────────────────────────────────────────────

  describe('getOneOnOneById', () => {
    it('returns null when not found', async () => {
      const result = await repo.getOneOnOneById('not-found')
      expect(result).toBeNull()
    })

    it('returns the 1:1 when found', async () => {
      const created = await repo.createOneOnOne({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
      })
      const result = await repo.getOneOnOneById(created.id)
      expect(result!.id).toBe(created.id)
      expect(result!.mentorOficialPersonaId).toBe('mentor-1')
    })
  })

  // ─── listOneOnOnes ─────────────────────────────────────────────────────────

  describe('listOneOnOnes', () => {
    it('returns all 1:1s when no filter', async () => {
      const o1 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const o2 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm2', autorPersonaId: 'a2' })
      const result = await repo.listOneOnOnes()
      expect(result).toHaveLength(2)
      expect(result.find((o) => o.id === o1.id)).toBeDefined()
      expect(result.find((o) => o.id === o2.id)).toBeDefined()
    })

    it('filters by mentorOficialPersonaId', async () => {
      await repo.createOneOnOne({ mentorOficialPersonaId: 'mentor-a', autorPersonaId: 'a1' })
      await repo.createOneOnOne({ mentorOficialPersonaId: 'mentor-b', autorPersonaId: 'a2' })
      const result = await repo.listOneOnOnes({ mentorOficialPersonaId: 'mentor-a' })
      expect(result).toHaveLength(1)
      expect(result[0]!.mentorOficialPersonaId).toBe('mentor-a')
    })

    it('filters by autorPersonaId', async () => {
      await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'autor-x' })
      await repo.createOneOnOne({ mentorOficialPersonaId: 'm2', autorPersonaId: 'autor-y' })
      const result = await repo.listOneOnOnes({ autorPersonaId: 'autor-x' })
      expect(result).toHaveLength(1)
      expect(result[0]!.autorPersonaId).toBe('autor-x')
    })

    it('filters by estado (single)', async () => {
      const o1 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.updateOneOnOne(o1.id, { estado: 'scheduled', expectedVersion: 1 })
      const o3 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm3', autorPersonaId: 'a3' })
      await repo.updateOneOnOne(o3.id, { estado: 'in_progress', expectedVersion: 1 })
      const result = await repo.listOneOnOnes({ estado: 'scheduled' })
      expect(result).toHaveLength(1)
      expect(result[0]!.estado).toBe('scheduled')
    })

    it('filters by estado (array)', async () => {
      const o1 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.updateOneOnOne(o1.id, { estado: 'scheduled', expectedVersion: 1 })
      const o2 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm2', autorPersonaId: 'a2' })
      await repo.updateOneOnOne(o2.id, { estado: 'in_progress', expectedVersion: 1 })
      const result = await repo.listOneOnOnes({ estado: ['scheduled', 'in_progress'] })
      expect(result).toHaveLength(2)
    })

    it('filters by participanteId', async () => {
      const o1 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.addParticipante(o1.id, 'persona-participant-1')
      const o2 = await repo.createOneOnOne({ mentorOficialPersonaId: 'm2', autorPersonaId: 'a2' })
      const result = await repo.listOneOnOnes({ participanteId: 'persona-participant-1' })
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe(o1.id)
    })
  })

  // ─── updateOneOnOne ────────────────────────────────────────────────────────

  describe('updateOneOnOne', () => {
    it('updates estado and bumps version', async () => {
      const created = await repo.createOneOnOne({
        mentorOficialPersonaId: 'm1',
        autorPersonaId: 'a1',
      })
      const result = await repo.updateOneOnOne(created.id, {
        estado: 'scheduled',
        expectedVersion: 1,
        scheduledAt: '2026-08-01T10:00:00.000Z',
      })
      expect(result.estado).toBe('scheduled')
      expect(result.version).toBe(2)
      expect(result.scheduledAt).toBe('2026-08-01T10:00:00.000Z')
    })

    it('sets completedAt when estado becomes completed', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.updateOneOnOne(o.id, { estado: 'scheduled', expectedVersion: 1 })
      await repo.updateOneOnOne(o.id, { estado: 'in_progress', expectedVersion: 2 })
      const result = await repo.updateOneOnOne(o.id, {
        estado: 'completed',
        expectedVersion: 3,
        resumen: 'Good session',
      })
      expect(result.estado).toBe('completed')
      expect(result.completedAt).toBeDefined()
      expect(result.version).toBe(4)
    })

    it('throws ConcurrencyConflictError on stale version', async () => {
      const created = await repo.createOneOnOne({
        mentorOficialPersonaId: 'm1',
        autorPersonaId: 'a1',
      })
      await repo.updateOneOnOne(created.id, { estado: 'scheduled', expectedVersion: 1 })
      await expect(
        repo.updateOneOnOne(created.id, { estado: 'in_progress', expectedVersion: 1 }),
      ).rejects.toThrow(ConcurrencyConflictError)
    })

    it('throws Error when 1:1 not found', async () => {
      await expect(
        repo.updateOneOnOne('not-found', { estado: 'scheduled', expectedVersion: 1 }),
      ).rejects.toThrow('not found')
    })
  })

  // ─── addParticipante ───────────────────────────────────────────────────────

  describe('addParticipante', () => {
    it('adds a participant', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const result = await repo.addParticipante(o.id, 'persona-participant')
      expect(result.oneOnOneId).toBe(o.id)
      expect(result.personaId).toBe('persona-participant')
    })

    it('is idempotent — returns existing participant', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const first = await repo.addParticipante(o.id, 'persona-x')
      const second = await repo.addParticipante(o.id, 'persona-x')
      expect(second.id).toBe(first.id)
      const participantes = await repo.listParticipantes(o.id)
      expect(participantes).toHaveLength(1)
    })

    it('throws when 1:1 not found', async () => {
      await expect(repo.addParticipante('not-found', 'persona-x')).rejects.toThrow(
        'not found',
      )
    })
  })

  // ─── listParticipantes ────────────────────────────────────────────────────

  describe('listParticipantes', () => {
    it('returns empty when no participants', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const result = await repo.listParticipantes(o.id)
      expect(result).toHaveLength(0)
    })

    it('returns all participants', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.addParticipante(o.id, 'p1')
      await repo.addParticipante(o.id, 'p2')
      const result = await repo.listParticipantes(o.id)
      expect(result).toHaveLength(2)
    })
  })

  // ─── addNota ───────────────────────────────────────────────────────────────

  describe('addNota', () => {
    it('adds a note', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const result = await repo.addNota({
        oneOnOneId: o.id,
        autorPersonaId: 'autor-1',
        contenido: 'Nota importante',
      })
      expect(result.oneOnOneId).toBe(o.id)
      expect(result.autorPersonaId).toBe('autor-1')
      expect(result.contenido).toBe('Nota importante')
      expect(result.createdAt).toBeDefined()
    })

    it('throws when 1:1 not found', async () => {
      await expect(
        repo.addNota({ oneOnOneId: 'not-found', autorPersonaId: 'a1', contenido: 'x' }),
      ).rejects.toThrow('not found')
    })
  })

  // ─── listNotas ─────────────────────────────────────────────────────────────

  describe('listNotas', () => {
    it('returns empty when no notes', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      const result = await repo.listNotas(o.id)
      expect(result).toHaveLength(0)
    })

    it('returns all notes', async () => {
      const o = await repo.createOneOnOne({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1' })
      await repo.addNota({ oneOnOneId: o.id, autorPersonaId: 'a1', contenido: 'Nota 1' })
      await repo.addNota({ oneOnOneId: o.id, autorPersonaId: 'a1', contenido: 'Nota 2' })
      const result = await repo.listNotas(o.id)
      expect(result).toHaveLength(2)
    })
  })

  // ─── emitPastoralEvent ────────────────────────────────────────────────────

  describe('emitPastoralEvent', () => {
    it('emits a pastoral event to the ledger', async () => {
      const result = await repo.emitPastoralEvent({
        kind: 'pastoral_one_on_one_completed',
        subjectId: 'one-on-one-1',
        actorPersonaId: 'mentor-1',
        captureSource: 'manual',
        metadata: { oneOnOneId: 'one-on-one-1' },
      })
      expect(result.id).toBeDefined()
      expect(result.kind).toBe('pastoral_one_on_one_completed')
      expect(result.subjectId).toBe('one-on-one-1')
      expect(result.actorPersonaId).toBe('mentor-1')
      expect(result.experience).toBe('pastoral')
    })
  })

  // ─── Seeded repository ────────────────────────────────────────────────────

  describe('seeded repository', () => {
    it('starts with pre-seeded data', () => {
      const seededRepo = createInMemoryPastoralOneOnOneRepository({
        seed: {
          oneOnOnes: [makeOneOnOne({ id: 'seeded-1', mentorOficialPersonaId: 'seeded-mentor' })],
          participantes: [],
          notas: [],
        },
      })
      expect(seededRepo.getOneOnOneById('seeded-1')).resolves.toBeDefined()
    })
  })
})
