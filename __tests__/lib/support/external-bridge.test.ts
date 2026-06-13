import {
  createExternalEscalationPayload,
  processExternalBridgeInboundUpdate,
  sanitizeExternalBridgeMessage,
  verifyExternalBridgeAuthorization,
} from '@/lib/support/external-bridge'
import { createSupportTicketCreatedEvent } from '@/lib/support/inngest'
import {
  createHermesEscalationRequestedEvent,
  createHermesTicketCreatedPayload,
  dispatchHermesEscalationRequest,
  dispatchHermesTicketCreated,
} from '@/lib/support/hermes'

describe('support external bridge', () => {
  beforeEach(() => {
    delete process.env.SUPPORT_HERMES_DISPATCH_MODE
    delete process.env.SUPPORT_HERMES_WEBHOOK_URL
    delete process.env.SUPPORT_HERMES_WEBHOOK_SECRET
    delete process.env.SUPPORT_HERMES_TIMEOUT_MS
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_ENV
  })

  it('creates sanitized outbound escalation payloads without diagnostics, attachments, signed URLs, object keys, or GitHub sync fields', () => {
    const payload = createExternalEscalationPayload({
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Map fails after login',
      summary: 'Steps: open map, receive 500. token=secret should be removed.',
      recipient: 'engineering-escalation',
      idempotencyKey: 'hermes-ticket-1',
      baseUrl: 'https://connect.example.test',
      diagnostics: { browser: 'Chrome', localStorage: 'secret' },
      attachments: [{ objectKey: 'support/ticket-1/attachment-1/file.png', signedUrl: 'https://r2.test/private?signature=secret' }],
      githubIssueUrl: 'https://github.com/org/repo/issues/1',
    })

    expect(payload).toEqual({
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Map fails after login',
      summary: 'Steps: open map, receive 500. [redacted] should be removed.',
      recipient: 'engineering-escalation',
      internalTicketUrl: 'https://connect.example.test/ayuda/tickets/ticket-1',
      idempotencyKey: 'hermes-ticket-1',
      callbackUrl: 'https://connect.example.test/api/support/external/inbound',
    })
    expect(JSON.stringify(payload)).not.toMatch(/diagnostics|attachment|objectKey|signedUrl|support\/ticket-1|signature=secret|github|token=secret|Chrome|localStorage/i)
  })

  it('creates a dry-run Hermes escalation event with the audited inbound callback path', async () => {
    const event = createHermesEscalationRequestedEvent({
      eventId: 'event-hermes-1',
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Map fails after login',
      summary: 'Safe staff-written summary. signedUrl=https://r2.test/private?signature=secret',
      recipient: 'hermes-support',
      diagnostics: { browser: 'Chrome' },
      attachments: [{ objectKey: 'support/ticket-1/attachment-1/file.png' }],
    })

    expect(event).toEqual({
      name: 'support/hermes.escalation.requested',
      id: 'support:event-hermes-1',
      data: {
        eventId: 'event-hermes-1',
        ticketId: 'ticket-1',
        escalation: {
          ticketId: 'ticket-1',
          ticketNumber: 42,
          title: 'Map fails after login',
          summary: 'Safe staff-written summary. [redacted]',
          recipient: 'hermes-support',
          internalTicketUrl: '/ayuda/tickets/ticket-1',
          idempotencyKey: 'hermes:ticket-1',
          callbackUrl: '/api/support/external/inbound',
        },
      },
    })
    expect(JSON.stringify(event)).not.toMatch(/diagnostics|attachment|objectKey|signedUrl|support\/ticket-1\/attachment|signature=secret|Chrome/i)

    await expect(dispatchHermesEscalationRequest(event)).resolves.toEqual({
      success: true,
      skipped: true,
      dryRun: true,
      eventId: 'event-hermes-1',
      reason: 'Hermes live outbound dispatch is deferred',
    })
  })

  it('skips Hermes ticket-created HTTP dispatch in disabled and dry-run modes', async () => {
    const fetchMock = jest.fn()
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1' })

    await expect(dispatchHermesTicketCreated(event, { mode: 'disabled', fetch: fetchMock })).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'Hermes ticket dispatch disabled',
    })

    await expect(dispatchHermesTicketCreated(event, { fetch: fetchMock })).resolves.toEqual({
      success: true,
      skipped: true,
      dryRun: true,
      eventId: 'event-created-1',
      deliveryId: 'global-connect:event-created-1',
      reason: 'Hermes ticket dispatch dry-run',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires Hermes URL and secret before live ticket-created dispatch', async () => {
    const fetchMock = jest.fn()
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1' })

    await expect(dispatchHermesTicketCreated(event, { mode: 'live', fetch: fetchMock })).rejects.toThrow(
      'Hermes live dispatch is missing SUPPORT_HERMES_WEBHOOK_URL or SUPPORT_HERMES_WEBHOOK_SECRET'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends Hermes ticket-created event_type in the body without relying on X-Hermes-Event', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 })
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1', actorUserId: 'user-1' })

    await expect(dispatchHermesTicketCreated(event, {
      mode: 'live',
      webhookUrl: 'https://hermes.example.test/webhooks/support-ticket',
      webhookSecret: 'test-webhook-secret',
      fetch: fetchMock,
    })).resolves.toEqual({ success: true, status: 202, deliveryId: 'global-connect:event-created-1' })

    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(request.body)
    expect(body).toMatchObject({
      event_type: 'ticket.created',
      delivery_id: 'global-connect:event-created-1',
      ticket: {
        id: 'ticket-1',
        internalUrl: '/ayuda/tickets/ticket-1',
      },
      source: { system: 'global-connect', environment: 'test' },
    })
    expect(body.ticket).not.toHaveProperty('number')
    expect(body.ticket).not.toHaveProperty('title')
    expect(body.ticket).not.toHaveProperty('category')
    expect(body.ticket).not.toHaveProperty('priority')
    expect(body.ticket).not.toHaveProperty('body')
    expect(body).not.toHaveProperty('reporter')
    expect(JSON.stringify(body)).not.toMatch(/Map fails|Open map|token|reporter@example|createdAt/i)
    expect(request.headers).toEqual({ authorization: 'Bearer test-webhook-secret', 'content-type': 'application/json' })
    expect(request.headers).not.toHaveProperty('X-Hermes-Event')
  })

  it('builds ID-first Hermes payloads without raw ticket fields or forbidden sensitive data', () => {
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1', actorUserId: 'user-1' })
    const payload = createHermesTicketCreatedPayload(event)
    const serialized = JSON.stringify(payload)

    expect(payload).toEqual({
      event_type: 'ticket.created',
      delivery_id: 'global-connect:event-created-1',
      ticket: { id: 'ticket-1', internalUrl: '/ayuda/tickets/ticket-1' },
      source: { system: 'global-connect', environment: 'test' },
    })
    expect(payload.ticket).not.toHaveProperty('title')
    expect(payload.ticket).not.toHaveProperty('body')
    expect(payload).not.toHaveProperty('reporter')
    expect(serialized).not.toMatch(/reporter@example\.com|555 555|cookie=session|support\/ticket-1\/attachment|signature=secret|signedUrl|diagnostics|rawSentry|headers|cookies|token|Need support|Email reporter/i)
  })

  it('rejects invalid Hermes event IDs before dispatch', async () => {
    const fetchMock = jest.fn()
    const missingEventId = createSupportTicketCreatedEvent({ eventId: '', ticketId: 'ticket-1' })
    const invalidTicketId = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket 1' })

    expect(() => createHermesTicketCreatedPayload(missingEventId)).toThrow('Hermes ticket dispatch requires a valid eventId')
    await expect(dispatchHermesTicketCreated(invalidTicketId, {
      mode: 'live',
      webhookUrl: 'https://hermes.example.test/webhooks/support-ticket',
      webhookSecret: 'test-webhook-secret',
      fetch: fetchMock,
    })).rejects.toThrow('Hermes ticket dispatch requires a valid ticketId')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on Hermes ticket-created fetch failures so Inngest can retry', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 })
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1' })

    await expect(dispatchHermesTicketCreated(event, {
      mode: 'live',
      webhookUrl: 'https://hermes.example.test/webhooks/support-ticket',
      webhookSecret: 'test-webhook-secret',
      fetch: fetchMock,
    })).rejects.toThrow('Hermes ticket dispatch failed with status 503')
  })

  it('aborts live Hermes ticket-created dispatch after the configured timeout', async () => {
    jest.useFakeTimers()
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created-1', ticketId: 'ticket-1' })
    const fetchMock: typeof fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))

    const result = dispatchHermesTicketCreated(event, {
      mode: 'live',
      webhookUrl: 'https://hermes.example.test/webhooks/support-ticket',
      webhookSecret: 'test-webhook-secret',
      timeoutMs: 25,
      fetch: fetchMock,
    })
    jest.advanceTimersByTime(25)

    await expect(result).rejects.toThrow('aborted')
    jest.useRealTimers()
  })

  it('authenticates inbound updates with a constant bearer token comparison', () => {
    expect(verifyExternalBridgeAuthorization('Bearer bridge-secret', 'bridge-secret')).toBe(true)
    expect(verifyExternalBridgeAuthorization('Bearer wrong-secret', 'bridge-secret')).toBe(false)
    expect(verifyExternalBridgeAuthorization(null, 'bridge-secret')).toBe(false)
  })

  it('sanitizes inbound messages before storage', () => {
    expect(sanitizeExternalBridgeMessage('Vendor replied with https://r2.test/private?signature=secret and token=secret')).toBe(
      'Vendor replied with [redacted-url] and [redacted]'
    )
  })

  it('stores authenticated inbound updates once through an atomic persistence boundary', async () => {
    const persistInboundUpdate = jest.fn().mockResolvedValue({ duplicate: false, eventId: 'event-1', messageId: 'message-1' })

    const result = await processExternalBridgeInboundUpdate({
      authorizationHeader: 'Bearer bridge-secret',
      expectedToken: 'bridge-secret',
      authorUsuarioId: '00000000-0000-0000-0000-000000000001',
      body: {
        ticketId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: 'external-update-1',
        message: 'Vendor fixed the upstream data mapping. signedUrl=https://r2.test/private?signature=secret',
      },
      persistInboundUpdate,
    })

    expect(result).toEqual({ success: true, duplicate: false, messageId: 'message-1', eventId: 'event-1' })
    expect(persistInboundUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ticketId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: 'external-update-1',
      action: 'external.update.received',
      body: 'Vendor fixed the upstream data mapping. [redacted]',
      isInternal: false,
    }))
  })

  it('prevents duplicate inbound updates by idempotency key without inserting another message', async () => {
    const persistInboundUpdate = jest.fn().mockResolvedValue({ duplicate: true, eventId: 'event-1' })
    const result = await processExternalBridgeInboundUpdate({
      authorizationHeader: 'Bearer bridge-secret',
      expectedToken: 'bridge-secret',
      authorUsuarioId: '00000000-0000-0000-0000-000000000001',
      body: {
        ticketId: '11111111-1111-1111-1111-111111111111',
        idempotencyKey: 'external-update-1',
        message: 'Duplicate update',
      },
      persistInboundUpdate,
    })

    expect(result).toEqual({ success: true, duplicate: true, eventId: 'event-1' })
    expect(persistInboundUpdate).toHaveBeenCalledTimes(1)
  })
})
