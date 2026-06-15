import { GET, POST } from '@/app/api/support/outbox/drain/route'
import { drainSupportEventOutbox } from '@/lib/support/outbox'

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: jest.fn(() => ({ admin: true })),
}))

jest.mock('@/lib/support/outbox', () => ({
  drainSupportEventOutbox: jest.fn(),
}))

const mockDrainSupportEventOutbox = drainSupportEventOutbox as jest.MockedFunction<typeof drainSupportEventOutbox>

class TestResponseClass {
  status: number

  private readonly body: unknown

  constructor(body: unknown, init?: ResponseInit) {
    this.body = body
    this.status = init?.status ?? 200
  }

  static json(body: unknown, init?: ResponseInit) {
    return new TestResponseClass(body, init)
  }

  async json() {
    return this.body
  }
}

const TestResponse = TestResponseClass as unknown as typeof Response

describe('support outbox drain route', () => {
  beforeAll(() => {
    if (typeof Response === 'undefined') {
      Object.defineProperty(globalThis, 'Response', { value: TestResponse, configurable: true })
    }
  })

  beforeEach(() => {
    delete process.env.SUPPORT_OUTBOX_DRAIN_SECRET
    mockDrainSupportEventOutbox.mockReset()
  })

  it('rejects drain requests when the route secret is not configured', async () => {
    const response = await POST({ headers: new Headers() } as Request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Support outbox drain is not configured' })
    expect(mockDrainSupportEventOutbox).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated drain requests without leaking payloads', async () => {
    process.env.SUPPORT_OUTBOX_DRAIN_SECRET = 'secret-1'

    const response = await POST({ headers: new Headers() } as Request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized support outbox drain request' })
    expect(mockDrainSupportEventOutbox).not.toHaveBeenCalled()
  })

  it('accepts authenticated drain requests and returns only counts', async () => {
    process.env.SUPPORT_OUTBOX_DRAIN_SECRET = 'secret-1'
    mockDrainSupportEventOutbox.mockResolvedValue({ success: true, claimed: 2, dispatched: 1, failed: 1 })

    const response = await POST({ headers: new Headers([['authorization', 'Bearer secret-1']]) } as Request)

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ claimed: 2, dispatched: 1, failed: 1 })
  })

  it('accepts Vercel cron GET requests with the configured bearer secret', async () => {
    process.env.SUPPORT_OUTBOX_DRAIN_SECRET = 'secret-1'
    mockDrainSupportEventOutbox.mockResolvedValue({ success: true, claimed: 1, dispatched: 1, failed: 0 })

    const response = await GET({ headers: new Headers([['authorization', 'Bearer secret-1']]) } as Request)

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ claimed: 1, dispatched: 1, failed: 0 })
  })

  it('rejects unauthenticated Vercel cron GET requests', async () => {
    process.env.SUPPORT_OUTBOX_DRAIN_SECRET = 'secret-1'

    const response = await GET({ headers: new Headers() } as Request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized support outbox drain request' })
    expect(mockDrainSupportEventOutbox).not.toHaveBeenCalled()
  })
})
