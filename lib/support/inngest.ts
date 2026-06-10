import type { SupportEmailStatus } from '@/emails/support-ticket'
import {
  sendSupportTicketCreatedEmail,
  sendSupportTicketMessageEmail,
  sendSupportTicketStatusChangedEmail,
} from '@/lib/email/support'

export const SUPPORT_INNGEST_EVENTS = {
  ticketCreated: 'support/ticket.created',
  ticketMessageCreated: 'support/ticket.message.created',
  ticketStatusChanged: 'support/ticket.status.changed',
  attachmentFinalized: 'support/attachment.finalized',
} as const

type SupportInngestEventName = typeof SUPPORT_INNGEST_EVENTS[keyof typeof SUPPORT_INNGEST_EVENTS]

interface SupportBaseEventPayload {
  eventId: string
  ticketId: string
  actorUserId?: string
}

interface SupportMessageEventPayload extends SupportBaseEventPayload {
  messageId: string
}

interface SupportAttachmentEventPayload extends SupportBaseEventPayload {
  attachmentId: string
}

type SupportTicketCreatedEvent = SupportInngestEvent<typeof SUPPORT_INNGEST_EVENTS.ticketCreated, SupportBaseEventPayload>
type SupportTicketMessageCreatedEvent = SupportInngestEvent<typeof SUPPORT_INNGEST_EVENTS.ticketMessageCreated, SupportMessageEventPayload>
type SupportTicketStatusChangedEvent = SupportInngestEvent<typeof SUPPORT_INNGEST_EVENTS.ticketStatusChanged, SupportBaseEventPayload>
type SupportAttachmentFinalizedEvent = SupportInngestEvent<typeof SUPPORT_INNGEST_EVENTS.attachmentFinalized, SupportAttachmentEventPayload>

export type SupportNotificationEvent =
  | SupportTicketCreatedEvent
  | SupportTicketMessageCreatedEvent
  | SupportTicketStatusChangedEvent
  | SupportAttachmentFinalizedEvent

export interface SupportInngestEvent<Name extends SupportInngestEventName, Payload extends SupportBaseEventPayload> {
  name: Name
  id: string
  data: Payload
}

interface SupportNotificationEmailData {
  recipientEmail: string
  recipientName?: string
  ticketId: string
  ticketNumber: number
  title: string
  status: SupportEmailStatus
}

interface SkippedSupportNotificationEmailResult {
  success: true
  skipped: true
  reason: string
}

export function createSupportTicketCreatedEvent(payload: SupportBaseEventPayload): SupportTicketCreatedEvent {
  return createSupportEvent(SUPPORT_INNGEST_EVENTS.ticketCreated, toBasePayload(payload))
}

export function createSupportTicketMessageCreatedEvent(payload: SupportMessageEventPayload): SupportTicketMessageCreatedEvent {
  return createSupportEvent(SUPPORT_INNGEST_EVENTS.ticketMessageCreated, {
    ...toBasePayload(payload),
    messageId: payload.messageId,
  })
}

export function createSupportTicketStatusChangedEvent(payload: SupportBaseEventPayload): SupportTicketStatusChangedEvent {
  return createSupportEvent(SUPPORT_INNGEST_EVENTS.ticketStatusChanged, toBasePayload(payload))
}

export function createSupportAttachmentFinalizedEvent(payload: SupportAttachmentEventPayload): SupportAttachmentFinalizedEvent {
  return createSupportEvent(SUPPORT_INNGEST_EVENTS.attachmentFinalized, {
    ...toBasePayload(payload),
    attachmentId: payload.attachmentId,
  })
}

export function createSupportEmailIdempotencyKey(eventId: string, recipientEmail: string) {
  return `email:${eventId}:${recipientEmail.trim().toLowerCase()}`
}

export async function sendSupportNotificationEmail(
  event: SupportNotificationEvent,
  emailData: SupportNotificationEmailData
) {
  const idempotencyKey = createSupportEmailIdempotencyKey(event.data.eventId, emailData.recipientEmail)
  const params = { ...emailData, idempotencyKey }

  if (event.name === SUPPORT_INNGEST_EVENTS.ticketCreated) {
    return sendSupportTicketCreatedEmail(params)
  }

  if (event.name === SUPPORT_INNGEST_EVENTS.ticketMessageCreated) {
    return sendSupportTicketMessageEmail(params)
  }

  if (event.name === SUPPORT_INNGEST_EVENTS.ticketStatusChanged) {
    return sendSupportTicketStatusChangedEmail(params)
  }

  return {
    success: true,
    skipped: true,
    reason: `No support email for ${event.name}`,
  } satisfies SkippedSupportNotificationEmailResult
}

function createSupportEvent<Name extends SupportInngestEventName, Payload extends SupportBaseEventPayload>(
  name: Name,
  data: Payload
): SupportInngestEvent<Name, Payload> {
  return { name, id: `support:${data.eventId}`, data }
}

function toBasePayload(payload: SupportBaseEventPayload): SupportBaseEventPayload {
  return {
    eventId: payload.eventId,
    ticketId: payload.ticketId,
    ...(payload.actorUserId ? { actorUserId: payload.actorUserId } : {}),
  }
}
