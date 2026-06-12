import {
  SUPPORT_INNGEST_EVENTS,
  createSupportAttachmentFinalizedEvent,
  createSupportEmailIdempotencyKey,
  createSupportExternalUpdateReceivedEvent,
  createSupportTicketCreatedEvent,
  createSupportTicketMessageCreatedEvent,
  createSupportTicketStatusChangedEvent,
  deliverSupportNotificationEvent,
  dispatchSupportOfficialInngestEvent,
  dispatchSupportInngestEvent,
  sendSupportNotificationEmails,
  sendSupportNotificationEmail,
} from '@/lib/support/inngest'
import {
  sendSupportTicketCreatedEmail,
  sendSupportTicketMessageEmail,
  sendSupportTicketStatusChangedEmail,
} from '@/lib/email/support'

jest.mock('@/lib/email/support', () => ({
  sendSupportTicketCreatedEmail: jest.fn(),
  sendSupportTicketMessageEmail: jest.fn(),
  sendSupportTicketStatusChangedEmail: jest.fn(),
}))

const createdEmailMock = jest.mocked(sendSupportTicketCreatedEmail)
const messageEmailMock = jest.mocked(sendSupportTicketMessageEmail)
const statusEmailMock = jest.mocked(sendSupportTicketStatusChangedEmail)

