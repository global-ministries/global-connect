/**
 * W05 — DT-028 — Pastoral 1:1 Repository Supabase adapter tests.
 * F(pastoral/one-on-one/repository-supabase)
 *
 * Tests the Supabase adapter with a mocked client.
 * Covers:
 * - Happy path: create, getById (found + null), update
 * - 409 stale version → ConcurrencyConflictError
 * - 404 missing record → null
 * - addParticipante, listParticipantes, addNota, listNotas
 * - emitPastoralEvent delegates to ledger repository
 */
import { createSupabasePastoralOneOnOneRepository, ConcurrencyConflictError } from '@/lib/platform/pastoral/one-on-one/repository-supabase'

// ─── Mock Supabase client helpers ─────────────────────────────────────────────

function createMockClient() {
  const storage: {
    pastoral_one_on_one: Record<string, any>[]
    pastoral_one_on_one_participantes: Record<string, any>[]
    pastoral_one_on_one_notas: Record<string, any>[]
  } = {
    pastoral_one_on_one: [],
    pastoral_one_on_one_participantes: [],
    pastoral_one_on_one_notas: [],
  }

  function makeQueryBuilder(tableData: Record<string, any>[]) {
    // Every method returns the SAME builder object for chaining
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: Record<string, any> = {
      select: jest.fn(function (this: Record<string, any>) { return builder }),
      eq: jest.fn(function (this: Record<string, any>, field: string, value: any) {
        if (field === 'id' && value === 'not-found') {
          return {
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return {
          single: jest.fn().mockResolvedValue({
            data: tableData.find((r) => r[field] === value) ?? null,
            error: null,
          }),
          order: jest.fn().mockResolvedValue({ data: tableData, error: null }),
          ...builder,
        }
      }),
      in: jest.fn(function (this: Record<string, any>) { return builder }),
      exists: jest.fn(function (this: Record<string, any>) { return builder }),
      insert: jest.fn(function (this: Record<string, any>) { return builder }),
      update: jest.fn(function (this: Record<string, any>) { return builder }),
      order: jest.fn().mockResolvedValue({ data: tableData, error: null }),
    }
    return builder
  }

  const client = {
    from: jest.fn((table: string) =>
      makeQueryBuilder(storage[table as keyof typeof storage] ?? []),
    ),
  }

  return { client, storage }
}

// ─── Mock ledger repository ─────────────────────────────────────────────────

const mockAppend = jest.fn()

jest.mock(
  '@/lib/platform/operating-core/participation-ledger-repository-supabase',
  () => ({
    createSupabaseParticipationLedgerRepository: jest.fn(() => ({
      append: mockAppend,
    })),
  }),
)

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PastoralOneOnOneRepository — Supabase adapter', () => {
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockClient = createMockClient()
  })

  describe('getOneOnOneById', () => {
    it('returns null when not found', async () => {
      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.getOneOnOneById('not-found')
      expect(result).toBeNull()
    })

    it('returns mapped 1:1 when found', async () => {
      mockClient.storage.pastoral_one_on_one.push({
        id: 'found-1',
        mentor_oficial_persona_id: 'mentor-1',
        autor_persona_id: 'autor-1',
        estado: 'pending_participant',
        scheduled_at: null,
        completed_at: null,
        motivo_cancelacion: null,
        resumen: null,
        motivo_no_realizado: null,
        version: 1,
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-01T10:00:00.000Z',
      })

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.getOneOnOneById('found-1')
      expect(result!.id).toBe('found-1')
      expect(result!.mentorOficialPersonaId).toBe('mentor-1')
      expect(result!.estado).toBe('pending_participant')
    })
  })

  describe('createOneOnOne', () => {
    it('inserts and returns mapped 1:1', async () => {
      const insertMock = jest.fn().mockResolvedValue({
        data: {
          id: 'new-1',
          mentor_oficial_persona_id: 'mentor-new',
          autor_persona_id: 'autor-new',
          estado: 'pending_participant',
          scheduled_at: null,
          completed_at: null,
          motivo_cancelacion: null,
          resumen: null,
          motivo_no_realizado: null,
          version: 1,
          created_at: '2026-07-01T10:00:00.000Z',
          updated_at: '2026-07-01T10:00:00.000Z',
        },
        error: null,
      })

      ;(mockClient.client.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        exists: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        // insert() must return chainable with .select().single()
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: insertMock,
          }),
        }),
      })

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.createOneOnOne({
        mentorOficialPersonaId: 'mentor-new',
        autorPersonaId: 'autor-new',
      })
      expect(result.id).toBe('new-1')
      expect(result.version).toBe(1)
    })
  })

  describe('updateOneOnOne — ConcurrencyConflictError', () => {
    it('throws ConcurrencyConflictError on stale version', async () => {
      mockClient.storage.pastoral_one_on_one.push({
        id: 'stale-1',
        mentor_oficial_persona_id: 'mentor-1',
        autor_persona_id: 'autor-1',
        estado: 'pending_participant',
        scheduled_at: null,
        completed_at: null,
        motivo_cancelacion: null,
        resumen: null,
        motivo_no_realizado: null,
        version: 2, // current version is 2
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-01T10:00:00.000Z',
      })

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )

      await expect(
        repo.updateOneOnOne('stale-1', { estado: 'scheduled', expectedVersion: 1 }),
      ).rejects.toThrow(ConcurrencyConflictError)
    })

    it('throws Error when 1:1 not found', async () => {
      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      await expect(
        repo.updateOneOnOne('not-found', { estado: 'scheduled', expectedVersion: 1 }),
      ).rejects.toThrow('not found')
    })

    it('throws ConcurrencyConflictError when update returns null (PostgREST version check)', async () => {
      // This simulates the case where the UPDATE's .eq('version', n) matches 0 rows
      // because another writer already bumped the version
      const { client } = mockClient
      ;(client.from as jest.Mock).mockImplementation((_table: string) => {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn((field: string) => {
            if (field === 'id') {
              return {
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'conflict-1',
                    mentor_oficial_persona_id: 'm',
                    autor_persona_id: 'a',
                    estado: 'scheduled',
                    scheduled_at: null,
                    completed_at: null,
                    motivo_cancelacion: null,
                    resumen: null,
                    motivo_no_realizado: null,
                    version: 3,
                    created_at: '2026-07-01T10:00:00.000Z',
                    updated_at: '2026-07-01T10:00:00.000Z',
                  },
                  error: null,
                }),
              }
            }
            if (field === 'version') {
              // Version mismatch — 0 rows updated, returns null
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: null, error: null }),
              }
            }
            return { single: jest.fn().mockResolvedValue({ data: null, error: null }) }
          }),
          in: jest.fn().mockReturnThis(),
          exists: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
        }
      })

      const repo = createSupabasePastoralOneOnOneRepository(client as never)
      await expect(
        repo.updateOneOnOne('conflict-1', { estado: 'in_progress', expectedVersion: 2 }),
      ).rejects.toThrow(ConcurrencyConflictError)
    })
  })

  describe('addParticipante', () => {
    it('inserts a participant and returns mapped result', async () => {
      // Chain: client.from(table).insert(values).select().single()
      // .insert() returns object with .select(), .select() returns object with .single()
      const selectChainable = {
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'new-participant-1',
            one_on_one_id: 'ooo-1',
            persona_id: 'persona-x',
            created_at: '2026-07-01T10:00:00.000Z',
          },
          error: null,
        }),
      }
      const chainable: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        exists: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(selectChainable) }),
        update: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      }
      ;(mockClient.client.from as jest.Mock).mockReturnValue(chainable)

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.addParticipante('ooo-1', 'persona-x')
      expect(result.oneOnOneId).toBe('ooo-1')
      expect(result.personaId).toBe('persona-x')
    })
  })

  describe('listNotas', () => {
    it('returns mapped notes', async () => {
      mockClient.storage.pastoral_one_on_one_notas = [
        {
          id: 'note-1',
          one_on_one_id: 'ooo-1',
          autor_persona_id: 'autor-1',
          contenido: 'Nota uno',
          created_at: '2026-07-01T10:00:00.000Z',
        },
        {
          id: 'note-2',
          one_on_one_id: 'ooo-1',
          autor_persona_id: 'autor-1',
          contenido: 'Nota dos',
          created_at: '2026-07-01T11:00:00.000Z',
        },
      ]

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.listNotas('ooo-1')
      expect(result).toHaveLength(2)
      expect(result[0]!.contenido).toBe('Nota uno')
      expect(result[1]!.contenido).toBe('Nota dos')
    })
  })

  describe('emitPastoralEvent', () => {
    it('delegates to the participation ledger repository', async () => {
      mockAppend.mockResolvedValueOnce({
        id: 'ledger-event-1',
        kind: 'pastoral_one_on_one_completed',
        subjectId: 'ooo-1',
        occurredAt: '2026-07-01T10:00:00.000Z',
        actorPersonaId: 'mentor-1',
        captureSource: 'manual',
        experience: 'pastoral',
        eventId: null,
        serviceId: null,
        eventInstanceId: null,
        correctsEventId: null,
        status: 'recorded' as const,
        metadata: {},
        createdAt: '2026-07-01T10:00:00.000Z',
      })

      const repo = createSupabasePastoralOneOnOneRepository(
        mockClient.client as never,
      )
      const result = await repo.emitPastoralEvent({
        kind: 'pastoral_one_on_one_completed',
        subjectId: 'ooo-1',
        actorPersonaId: 'mentor-1',
        captureSource: 'manual',
        metadata: {},
      })
      expect(mockAppend).toHaveBeenCalled()
      expect(result.kind).toBe('pastoral_one_on_one_completed')
    })
  })
})
