/**
 * S10 RED — Registations Repository Supabase Adapter
 *
 * Verifies RegistrationsRepository interface contract via mocked Supabase client.
 * Tests mapSqlRowToDomain, findById, findActiveByPersonaAndEvent, transition,
 * cancel (promotes waitlist), deny (no promotion), promoteFromWaitlist (RPC call).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseRegistrationsRepository,
} from '@/lib/platform/operating-core/registrations/registration-repository-supabase'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makeMock(data: unknown) {
  const mock = jest.fn()
  mock.mockResolvedValue(data)
  return mock
}

function createMockSupabaseClient() {
  const fromMock = jest.fn()
  const rpcMock = jest.fn()
  const client = {
    from: fromMock,
    rpc: rpcMock,
  } as unknown as jest.Mocked<SupabaseClient> & { rpc: jest.Mock }
  return { client, fromMock, rpcMock }
}

function sampleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    persona_id: 'persona-1',
    event_id: 'event-1',
    estado: 'pendiente',
    confirmation_mode: 'automatic',
    waitlist_position: null,
    captured_by_persona_id: null,
    reason: null,
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    version: 1,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RegistrationsRepository (Supabase adapter)', () => {
  describe('findById', () => {
    it('should call .from("operating_core_registrations").select().eq("id", id).maybeSingle()', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: row, error: null }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.findById(row.id)

      expect(fromMock).toHaveBeenCalledWith('operating_core_registrations')
      expect(result).not.toBeNull()
      expect(result!.id).toBe(row.id)
    })

    it('should return null when row not found', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: null, error: null }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.findById('non-existent-id')

      expect(result).toBeNull()
    })

    it('should map snake_case row to camelCase domain', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow({
        persona_id: 'persona-abc',
        event_id: 'event-xyz',
        estado: 'confirmada',
        confirmation_mode: 'manual',
        waitlist_position: 5,
        created_at: '2026-07-20T14:30:00Z',
        version: 3,
      })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: row, error: null }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.findById(row.id)

      expect(result).not.toBeNull()
      expect(result!.personaId).toBe('persona-abc')
      expect(result!.eventId).toBe('event-xyz')
      expect(result!.state).toBe('confirmada')
      expect(result!.confirmationMode).toBe('manual')
      expect(result!.waitlistPosition).toBe(5)
      expect(result!.capturedAt).toBe('2026-07-20T14:30:00Z')
      expect(result!.version).toBe(3)
    })
  })

  describe('findActiveByPersonaAndEvent', () => {
    it('should query with persona_id and event_id filters', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                maybeSingle: makeMock({ data: row, error: null }),
              }),
            }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      await repo.findActiveByPersonaAndEvent('persona-1', 'event-1')

      expect(fromMock).toHaveBeenCalledWith('operating_core_registrations')
    })

    it('should return null when no active registration exists', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                maybeSingle: makeMock({ data: null, error: null }),
              }),
            }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.findActiveByPersonaAndEvent('non-existent', 'event')

      expect(result).toBeNull()
    })
  })

  describe('listByEvent', () => {
    it('should return registrations for the event', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const rows = [sampleRow(), sampleRow({ id: 'row-2' })]

      // Mock: from().select().eq('event_id', eventId) returns promise resolving to { data: rows }
      const eqMock = jest.fn()
      eqMock.mockResolvedValue({ data: rows, error: null })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: eqMock,
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.listByEvent('event-1')

      expect(result).toHaveLength(2)
    })

    it('should return empty array when no registrations', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      const eqMock = jest.fn()
      eqMock.mockResolvedValue({ data: [], error: null })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: eqMock,
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.listByEvent('event-empty')

      expect(result).toHaveLength(0)
    })
  })

  describe('listWaitlist', () => {
    it('should return only pendiente rows sorted by waitlist_position ASC', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const rows = [
        sampleRow({ id: 'r1', waitlist_position: 1, estado: 'pendiente' }),
        sampleRow({ id: 'r2', waitlist_position: 2, estado: 'pendiente' }),
      ]

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                order: makeMock({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.listWaitlist('event-1')

      expect(result).toHaveLength(2)
      expect(result[0].waitlistPosition).toBe(1)
      expect(result[1].waitlistPosition).toBe(2)
    })
  })

  describe('transition — optimistic concurrency', () => {
    it('should throw OperatingCoreConcurrencyConflictError when expectedVersion mismatches', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow({ version: 2 })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: row, error: null }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })

      await expect(
        repo.transition('some-id', 1, 'confirmada'),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('should return invalid_transition when transition is not allowed by state machine', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow({ estado: 'asistida', version: 2 })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: row, error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: null, error: null }),
            }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })

      // asistida → confirmada is invalid (terminal state)
      const result = await repo.transition('some-id', 2, 'confirmada')

      expect(result.outcome.kind).toBe('invalid_transition')
    })

    it('should throw ConcurrencyConflictError when update returns null (race)', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow({ version: 1 })

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: makeMock({ data: row, error: null }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                maybeSingle: makeMock({ data: null, error: null }),
              }),
            }),
          }),
        }),
      })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })

      await expect(
        repo.transition('some-id', 1, 'confirmada'),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })
  })

  describe('cancel — transitions to cancelada and calls promote_waitlist RPC', () => {
    it('should UPDATE row to cancelada state', async () => {
      const { client, fromMock, rpcMock } = createMockSupabaseClient()
      const row = sampleRow({ id: 'cancel-id', estado: 'confirmada', version: 1 })
      const cancelledRow = { ...row, estado: 'cancelada', version: 2 }

      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: row, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  maybeSingle: makeMock({ data: cancelledRow, error: null }),
                }),
              }),
            }),
          }),
        })

      rpcMock.mockResolvedValue({ data: [], error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.cancel('cancel-id', 1, 'No longer attending', 'operator-1')

      expect(result.cancelled.state).toBe('cancelada')
    })

    it('should call operating_core_promote_waitlist RPC after cancelling', async () => {
      const { client, fromMock, rpcMock } = createMockSupabaseClient()
      const row = sampleRow({ id: 'cancel-id', estado: 'confirmada', version: 1 })
      const cancelledRow = { ...row, estado: 'cancelada', version: 2 }

      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: row, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  maybeSingle: makeMock({ data: cancelledRow, error: null }),
                }),
              }),
            }),
          }),
        })

      rpcMock.mockResolvedValue({ data: [], error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      await repo.cancel('cancel-id', 1, 'No longer attending', 'operator-1')

      expect(rpcMock).toHaveBeenCalledWith('operating_core_promote_waitlist', {
        p_event_id: 'event-1',
        p_slot_released: 1,
      })
    })

    it('should return promoted registration when RPC returns rows', async () => {
      const { client, fromMock, rpcMock } = createMockSupabaseClient()
      const row = sampleRow({ id: 'cancel-id', estado: 'confirmada', version: 1 })
      const cancelledRow = { ...row, estado: 'cancelada', version: 2 }
      const promotedRow = { ...sampleRow({ id: 'promoted-id', estado: 'confirmada', waitlist_position: null, version: 2 }) }

      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: row, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  maybeSingle: makeMock({ data: cancelledRow, error: null }),
                }),
              }),
            }),
          }),
        })

      rpcMock.mockResolvedValue({ data: [promotedRow], error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.cancel('cancel-id', 1, 'No longer attending', 'operator-1')

      expect(result.promoted).not.toBeNull()
    })
  })

  describe('deny — transitions to rechazada, does NOT call promote_waitlist', () => {
    it('should UPDATE row to rechazada state', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { client, fromMock, rpcMock } = createMockSupabaseClient()
      const row = sampleRow({ id: 'deny-id', estado: 'pendiente', confirmation_mode: 'manual', version: 1 })
      const deniedRow = { ...row, estado: 'rechazada', version: 2 }

      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: row, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  maybeSingle: makeMock({ data: deniedRow, error: null }),
                }),
              }),
            }),
          }),
        })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.deny({
        registrationId: 'deny-id',
        operatorPersonaId: 'operator-1',
        reason: 'Does not qualify',
        expectedVersion: 1,
      })

      expect(result.state).toBe('rechazada')
    })

    it('should NOT call promote_waitlist RPC on deny', async () => {
      const { client, fromMock, rpcMock } = createMockSupabaseClient()
      const row = sampleRow({ id: 'deny-id', estado: 'pendiente', confirmation_mode: 'manual', version: 1 })
      const deniedRow = { ...row, estado: 'rechazada', version: 2 }

      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: makeMock({ data: row, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  maybeSingle: makeMock({ data: deniedRow, error: null }),
                }),
              }),
            }),
          }),
        })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      await repo.deny({
        registrationId: 'deny-id',
        operatorPersonaId: 'operator-1',
        reason: 'Does not qualify',
        expectedVersion: 1,
      })

      expect(rpcMock).not.toHaveBeenCalled()
    })
  })

  describe('promoteFromWaitlist — calls RPC with correct params', () => {
    it('should call .rpc("operating_core_promote_waitlist", { p_event_id, p_slot_released })', async () => {
      const { client, rpcMock } = createMockSupabaseClient()
      rpcMock.mockResolvedValue({ data: [], error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      await repo.promoteFromWaitlist('event-1', 3)

      expect(rpcMock).toHaveBeenCalledWith('operating_core_promote_waitlist', {
        p_event_id: 'event-1',
        p_slot_released: 3,
      })
    })

    it('should map RPC returned rows to Registration domain type', async () => {
      const { client, rpcMock } = createMockSupabaseClient()
      const rpcRows = [
        sampleRow({ id: 'promoted-1', estado: 'confirmada', waitlist_position: null, version: 2 }),
        sampleRow({ id: 'promoted-2', estado: 'confirmada', waitlist_position: null, version: 2 }),
      ]
      rpcMock.mockResolvedValue({ data: rpcRows, error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.promoteFromWaitlist('event-1', 2)

      expect(result).toHaveLength(2)
      expect(result[0].state).toBe('confirmada')
      expect(result[0].waitlistPosition).toBeNull()
    })

    it('should return empty array when RPC returns no rows', async () => {
      const { client, rpcMock } = createMockSupabaseClient()
      rpcMock.mockResolvedValue({ data: [], error: null })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      const result = await repo.promoteFromWaitlist('event-1', 5)

      expect(result).toHaveLength(0)
    })

    it('should throw when RPC returns an error', async () => {
      const { client, rpcMock } = createMockSupabaseClient()
      rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

      const repo = createSupabaseRegistrationsRepository({ supabase: client })
      await expect(repo.promoteFromWaitlist('event-1', 1)).rejects.toThrow('promote_waitlist RPC failed')
    })
  })
})
