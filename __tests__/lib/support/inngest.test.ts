import {
  SUPPORT_INNGEST_EVENTS,
  createSupportAttachmentFinalizedEvent,
  createSupportEmailIdempotencyKey,
  createSupportTicketCreatedEvent,
  createSupportTicketMessageCreatedEvent,
  createSupportTicketStatusChangedEvent,
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

    const ticketCreated = createSupportTicketCreatedEvent(ticketCreatedInput)
    const messageCreated = createSupportTicketMessageCreatedEvent(messageCreatedInput)
    const statusChanged = createSupportTicketStatusChangedEvent(statusChangedInput)
    const attachmentFinalized = createSupportAttachmentFinalizedEvent(attachmentFinalizedInput)

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

    const queuedPayload = JSON.stringify([ticketCreated, messageCreated, statusChanged, attachmentFinalized])
    expect(queuedPayload).not.toMatch(/Unsafe text|rawSentry|secret|attachmentKey|r2ObjectKey|support\/ticket-1|github|messageBody|Resolved/i)
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
})
