import { supportExternalInboundRoute } from '@/lib/support/external-bridge'

const createSupabaseAdminClient = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

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

describe('support external inbound route', () => {
  beforeAll(() => {
    if (typeof Response === 'undefined') {
      Object.defineProperty(globalThis, 'Response', { value: TestResponse, configurable: true })
    }
  })

  beforeEach(() => {
    jest.resetAllMocks()
    createSupabaseAdminClient.mockReset()
    process.env.SUPPORT_EXTERNAL_BRIDGE_TOKEN = 'bridge-secret'
    process.env.SUPPORT_EXTERNAL_BRIDGE_AUTHOR_USUARIO_ID = '00000000-0000-0000-0000-000000000001'
  })

  it('rejects unauthenticated inbound bridge updates', async () => {
    const response = await supportExternalInboundRoute({ headers: new Headers(), json: async () => ({}) } as Request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized external support update' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('persists sanitized authenticated inbound updates through Supabase admin without exposing raw bridge payloads', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { event_id: 'event-1', message_id: 'message-1', duplicate: false }, error: null })
    createSupabaseAdminClient.mockReturnValue({
      rpc,
    })

    const response = await supportExternalInboundRoute({
      headers: new Headers([['authorization', 'Bearer bridge-secret']]),
      json: async () => ({
        ticketId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: 'external-update-1',
        message: 'External fix is ready. token=secret https://r2.test/private?signature=secret',
        action: 'public_reply',
      }),
    } as Request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, duplicate: false, messageId: 'message-1', eventId: 'event-1' })
    expect(rpc).toHaveBeenCalledWith('record_support_external_inbound_update', expect.objectContaining({
      p_idempotency_key: 'external-update-1',
      p_message_body: 'External fix is ready. [redacted] [redacted-url]',
      p_is_internal: false,
    }))
  })

  it('handles duplicate inbound callbacks idempotently', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { event_id: 'event-2', duplicate: true }, error: null })
    createSupabaseAdminClient.mockReturnValue({
      rpc,
    })

    const response = await supportExternalInboundRoute({
      headers: new Headers([['authorization', 'Bearer bridge-secret']]),
      json: async () => ({
        ticketId: '22222222-2222-2222-2222-222222222222',
        idempotencyKey: 'external-update-2',
        message: 'Duplicate message payload',
        action: 'internal_note',
      }),
    } as Request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, duplicate: true, eventId: 'event-2' })
    expect(rpc).toHaveBeenCalledWith('record_support_external_inbound_update', expect.objectContaining({
      p_idempotency_key: 'external-update-2',
      p_is_internal: true,
    }))
  })

  it('returns a controlled 400 response for malformed authenticated JSON payloads', async () => {
    const response = await supportExternalInboundRoute({
      headers: new Headers([['authorization', 'Bearer bridge-secret']]),
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as Request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Malformed external support update' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})
