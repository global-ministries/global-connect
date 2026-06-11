import {
  createExternalEscalationPayload,
  processExternalBridgeInboundUpdate,
  sanitizeExternalBridgeMessage,
  verifyExternalBridgeAuthorization,
} from '@/lib/support/external-bridge'

describe('support external bridge', () => {
  it('creates sanitized outbound escalation payloads without diagnostics, attachments, signed URLs, object keys, or GitHub sync fields', () => {
    const payload = createExternalEscalationPayload({
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Map fails after login',
      summary: 'Steps: open map, receive 500. token=secret should be removed.',
      recipient: 'engineering-escalation',
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
      internalTicketUrl: '/ayuda/tickets/ticket-1',
    })
    expect(JSON.stringify(payload)).not.toMatch(/diagnostics|attachment|objectKey|signedUrl|support\/ticket-1|signature=secret|github|token=secret|Chrome|localStorage/i)
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
