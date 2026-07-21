/**
 * S22 — Recurrent repository Supabase adapter tests.
 *
 * Tests the Supabase adapter for recurrent event materialization.
 * Uses mocked Supabase client to test RPC calls and query behavior.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRecurrentRepository } from '@/lib/platform/operating-core/recurrent/recurrent-repository-supabase'

// ─── Mock Supabase client factory ─────────────────────────────────────────────

function createMockSupabaseClient(overrides?: {
  rpcResponse?: unknown
  rpcError?: { message: string; code?: string }
  fromResponse?: { data?: unknown; error?: { message: string } | null }
}) {
  return {
    rpc: jest.fn().mockResolvedValue({
      data: overrides?.rpcResponse ?? [],
      error: overrides?.rpcError ?? null,
    }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: overrides?.fromResponse?.data ?? null,
        error: overrides?.fromResponse?.error ?? null,
      }),
    }),
  } as unknown as SupabaseClient
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createSupabaseRecurrentRepository', () => {
  describe('materialize', () => {
    it('should call rpc with correct parameters', async () => {
      const mockClient = createMockSupabaseClient({
        rpcResponse: [
          {
            id: 'inst-1',
            event_id: 'evt-1',
            instance_date: '2026-01-04',
            estado: 'active',
            lifecycle: 'scheduled',
            start_time: '2026-01-04T10:00:00Z',
            end_time: '2026-01-04T11:00:00Z',
            capacity_operativa: 30,
            recurrence_rule: null,
            horizon_days: 90,
            version: 1,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      })

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.materialize({
        event_id: 'evt-1',
        horizon_days: 90,
        now_iso: '2026-01-01T00:00:00Z',
      })

      expect(mockClient.rpc).toHaveBeenCalledWith(
        'operating_core_materialize_event_instances',
        {
          p_event_id: 'evt-1',
          p_horizon_days: 90,
          p_now_iso: '2026-01-01T00:00:00Z',
        },
      )
      expect(result).toHaveLength(1)
      expect(result[0].eventId).toBe('evt-1')
      expect(result[0].instanceDate).toBe('2026-01-04')
    })

    it('should return empty array on RPC error', async () => {
      const mockClient = createMockSupabaseClient({
        rpcError: { message: 'Function not found', code: 'PGRST202' },
      })

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.materialize({
        event_id: 'evt-1',
        horizon_days: 90,
        now_iso: '2026-01-01T00:00:00Z',
      })

      expect(result).toHaveLength(0)
    })
  })

  describe('getById', () => {
    it('should query by id and return mapped instance', async () => {
      const mockRow = {
        id: 'inst-1',
        event_id: 'evt-1',
        instance_date: '2026-01-04',
        estado: 'active',
        lifecycle: 'scheduled',
        start_time: '2026-01-04T10:00:00Z',
        end_time: '2026-01-04T11:00:00Z',
        capacity_operativa: 30,
        recurrence_rule: null,
        horizon_days: 90,
        version: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }

      const mockClient = createMockSupabaseClient({
        fromResponse: { data: mockRow, error: null },
      })

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.getById('inst-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('inst-1')
      expect(result!.eventId).toBe('evt-1')
      expect(result!.instanceDate).toBe('2026-01-04')
    })

    it('should return null when not found', async () => {
      const mockClient = createMockSupabaseClient({
        fromResponse: { data: null, error: null },
      })

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.getById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('listByEvent', () => {
    it('should query by event_id and return instances', async () => {
      const mockRows = [
        {
          id: 'inst-1',
          event_id: 'evt-1',
          instance_date: '2026-01-04',
          estado: 'active',
          lifecycle: 'scheduled',
          start_time: '2026-01-04T10:00:00Z',
          end_time: '2026-01-04T11:00:00Z',
          capacity_operativa: 30,
          recurrence_rule: null,
          horizon_days: 90,
          version: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'inst-2',
          event_id: 'evt-1',
          instance_date: '2026-01-11',
          estado: 'active',
          lifecycle: 'scheduled',
          start_time: '2026-01-11T10:00:00Z',
          end_time: '2026-01-11T11:00:00Z',
          capacity_operativa: 30,
          recurrence_rule: null,
          horizon_days: 90,
          version: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]

      // Chain: supabase.from(TABLE).select().eq().then(await)
      const queryMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
      }
      queryMock.select.mockReturnValue(queryMock)

      const mockClient = {
        from: jest.fn().mockReturnValue(queryMock),
      } as unknown as SupabaseClient

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.listByEvent('evt-1')

      expect(result).toHaveLength(2)
      expect(result[0].instanceDate).toBe('2026-01-04')
      expect(result[1].instanceDate).toBe('2026-01-11')
    })

    it('should filter by date range when provided', async () => {
      const mockRows = [
        {
          id: 'inst-1',
          event_id: 'evt-1',
          instance_date: '2026-01-04',
          estado: 'active',
          lifecycle: 'scheduled',
          start_time: '2026-01-04T10:00:00Z',
          end_time: '2026-01-04T11:00:00Z',
          capacity_operativa: 30,
          recurrence_rule: null,
          horizon_days: 90,
          version: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]

      // Chain: supabase.from(TABLE).select().eq().gte().lte().then(await)
      const queryMock = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
      }
      queryMock.select.mockReturnValue(queryMock)
      queryMock.eq.mockReturnValue(queryMock)

      const mockClient = {
        from: jest.fn().mockReturnValue(queryMock),
      } as unknown as SupabaseClient

      const repo = createSupabaseRecurrentRepository({ supabase: mockClient })

      const result = await repo.listByEvent('evt-1', {
        from: '2026-01-01',
        to: '2026-01-10',
      })

      expect(result).toHaveLength(1)
      expect(mockClient.from).toHaveBeenCalledWith('operating_core_event_instances')
    })
  })
})
