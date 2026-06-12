import type { SupportEmailStatus } from '@/emails/support-ticket'

export const SUPPORT_INNGEST_EVENTS = {
  ticketCreated: 'support/ticket.created',
  ticketMessageCreated: 'support/ticket.message.created',
  ticketStatusChanged: 'support/ticket.status.changed',
  attachmentFinalized: 'support/attachment.finalized',
  externalUpdateReceived: 'support/external.update.received',
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
type SupportExternalUpdateReceivedEvent = SupportInngestEvent<typeof SUPPORT_INNGEST_EVENTS.externalUpdateReceived, SupportBaseEventPayload>

export type SupportNotificationEvent =
  | SupportTicketCreatedEvent
  | SupportTicketMessageCreatedEvent
  | SupportTicketStatusChangedEvent
  | SupportAttachmentFinalizedEvent
  | SupportExternalUpdateReceivedEvent

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

interface SupportTicketNotificationRow {
  id: string
  ticket_number: number
  title: string
  status: SupportEmailStatus
}

interface SupportCapabilityRecipientRow {
  usuario?: {
    id: string
    nombre: string | null
    apellido: string | null
    email: string | null
  } | null
}

interface SupportInngestDispatchOptions {
  endpoint?: string
  secret?: string
  fetch?: typeof fetch
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

export function createSupportExternalUpdateReceivedEvent(payload: SupportBaseEventPayload): SupportExternalUpdateReceivedEvent {
  return createSupportEvent(SUPPORT_INNGEST_EVENTS.externalUpdateReceived, toBasePayload(payload))
}

export function createSupportEmailIdempotencyKey(eventId: string, recipientEmail: string) {
  return `email:${eventId}:${recipientEmail.trim().toLowerCase()}`
}

export async function dispatchSupportInngestEvent(
  event: SupportNotificationEvent,
  options: SupportInngestDispatchOptions = {}
) {
  const endpoint = options.endpoint ?? process.env.SUPPORT_INNGEST_EVENT_URL
  const secret = options.secret ?? process.env.SUPPORT_INNGEST_WEBHOOK_SECRET
  const fetchFn = options.fetch ?? fetch

  if (!endpoint || !secret) {
    return { success: true as const, skipped: true as const, reason: 'Support event provider not configured' }
  }

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })

  if (!response.ok) return { success: false as const, status: response.status }
  return { success: true as const, status: response.status }
}

export async function deliverSupportNotificationEvent(
  event: SupportNotificationEvent,
  supabase: { from: (table: string) => unknown }
) {
  const ticket = await loadSupportTicketNotificationData(supabase, event.data.ticketId)
  if (!ticket) return []

  const recipients = await loadSupportStaffRecipients(supabase, ticket)
  return sendSupportNotificationEmails(event, recipients)
}

export async function sendSupportNotificationEmail(
  event: SupportNotificationEvent,
  emailData: SupportNotificationEmailData
) {
  const {
    sendSupportTicketCreatedEmail,
    sendSupportTicketMessageEmail,
    sendSupportTicketStatusChangedEmail,
  } = await import('@/lib/email/support')
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

export async function sendSupportNotificationEmails(
  event: SupportNotificationEvent,
  recipients: SupportNotificationEmailData[]
) {
  const sentRecipientKeys = new Set<string>()
  const results = []

  for (const recipient of recipients) {
    const recipientKey = recipient.recipientEmail.trim().toLowerCase()

    if (sentRecipientKeys.has(recipientKey)) {
      continue
    }

    sentRecipientKeys.add(recipientKey)
    results.push(await sendSupportNotificationEmail(event, recipient))
  }

  return results
}

async function loadSupportTicketNotificationData(
  supabase: { from: (table: string) => unknown },
  ticketId: string
): Promise<SupportTicketNotificationRow | null> {
  const query = supabase.from('support_tickets') as {
    select: (columns: string) => { eq: (column: string, value: string) => { single: () => Promise<{ data: SupportTicketNotificationRow | null; error: unknown }> } }
  }
  const { data, error } = await query.select('id,ticket_number,title,status').eq('id', ticketId).single()
  if (error || !data) return null
  return data
}

async function loadSupportStaffRecipients(
  supabase: { from: (table: string) => unknown },
  ticket: SupportTicketNotificationRow
): Promise<SupportNotificationEmailData[]> {
  const query = supabase.from('support_user_capabilities') as {
    select: (columns: string) => { is: (column: string, value: null) => Promise<{ data: SupportCapabilityRecipientRow[] | null; error: unknown }> }
  }
  const { data, error } = await query
    .select('usuario:usuarios!support_user_capabilities_usuario_id_fkey(id,nombre,apellido,email)')
    .is('revoked_at', null)

  if (error || !data) return []

  const seen = new Set<string>()
  const recipients: SupportNotificationEmailData[] = []

  for (const row of data) {
    const usuario = row.usuario
    const email = usuario?.email?.trim()
    if (!usuario || !email) continue

    const key = email.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    recipients.push({
      recipientEmail: email,
      recipientName: [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || undefined,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      status: ticket.status,
    })
  }

  return recipients
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
