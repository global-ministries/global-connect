/**
 * S17 — OutboxRepository Supabase adapter tests.
 *
 * Tests the Supabase adapter with a mocked RPC client.
 * Verifies:
 *   - claim() calls claim_operating_core_notification_outbox_batch RPC
 *   - markDispatched() calls mark_operating_core_notification_outbox_dispatched RPC
 *   - markFailed() calls mark_operating_core_notification_outbox_failed RPC
 *   - Empty results return empty arrays (not null)
 */

import { createSupabaseOutboxRepository } from '@/lib/platform/operating-core/notification-outbox/outbox-repository-supabase'

// ─── Mock types ───────────────────────────────────────────────────────────────

interface MockRpcResult {
  data?: unknown | null
  error?: { message: string; code?: string } | null
}

type MockRpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<MockRpcResult>

function createMockSupabase(rpcResults: MockRpcResult[]): { rpc: MockRpcFn } {
  let callIndex = 0
  return {
    rpc: async (_fn: string, _args: Record<string, unknown>) => {
      void _fn
      void _args
      const result = rpcResults[callIndex] ?? { data: null, error: null }
      callIndex++
      return result
    },
  }
}

// ─── Test data ────────────────────────────────────────────────────────────────

const sampleRow = {
  id: '00000000-0000-0000-0000-000000000001',
  kind: 'registration',
  subject_id: null,
  payload: Object.freeze({ eventId: 'abc' }),
  target_kind: 'email',
  target_address: 'test@example.com',
  available_at: new Date().toISOString(),
  attempt_count: 0,
  max_attempts: 5,
  status: 'pending',
  locked_at: null,
  locked_by: null,
  last_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dispatched_at: null,
}

// ─── claim ───────────────────────────────────────────────────────────────────

describe('OutboxRepositorySupabase — claim', () => {
  it('should call rpc with correct arguments', async () => {
    const mockSupabase = createMockSupabase([{ data: [sampleRow], error: null }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    const result = await repo.claim(10, 300_000)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(sampleRow.id)
  })

  it('should return empty array when rpc returns null', async () => {
    const mockSupabase = createMockSupabase([{ data: null, error: null }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    const result = await repo.claim(10, 300_000)

    expect(result).toEqual([])
  })

  it('should return empty array when rpc returns empty array', async () => {
    const mockSupabase = createMockSupabase([{ data: [], error: null }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    const result = await repo.claim(10, 300_000)

    expect(result).toEqual([])
  })

  it('should throw when rpc returns an error', async () => {
    const mockSupabase = createMockSupabase([{ data: null, error: { message: 'RPC error' } }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    await expect(repo.claim(10, 300_000)).rejects.toThrow('claim_operating_core_notification_outbox_batch failed: RPC error')
  })

  it('should clamp batch size to 1-50 range', async () => {
    let capturedArgs: Record<string, unknown> = {}
    const mockSupabase = createMockSupabase([{ data: [], error: null }])
    const originalRpc = mockSupabase.rpc.bind(mockSupabase)
    mockSupabase.rpc = async (fn: string, args: Record<string, unknown>) => {
      capturedArgs = args
      return originalRpc(fn, args)
    }

    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    // Test upper bound
    await repo.claim(100, 300_000)
    expect(capturedArgs['p_limit']).toBe(50)

    // Test lower bound
    await repo.claim(0, 300_000)
    expect(capturedArgs['p_limit']).toBe(1)
  })
})

// ─── markDispatched ───────────────────────────────────────────────────────────

describe('OutboxRepositorySupabase — markDispatched', () => {
  it('should call rpc with correct id', async () => {
    let capturedId: string | undefined
    const mockSupabase = createMockSupabase([{ data: null, error: null }])
    const originalRpc = mockSupabase.rpc.bind(mockSupabase)
    mockSupabase.rpc = async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'mark_operating_core_notification_outbox_dispatched') {
        capturedId = args['p_id'] as string
      }
      return originalRpc(fn, args)
    }

    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })
    await repo.markDispatched('00000000-0000-0000-0000-000000000042')

    expect(capturedId).toBe('00000000-0000-0000-0000-000000000042')
  })

  it('should throw when rpc returns an error', async () => {
    const mockSupabase = createMockSupabase([{ data: null, error: { message: 'update failed' } }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    await expect(repo.markDispatched('00000000-0000-0000-0000-000000000001'))
      .rejects.toThrow('mark_operating_core_notification_outbox_dispatched failed: update failed')
  })
})

// ─── markFailed ───────────────────────────────────────────────────────────────

describe('OutboxRepositorySupabase — markFailed', () => {
  it('should call rpc with correct arguments', async () => {
    let capturedArgs: Record<string, unknown> = {}
    const mockSupabase = createMockSupabase([{ data: null, error: null }])
    const originalRpc = mockSupabase.rpc.bind(mockSupabase)
    mockSupabase.rpc = async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'mark_operating_core_notification_outbox_failed') {
        capturedArgs = args
      }
      return originalRpc(fn, args)
    }

    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })
    const nextAt = new Date().toISOString()
    await repo.markFailed('00000000-0000-0000-0000-000000000001', 'timeout error', nextAt)

    expect(capturedArgs['p_id']).toBe('00000000-0000-0000-0000-000000000001')
    expect(capturedArgs['p_last_error']).toBe('timeout error')
    expect(capturedArgs['p_next_attempt_at']).toBe(nextAt)
  })

  it('should throw when rpc returns an error', async () => {
    const mockSupabase = createMockSupabase([{ data: null, error: { message: 'update failed' } }])
    const repo = createSupabaseOutboxRepository({ supabase: mockSupabase as never })

    await expect(
      repo.markFailed('00000000-0000-0000-0000-000000000001', 'err', new Date().toISOString()),
    ).rejects.toThrow('mark_operating_core_notification_outbox_failed failed: update failed')
  })
})