describe('support Inngest events', () => {
  beforeEach(() => {
    createdEmailMock.mockReset()
    messageEmailMock.mockReset()
    statusEmailMock.mockReset()
    delete process.env.SUPPORT_OFFICIAL_INNGEST_ENABLED
    delete process.env.INNGEST_EVENT_KEY
  })

  it('builds ID-only Inngest events with stable event deduplication IDs', () => {
    const ticketCreatedInput = {
      eventId: 'event-created-1',
      ticketId: 'ticket-1',
      actorUserId: 'user-1',
      title: 'Unsafe text must not enter the payload',
      rawSentryPayload: { token: 'secret' },
      attachmentKey: 'support/ticket-1/attachment-1/file.png',
      githubIssueUrl: 'https://github.com/org/repo/issues/1',
    }
    const messageCreatedInput = {
      eventId: 'event-message-1',
      ticketId: 'ticket-1',
      messageId: 'message-1',
      actorUserId: 'user-2',
      messageBody: 'Do not queue user-provided message bodies',
    }
    const statusChangedInput = {
      eventId: 'event-status-1',
      ticketId: 'ticket-1',
      actorUserId: 'user-3',
      statusLabel: 'Resolved',
    }
    const attachmentFinalizedInput = {
      eventId: 'event-attachment-1',
      ticketId: 'ticket-1',
      attachmentId: 'attachment-1',
      actorUserId: 'user-4',
      r2ObjectKey: 'support/ticket-1/attachment-1/file.png',
    }
    const externalUpdateInput = {
      eventId: 'event-external-1',
      ticketId: 'ticket-1',
      actorUserId: 'user-5',
      externalMessage: 'Private external details must not enter the payload',
      externalSystemUrl: 'https://vendor.test/tickets/123',
    }

    const ticketCreated = createSupportTicketCreatedEvent(ticketCreatedInput)
    const messageCreated = createSupportTicketMessageCreatedEvent(messageCreatedInput)
    const statusChanged = createSupportTicketStatusChangedEvent(statusChangedInput)
    const attachmentFinalized = createSupportAttachmentFinalizedEvent(attachmentFinalizedInput)
    const externalUpdate = createSupportExternalUpdateReceivedEvent(externalUpdateInput)

    expect(ticketCreated).toEqual({
      name: SUPPORT_INNGEST_EVENTS.ticketCreated,
      id: 'support:event-created-1',
      data: { eventId: 'event-created-1', ticketId: 'ticket-1', actorUserId: 'user-1' },
    })
    expect(messageCreated.data).toEqual({
      eventId: 'event-message-1',
      ticketId: 'ticket-1',
      messageId: 'message-1',
      actorUserId: 'user-2',
    })
    expect(statusChanged.data).toEqual({ eventId: 'event-status-1', ticketId: 'ticket-1', actorUserId: 'user-3' })
    expect(attachmentFinalized.data).toEqual({
      eventId: 'event-attachment-1',
      ticketId: 'ticket-1',
      attachmentId: 'attachment-1',
      actorUserId: 'user-4',
    })
    expect(externalUpdate).toEqual({
      name: SUPPORT_INNGEST_EVENTS.externalUpdateReceived,
      id: 'support:event-external-1',
      data: { eventId: 'event-external-1', ticketId: 'ticket-1', actorUserId: 'user-5' },
    })

    const queuedPayload = JSON.stringify([ticketCreated, messageCreated, statusChanged, attachmentFinalized, externalUpdate])
    expect(queuedPayload).not.toMatch(/Unsafe text|rawSentry|secret|attachmentKey|r2ObjectKey|support\/ticket-1|github|messageBody|Resolved|Private external|vendor\.test/i)
  })

  it('creates one deterministic email idempotency key per event and normalized recipient', () => {
    expect(createSupportEmailIdempotencyKey('event-1', ' Reporter@Example.COM ')).toBe('email:event-1:reporter@example.com')
    expect(createSupportEmailIdempotencyKey('event-1', 'other@example.com')).toBe('email:event-1:other@example.com')
  })

  it('routes ticket events to safe email helpers with event-recipient idempotency keys', async () => {
    createdEmailMock.mockResolvedValue({ success: true, id: 'email-created' })
    messageEmailMock.mockResolvedValue({ success: true, id: 'email-message' })
    statusEmailMock.mockResolvedValue({ success: true, id: 'email-status' })

    const emailData = {
      recipientEmail: 'Reporter@Example.COM',
      recipientName: 'Isaac',
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Cannot open group map',
      status: 'resolved' as const,
    }

    await expect(sendSupportNotificationEmail(createSupportTicketCreatedEvent({ eventId: 'event-created', ticketId: 'ticket-1' }), emailData)).resolves.toEqual({ success: true, id: 'email-created' })
    await expect(sendSupportNotificationEmail(createSupportTicketMessageCreatedEvent({ eventId: 'event-message', ticketId: 'ticket-1', messageId: 'message-1' }), emailData)).resolves.toEqual({ success: true, id: 'email-message' })
    await expect(sendSupportNotificationEmail(createSupportTicketStatusChangedEvent({ eventId: 'event-status', ticketId: 'ticket-1' }), emailData)).resolves.toEqual({ success: true, id: 'email-status' })

    expect(createdEmailMock).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'email:event-created:reporter@example.com' }))
    expect(messageEmailMock).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'email:event-message:reporter@example.com' }))
    expect(statusEmailMock).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'email:event-status:reporter@example.com' }))
  })

  it('sends one email per support event and normalized recipient', async () => {
    createdEmailMock.mockResolvedValue({ success: true, id: 'email-created' })

    const result = await sendSupportNotificationEmails(
      createSupportTicketCreatedEvent({ eventId: 'event-created', ticketId: 'ticket-1' }),
      [
        {
          recipientEmail: 'Reporter@Example.COM',
          recipientName: 'Isaac',
          ticketId: 'ticket-1',
          ticketNumber: 42,
          title: 'Cannot open group map',
          status: 'received',
        },
        {
          recipientEmail: ' reporter@example.com ',
          recipientName: 'Duplicate reporter',
          ticketId: 'ticket-1',
          ticketNumber: 42,
          title: 'Cannot open group map',
          status: 'received',
        },
        {
          recipientEmail: 'staff@example.com',
          ticketId: 'ticket-1',
          ticketNumber: 42,
          title: 'Cannot open group map',
          status: 'received',
        },
      ]
    )

    expect(result).toHaveLength(2)
    expect(createdEmailMock).toHaveBeenCalledTimes(2)
    expect(createdEmailMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      recipientEmail: 'Reporter@Example.COM',
      idempotencyKey: 'email:event-created:reporter@example.com',
    }))
    expect(createdEmailMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      recipientEmail: 'staff@example.com',
      idempotencyKey: 'email:event-created:staff@example.com',
    }))
  })

  it('drops unsafe evidence, attachment, Sentry, GitHub, and long user text from queued payloads', () => {
    const longMessageBody = 'The user wrote private troubleshooting context. '.repeat(20)
    const noisyCreated = createSupportTicketCreatedEvent({
      eventId: 'event-created-noisy',
      ticketId: 'ticket-1',
      actorUserId: 'user-1',
      evidence: { route: '/ayuda?token=secret', browser: 'Chrome' },
      attachments: [{ objectKey: 'support/ticket-1/attachment-1/private.png' }],
      rawSentryPayload: { exception: { values: [{ value: 'token=secret' }] } },
      sentryEventId: 'sentry-event-1',
      githubIssue: { url: 'https://github.com/org/repo/issues/1', body: 'private issue details' },
      messageBody: longMessageBody,
      description: longMessageBody,
    } as Parameters<typeof createSupportTicketCreatedEvent>[0])

    const noisyMessage = createSupportTicketMessageCreatedEvent({
      eventId: 'event-message-noisy',
      ticketId: 'ticket-1',
      messageId: 'message-1',
      actorUserId: 'user-2',
      body: longMessageBody,
      diagnostics: { viewport: '1920x1080' },
    } as Parameters<typeof createSupportTicketMessageCreatedEvent>[0])

    const queuedPayload = JSON.stringify([noisyCreated, noisyMessage])

    expect(noisyCreated.data).toEqual({ eventId: 'event-created-noisy', ticketId: 'ticket-1', actorUserId: 'user-1' })
    expect(noisyMessage.data).toEqual({ eventId: 'event-message-noisy', ticketId: 'ticket-1', messageId: 'message-1', actorUserId: 'user-2' })
    expect(queuedPayload).not.toMatch(/evidence|attachment|objectKey|support\/ticket-1|rawSentry|sentry-event|github|private issue|messageBody|description|diagnostics|token=secret|Chrome|1920x1080|private troubleshooting/i)
  })

  it('does not send email for attachment-finalized events in the MVP notification slice', async () => {
    const result = await sendSupportNotificationEmail(
      createSupportAttachmentFinalizedEvent({ eventId: 'event-attachment', ticketId: 'ticket-1', attachmentId: 'attachment-1' }),
      {
        recipientEmail: 'reporter@example.com',
        ticketId: 'ticket-1',
        ticketNumber: 42,
        title: 'Attachment uploaded',
        status: 'received',
      }
    )

    expect(result).toEqual({ success: true, skipped: true, reason: 'No support email for support/attachment.finalized' })
    expect(createdEmailMock).not.toHaveBeenCalled()
    expect(messageEmailMock).not.toHaveBeenCalled()
    expect(statusEmailMock).not.toHaveBeenCalled()
  })

  it('does not send email for external update events because inbound updates are audited in-app', async () => {
    const result = await sendSupportNotificationEmail(
      createSupportExternalUpdateReceivedEvent({ eventId: 'event-external', ticketId: 'ticket-1' }),
      {
        recipientEmail: 'reporter@example.com',
        ticketId: 'ticket-1',
        ticketNumber: 42,
        title: 'External bridge update',
        status: 'in_review',
      }
    )

    expect(result).toEqual({ success: true, skipped: true, reason: 'No support email for support/external.update.received' })
    expect(createdEmailMock).not.toHaveBeenCalled()
    expect(messageEmailMock).not.toHaveBeenCalled()
    expect(statusEmailMock).not.toHaveBeenCalled()
  })

  it('dispatches support events to a configured provider endpoint without sending when the provider is disabled', async () => {
    const fetchMock = jest.fn()
    const event = createSupportTicketCreatedEvent({ eventId: 'event-created', ticketId: 'ticket-1', actorUserId: 'user-1' })

    await expect(dispatchSupportInngestEvent(event, { fetch: fetchMock, endpoint: '', secret: '' })).resolves.toEqual({ success: true, skipped: true, reason: 'Support event provider not configured' })
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValue({ ok: true, status: 202 })
    await expect(dispatchSupportInngestEvent(event, { fetch: fetchMock, endpoint: 'https://events.example.test/api/inngest', secret: 'secret-1' })).resolves.toEqual({ success: true, status: 202 })
    expect(fetchMock).toHaveBeenCalledWith('https://events.example.test/api/inngest', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-1', 'content-type': 'application/json' },
      body: JSON.stringify(event),
    })
  })

  it('sends ID-only support events to official Inngest when explicitly configured', async () => {
    const sender = { send: jest.fn().mockResolvedValue({ ids: ['inngest-event-1'] }) }
    const event = createSupportTicketCreatedEvent({
      eventId: 'event-created',
      ticketId: 'ticket-1',
      actorUserId: 'user-1',
      rawSentryPayload: { token: 'secret' },
      messageBody: 'Do not queue this text',
    } as Parameters<typeof createSupportTicketCreatedEvent>[0])

    await expect(dispatchSupportOfficialInngestEvent(event, { sender })).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'Official Inngest event provider not configured',
    })
    expect(sender.send).not.toHaveBeenCalled()

    await expect(dispatchSupportOfficialInngestEvent(event, { enabled: true, sender })).resolves.toEqual({
      success: true,
      result: { ids: ['inngest-event-1'] },
    })
    expect(sender.send).toHaveBeenCalledWith({
      id: 'support:event-created',
      name: SUPPORT_INNGEST_EVENTS.ticketCreated,
      data: { eventId: 'event-created', ticketId: 'ticket-1', actorUserId: 'user-1' },
    })
    expect(JSON.stringify(sender.send.mock.calls)).not.toMatch(/rawSentry|secret|messageBody|Do not queue/i)

    sender.send.mockRejectedValueOnce(new Error('network unavailable'))
    await expect(dispatchSupportOfficialInngestEvent(event, { enabled: true, sender })).resolves.toEqual({
      success: false,
      error: 'Official Inngest event dispatch failed',
    })
  })

  it('sends ticket-created receipts only to the ticket reporter', async () => {
    createdEmailMock.mockResolvedValue({ success: true, id: 'email-created' })
    const supabase = createSupportNotificationSupabaseMock()

    const result = await deliverSupportNotificationEvent(
      createSupportTicketCreatedEvent({ eventId: 'event-created', ticketId: 'ticket-1', actorUserId: 'reporter-1' }),
      supabase
    )

    expect(result).toEqual([{ success: true, id: 'email-created' }])
    expect(createdEmailMock).toHaveBeenCalledTimes(1)
    expect(createdEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'reporter@example.com',
      recipientName: 'Ticket Reporter',
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Cannot open group map',
      status: 'received',
      idempotencyKey: 'email:event-created:reporter@example.com',
    }))
    expect(JSON.stringify(createdEmailMock.mock.calls)).not.toMatch(/rawSentry|evidence|attachment|object_key|support\/ticket-1/i)
  })

  it('keeps message notifications on the active support staff recipient path', async () => {
    messageEmailMock.mockResolvedValue({ success: true, id: 'email-message' })
    const supabase = createSupportNotificationSupabaseMock()

    const result = await deliverSupportNotificationEvent(
      createSupportTicketMessageCreatedEvent({ eventId: 'event-message', ticketId: 'ticket-1', messageId: 'message-1', actorUserId: 'reporter-1' }),
      supabase
    )

    expect(result).toEqual([{ success: true, id: 'email-message' }, { success: true, id: 'email-message' }])
    expect(messageEmailMock).toHaveBeenCalledTimes(2)
    expect(messageEmailMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      recipientEmail: 'staff-view@example.com',
      recipientName: 'View Staff',
      idempotencyKey: 'email:event-message:staff-view@example.com',
    }))
    expect(messageEmailMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      recipientEmail: 'staff-reply@example.com',
      recipientName: 'Reply Staff',
      idempotencyKey: 'email:event-message:staff-reply@example.com',
    }))
  })
})

function createSupportNotificationSupabaseMock() {
  const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42, title: 'Cannot open group map', status: 'received', reporter: { id: 'reporter-1', nombre: 'Ticket', apellido: 'Reporter', email: 'reporter@example.com' } }, error: null }) }) }) }
  const capabilityQuery = {
    select: jest.fn().mockReturnValue({
      is: jest.fn().mockResolvedValue({
        data: [
          { usuario: { id: 'staff-view', nombre: 'View', apellido: 'Staff', email: 'staff-view@example.com' } },
          { usuario: { id: 'staff-view', nombre: 'View', apellido: 'Staff', email: 'staff-view@example.com' } },
          { usuario: { id: 'staff-reply', nombre: 'Reply', apellido: 'Staff', email: 'staff-reply@example.com' } },
          { usuario: { id: 'staff-no-email', nombre: 'No', apellido: 'Email', email: null } },
        ],
        error: null,
      }),
    }),
  }

  return {
    from: jest.fn((table: string) => {
      if (table === 'support_tickets') return ticketQuery
      if (table === 'support_user_capabilities') return capabilityQuery
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}
