/**
 * S17 — Outbox drain Edge Function HTTP tests.
 *
 * @jest-environment node
 *
 * Tests the /api/operating-core/outbox/drain route:
 *   GET  — health check (200 when enabled, 404 when disabled)
 *   POST — trigger drain (calls drainOutbox with repo)
 */

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/operating-core/outbox/drain/route'
import type { DrainResult } from '@/lib/platform/operating-core/notification-outbox/outbox-types'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock(
  '@/lib/platform/operating-core/notification-outbox/factory',
  () => ({
    createOperatingCoreOutboxRepository: jest.fn(),
  }),
)

jest.mock(
  '@/lib/platform/operating-core/notification-outbox/drain',
  () => ({
    drainOutbox: jest.fn(),
  }),
)

const createClient = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const createRepo = jest.requireMock(
  '@/lib/platform/operating-core/notification-outbox/factory',
).createOperatingCoreOutboxRepository as jest.Mock
const mockDrainOutbox = jest.requireMock(
  '@/lib/platform/operating-core/notification-outbox/drain',
).drainOutbox as jest.Mock

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init ?? { method: 'GET' })
}

function authCron() {
  // For cron, we need service_role client
  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  })
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
  process.env.operating_core_drain_rate_per_second = '100'
  mockDrainOutbox.mockResolvedValue({
    claimed: [],
    dispatched: 0,
    failed: 0,
    requeued: 0,
  } satisfies DrainResult)
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
  delete process.env.operating_core_drain_rate_per_second
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /api/operating-core/outbox/drain', () => {
  it('should return 200 when OC is enabled', async () => {
    const res = await GET(makeRequest('/api/operating-core/outbox/drain'))
    expect(res.status).toBe(200)
  })

  it('should return 404 when OC is disabled', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    const res = await GET(makeRequest('/api/operating-core/outbox/drain'))
    expect(res.status).toBe(404)
  })
})

// ─── POST ─────────────────────────────────────────────────────────────────────

describe('POST /api/operating-core/outbox/drain', () => {
  it('should return 404 when OC is disabled', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    const res = await POST(
      makeRequest('/api/operating-core/outbox/drain', { method: 'POST' }),
    )
    expect(res.status).toBe(404)
  })

  it('should return 200 with drain result on success', async () => {
    authCron()
    const mockRepo = { claim: jest.fn(), markDispatched: jest.fn(), markFailed: jest.fn() }
    createRepo.mockReturnValue(mockRepo)
    mockDrainOutbox.mockResolvedValue({
      claimed: [{ id: 'e1', kind: 'registration' }] as never,
      dispatched: 1,
      failed: 0,
      requeued: 0,
    } as DrainResult)

    const res = await POST(
      makeRequest('/api/operating-core/outbox/drain', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dispatched).toBe(1)
    expect(body.claimed).toBe(1)
  })

  it('should return 500 when drain throws', async () => {
    authCron()
    const mockRepo = { claim: jest.fn(), markDispatched: jest.fn(), markFailed: jest.fn() }
    createRepo.mockReturnValue(mockRepo)
    mockDrainOutbox.mockRejectedValue(new Error('unexpected'))

    const res = await POST(
      makeRequest('/api/operating-core/outbox/drain', { method: 'POST' }),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
  })

  it('should parse batch_size query param', async () => {
    authCron()
    const mockRepo = { claim: jest.fn(), markDispatched: jest.fn(), markFailed: jest.fn() }
    createRepo.mockReturnValue(mockRepo)
    mockDrainOutbox.mockResolvedValue({
      claimed: [],
      dispatched: 0,
      failed: 0,
      requeued: 0,
    } as DrainResult)

    await POST(
      makeRequest('/api/operating-core/outbox/drain?batch_size=25', { method: 'POST' }),
    )

    expect(mockDrainOutbox).toHaveBeenCalled()
  })
})
