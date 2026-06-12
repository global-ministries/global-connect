import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  SUPPORT_INNGEST_EVENTS,
  createSupportAttachmentFinalizedEvent,
  createSupportExternalUpdateReceivedEvent,
  createSupportTicketCreatedEvent,
  createSupportTicketMessageCreatedEvent,
  createSupportTicketStatusChangedEvent,
  deliverSupportNotificationEvent,
} from '@/lib/support/inngest'

type SupportInngestRouteEvent = {
  name: string
  id?: string
  data?: {
    eventId?: string
    ticketId?: string
    messageId?: string
    attachmentId?: string
  }
}

const SUPPORT_EVENT_NAMES = new Set([
  'support/ticket.created',
  'support/ticket.message.created',
  'support/ticket.status.changed',
  'support/attachment.finalized',
  'support/external.update.received',
])

export async function supportInngestRoute(request: Request): Promise<Response> {
  const secret = process.env.SUPPORT_INNGEST_WEBHOOK_SECRET
  if (!secret) {
    return jsonResponse({ error: 'Support event provider secret is not configured' }, 503)
  }

  if (!verifyBearerToken(request.headers.get('authorization'), secret)) {
    return jsonResponse({ error: 'Unauthorized support event provider request' }, 401)
  }

  const body = await readJson(request)
  if (!body.success) {
    return jsonResponse({ error: 'Malformed support event provider payload' }, 400)
  }

  const event = parseSupportInngestRouteEvent(body.data)
  if (!event || !SUPPORT_EVENT_NAMES.has(event.name) || !event.data?.eventId || !event.data.ticketId) {
    return jsonResponse({ error: 'Invalid support event provider payload' }, 400)
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await deliverSupportNotificationEvent(toSupportNotificationEvent(event), createSupabaseAdminClient())
  }

  return jsonResponse({ accepted: true, eventId: event.data.eventId, name: event.name }, 202)
}

async function readJson(request: Request) {
  try {
    return { success: true as const, data: await request.json() }
  } catch {
    return { success: false as const }
  }
}

function parseSupportInngestRouteEvent(value: unknown): SupportInngestRouteEvent | null {
  if (!value || typeof value !== 'object') return null
  if (!('name' in value) || typeof value.name !== 'string') return null

  const data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : null
  return {
    name: value.name,
    ...('id' in value && typeof value.id === 'string' ? { id: value.id } : {}),
    ...(data ? { data: pickIdOnlyData(data) } : {}),
  }
}

function pickIdOnlyData(data: object) {
  return {
    ...('eventId' in data && typeof data.eventId === 'string' ? { eventId: data.eventId } : {}),
    ...('ticketId' in data && typeof data.ticketId === 'string' ? { ticketId: data.ticketId } : {}),
    ...('messageId' in data && typeof data.messageId === 'string' ? { messageId: data.messageId } : {}),
    ...('attachmentId' in data && typeof data.attachmentId === 'string' ? { attachmentId: data.attachmentId } : {}),
  }
}

function verifyBearerToken(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false

  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

function toSupportNotificationEvent(event: SupportInngestRouteEvent) {
  const payload = { eventId: event.data?.eventId ?? '', ticketId: event.data?.ticketId ?? '' }

  if (event.name === SUPPORT_INNGEST_EVENTS.ticketMessageCreated) {
    return createSupportTicketMessageCreatedEvent({ ...payload, messageId: event.data?.messageId ?? '' })
  }

  if (event.name === SUPPORT_INNGEST_EVENTS.ticketStatusChanged) {
    return createSupportTicketStatusChangedEvent(payload)
  }

  if (event.name === SUPPORT_INNGEST_EVENTS.attachmentFinalized) {
    return createSupportAttachmentFinalizedEvent({ ...payload, attachmentId: event.data?.attachmentId ?? '' })
  }

  if (event.name === SUPPORT_INNGEST_EVENTS.externalUpdateReceived) {
    return createSupportExternalUpdateReceivedEvent(payload)
  }

  return createSupportTicketCreatedEvent(payload)
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}
