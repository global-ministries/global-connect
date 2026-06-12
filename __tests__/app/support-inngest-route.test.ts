import { POST } from '@/app/api/inngest/route'

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

describe('support Inngest route', () => {
  beforeAll(() => {
    if (typeof Response === 'undefined') {
      Object.defineProperty(globalThis, 'Response', { value: TestResponse, configurable: true })
    }
  })

  beforeEach(() => {
    delete process.env.SUPPORT_INNGEST_WEBHOOK_SECRET
  })

  it('rejects unsigned provider requests when a webhook secret is configured', async () => {
    process.env.SUPPORT_INNGEST_WEBHOOK_SECRET = 'secret-1'

    const response = await POST({ headers: new Headers(), json: async () => ({}) } as Request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized support event provider request' })
  })

  it('rejects unsigned provider requests when the webhook secret is not configured', async () => {
    const response = await POST({ headers: new Headers(), json: async () => ({}) } as Request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Support event provider secret is not configured' })
  })

  it('accepts signed ID-only support events without exposing provider secrets or raw evidence', async () => {
    process.env.SUPPORT_INNGEST_WEBHOOK_SECRET = 'secret-1'
    const response = await POST({
      headers: new Headers([['authorization', 'Bearer secret-1']]),
      json: async () => ({
        name: 'support/ticket.created',
        id: 'support:event-1',
        data: { eventId: 'event-1', ticketId: 'ticket-1', rawSentryPayload: { token: 'secret' } },
      }),
    } as Request)

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true, eventId: 'event-1', name: 'support/ticket.created' })
  })

  it('returns a controlled 400 response for malformed signed JSON payloads', async () => {
    process.env.SUPPORT_INNGEST_WEBHOOK_SECRET = 'secret-1'

    const response = await POST({
      headers: new Headers([['authorization', 'Bearer secret-1']]),
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as Request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Malformed support event provider payload' })
  })
})
