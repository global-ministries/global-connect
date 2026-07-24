/**
 * W07 — DT-033 — Pastoral Triada Repository fake tests.
 * F(pastoral/triad/repository-fake)
 *
 * Covers all operations of the repository contract:
 * - createTriada
 * - getTriadaById (null + found)
 * - listTriadas (filters: mentor, autor, estado)
 * - updateTriada (happy path + stale version → ConcurrencyConflictError)
 * - addMiembro (idempotent + cardinality 3)
 * - listMiembros
 * - addNota
 * - listNotas
 * - emitPastoralEvent
 * - Cardinality 3 fixed (D25)
 */
import { createInMemoryPastoralTriadaRepository, ConcurrencyConflictError } from '@/lib/platform/pastoral/triad/repository-fake'
import type { PastoralTriada } from '@/lib/platform/pastoral/types'

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

describe('PastoralTriadaRepository — in-memory fake', () => {
  let repo: ReturnType<typeof createInMemoryPastoralTriadaRepository>

  beforeEach(() => {
    repo = createInMemoryPastoralTriadaRepository()
  })

  // ─── createTriada ────────────────────────────────────────────────────────

  describe('createTriada', () => {
    it('creates a triada with version 1 and pending_confirmation estado', async () => {
      const result = await repo.createTriada({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
        contexto: 'nuevo_paso',
      })
      expect(result.version).toBe(1)
      expect(result.estado).toBe('pending_confirmation')
      expect(result.mentorOficialPersonaId).toBe('mentor-1')
      expect(result.autorPersonaId).toBe('autor-1')
      expect(result.contexto).toBe('nuevo_paso')
      expect(result.motivoDisolucion).toBeNull()
      expect(result.id).toBeDefined()
    })

    it('creates with simultaneidad contexto', async () => {
      const result = await repo.createTriada({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
        contexto: 'simultaneidad',
      })
      expect(result.contexto).toBe('simultaneidad')
    })
  })

  // ─── getTriadaById ───────────────────────────────────────────────────────

  describe('getTriadaById', () => {
    it('returns null when not found', async () => {
      const result = await repo.getTriadaById('not-found')
      expect(result).toBeNull()
    })

    it('returns the triada when found', async () => {
      const created = await repo.createTriada({
        mentorOficialPersonaId: 'mentor-1',
        autorPersonaId: 'autor-1',
        contexto: 'nuevo_paso',
      })
      const result = await repo.getTriadaById(created.id)
      expect(result!.id).toBe(created.id)
      expect(result!.mentorOficialPersonaId).toBe('mentor-1')
    })
  })

  // ─── listTriadas ─────────────────────────────────────────────────────────

  describe('listTriadas', () => {
    it('returns all triadas when no filter', async () => {
      const t1 = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const t2 = await repo.createTriada({ mentorOficialPersonaId: 'm2', autorPersonaId: 'a2', contexto: 'simultaneidad' })
      const result = await repo.listTriadas()
      expect(result).toHaveLength(2)
      expect(result.find((t) => t.id === t1.id)).toBeDefined()
      expect(result.find((t) => t.id === t2.id)).toBeDefined()
    })

    it('filters by mentorOficialPersonaId', async () => {
      await repo.createTriada({ mentorOficialPersonaId: 'mentor-a', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.createTriada({ mentorOficialPersonaId: 'mentor-b', autorPersonaId: 'a2', contexto: 'nuevo_paso' })
      const result = await repo.listTriadas({ mentorOficialPersonaId: 'mentor-a' })
      expect(result).toHaveLength(1)
      expect(result[0]!.mentorOficialPersonaId).toBe('mentor-a')
    })

    it('filters by autorPersonaId', async () => {
      await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'autor-x', contexto: 'nuevo_paso' })
      await repo.createTriada({ mentorOficialPersonaId: 'm2', autorPersonaId: 'autor-y', contexto: 'nuevo_paso' })
      const result = await repo.listTriadas({ autorPersonaId: 'autor-x' })
      expect(result).toHaveLength(1)
      expect(result[0]!.autorPersonaId).toBe('autor-x')
    })

    it('filters by estado (single)', async () => {
      const t1 = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.updateTriada(t1.id, { estado: 'active', expectedVersion: 1 })
      const t3 = await repo.createTriada({ mentorOficialPersonaId: 'm3', autorPersonaId: 'a3', contexto: 'nuevo_paso' })
      const result = await repo.listTriadas({ estado: 'active' })
      expect(result).toHaveLength(1)
      expect(result[0]!.estado).toBe('active')
    })

    it('filters by estado (array)', async () => {
      const t1 = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.updateTriada(t1.id, { estado: 'active', expectedVersion: 1 })
      const t2 = await repo.createTriada({ mentorOficialPersonaId: 'm2', autorPersonaId: 'a2', contexto: 'nuevo_paso' })
      await repo.updateTriada(t2.id, { estado: 'en_pausa', expectedVersion: 1 })
      const result = await repo.listTriadas({ estado: ['active', 'en_pausa'] })
      expect(result).toHaveLength(2)
    })
  })

  // ─── updateTriada ────────────────────────────────────────────────────────

  describe('updateTriada', () => {
    it('updates estado and bumps version', async () => {
      const created = await repo.createTriada({
        mentorOficialPersonaId: 'm1',
        autorPersonaId: 'a1',
        contexto: 'nuevo_paso',
      })
      const result = await repo.updateTriada(created.id, {
        estado: 'active',
        expectedVersion: 1,
      })
      expect(result.estado).toBe('active')
      expect(result.version).toBe(2)
    })

    it('sets motivoDisolucion when disbanding', async () => {
      const created = await repo.createTriada({
        mentorOficialPersonaId: 'm1',
        autorPersonaId: 'a1',
        contexto: 'nuevo_paso',
      })
      const result = await repo.updateTriada(created.id, {
        estado: 'disbanded',
        motivoDisolucion: 'pastoral_decision',
        expectedVersion: 1,
      })
      expect(result.estado).toBe('disbanded')
      expect(result.motivoDisolucion).toBe('pastoral_decision')
      expect(result.version).toBe(2)
    })

    it('throws ConcurrencyConflictError on stale version', async () => {
      const created = await repo.createTriada({
        mentorOficialPersonaId: 'm1',
        autorPersonaId: 'a1',
        contexto: 'nuevo_paso',
      })
      await repo.updateTriada(created.id, { estado: 'active', expectedVersion: 1 })
      await expect(
        repo.updateTriada(created.id, { estado: 'en_pausa', expectedVersion: 1 }),
      ).rejects.toThrow(ConcurrencyConflictError)
    })

    it('throws Error when triada not found', async () => {
      await expect(
        repo.updateTriada('not-found', { estado: 'active', expectedVersion: 1 }),
      ).rejects.toThrow('not found')
    })
  })

  // ─── addMiembro ─────────────────────────────────────────────────────────

  describe('addMiembro', () => {
    it('adds a member', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const result = await repo.addMiembro({
        triadaId: t.id,
        personaId: 'persona-member',
        rolEnTriada: 'asistido',
      })
      expect(result.triadaId).toBe(t.id)
      expect(result.personaId).toBe('persona-member')
      expect(result.rolEnTriada).toBe('asistido')
    })

    it('is idempotent — returns existing member', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const first = await repo.addMiembro({ triadaId: t.id, personaId: 'persona-x', rolEnTriada: 'mentor' })
      const second = await repo.addMiembro({ triadaId: t.id, personaId: 'persona-x', rolEnTriada: 'mentor' })
      expect(second.id).toBe(first.id)
    })

    it('throws when triada not found', async () => {
      await expect(
        repo.addMiembro({ triadaId: 'not-found', personaId: 'persona-x', rolEnTriada: 'mentor' }),
      ).rejects.toThrow('not found')
    })
  })

  // ─── Cardinality 3 (D25) ─────────────────────────────────────────────────

  describe('cardinality 3 — D25', () => {
    it('allows adding exactly 3 members', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p1', rolEnTriada: 'mentor' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p2', rolEnTriada: 'asistido' })
      const third = await repo.addMiembro({ triadaId: t.id, personaId: 'p3', rolEnTriada: 'coordinador' })
      expect(third.personaId).toBe('p3')
    })

    it('rejects adding a 4th member', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p1', rolEnTriada: 'mentor' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p2', rolEnTriada: 'asistido' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p3', rolEnTriada: 'coordinador' })
      await expect(
        repo.addMiembro({ triadaId: t.id, personaId: 'p4', rolEnTriada: 'asistido' }),
      ).rejects.toThrow(/exactly 3 distinct humans/)
    })

    it('allows same person with different roles (counted once)', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      // A person can have mentor + coordinator roles if they hold both positions
      // Idempotent: returns existing member if same personaId already exists
      const m1 = await repo.addMiembro({ triadaId: t.id, personaId: 'p1', rolEnTriada: 'mentor' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p2', rolEnTriada: 'asistido' })
      // Adding same personaId again returns existing (idempotent), doesn't throw
      const m1Again = await repo.addMiembro({ triadaId: t.id, personaId: 'p1', rolEnTriada: 'coordinador' })
      expect(m1Again.id).toBe(m1.id) // same member returned
    })
  })

  // ─── listMiembros ──────────────────────────────────────────────────────

  describe('listMiembros', () => {
    it('returns empty when no members', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const result = await repo.listMiembros(t.id)
      expect(result).toHaveLength(0)
    })

    it('returns all members', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p1', rolEnTriada: 'mentor' })
      await repo.addMiembro({ triadaId: t.id, personaId: 'p2', rolEnTriada: 'asistido' })
      const result = await repo.listMiembros(t.id)
      expect(result).toHaveLength(2)
    })
  })

  // ─── addNota ─────────────────────────────────────────────────────────────

  describe('addNota', () => {
    it('adds a note', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const result = await repo.addNota({
        triadaId: t.id,
        autorPersonaId: 'autor-1',
        contenido: 'Nota importante',
      })
      expect(result.triadaId).toBe(t.id)
      expect(result.autorPersonaId).toBe('autor-1')
      expect(result.contenido).toBe('Nota importante')
      expect(result.createdAt).toBeDefined()
    })

    it('throws when triada not found', async () => {
      await expect(
        repo.addNota({ triadaId: 'not-found', autorPersonaId: 'a1', contenido: 'x' }),
      ).rejects.toThrow('not found')
    })
  })

  // ─── listNotas ──────────────────────────────────────────────────────────

  describe('listNotas', () => {
    it('returns empty when no notes', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      const result = await repo.listNotas(t.id)
      expect(result).toHaveLength(0)
    })

    it('returns all notes', async () => {
      const t = await repo.createTriada({ mentorOficialPersonaId: 'm1', autorPersonaId: 'a1', contexto: 'nuevo_paso' })
      await repo.addNota({ triadaId: t.id, autorPersonaId: 'a1', contenido: 'Nota 1' })
      await repo.addNota({ triadaId: t.id, autorPersonaId: 'a1', contenido: 'Nota 2' })
      const result = await repo.listNotas(t.id)
      expect(result).toHaveLength(2)
    })
  })

  // ─── emitPastoralEvent ──────────────────────────────────────────────────

  describe('emitPastoralEvent', () => {
    it('emits a pastoral event to the ledger', async () => {
      const result = await repo.emitPastoralEvent({
        kind: 'pastoral_triada_disbanded',
        subjectId: 'triada-1',
        actorPersonaId: 'mentor-1',
        captureSource: 'manual',
        metadata: { triadaId: 'triada-1' },
      })
      expect(result.id).toBeDefined()
      expect(result.kind).toBe('pastoral_triada_disbanded')
      expect(result.subjectId).toBe('triada-1')
      expect(result.actorPersonaId).toBe('mentor-1')
      expect(result.experience).toBe('pastoral')
    })
  })

  // ─── Seeded repository ───────────────────────────────────────────────────

  describe('seeded repository', () => {
    it('starts with pre-seeded data', () => {
      const seededRepo = createInMemoryPastoralTriadaRepository({
        seed: {
          triadas: [makeTriada({ id: 'seeded-1', mentorOficialPersonaId: 'seeded-mentor' })],
          miembros: [],
          notas: [],
        },
      })
      expect(seededRepo.getTriadaById('seeded-1')).resolves.toBeDefined()
    })
  })
})
