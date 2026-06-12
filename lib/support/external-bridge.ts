import { z } from 'zod'
import { timingSafeEqual } from 'crypto'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const inboundUpdateSchema = z.object({
  ticketId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(3).max(120),
  message: z.string().trim().min(1).max(8000),
})

export type ExternalEscalationInput = {
  ticketId: string
  ticketNumber: number
  title: string
  summary: string
  recipient: string
  baseUrl?: string
  idempotencyKey?: string
} & Record<string, unknown>

export type ExternalEscalationPayload = {
  ticketId: string
  ticketNumber: number
  title: string
  summary: string
  recipient: string
  internalTicketUrl: string
  idempotencyKey: string
  callbackUrl: string
}

type InsertAuditEventInput = {
  ticketId: string
  actorUsuarioId: string
  action: string
  targetType: string
  idempotencyKey: string
  body: string
  isInternal: boolean
}

type PersistInboundUpdateResult = { duplicate: boolean; eventId: string; messageId?: string }

type ProcessExternalBridgeInboundUpdateParams = {
  authorizationHeader: string | null
  expectedToken: string
  authorUsuarioId: string
  body: unknown
  persistInboundUpdate: (input: InsertAuditEventInput) => Promise<PersistInboundUpdateResult>
}

export function createExternalEscalationPayload(input: ExternalEscalationInput): ExternalEscalationPayload {
  const internalTicketPath = `/ayuda/tickets/${encodeURIComponent(input.ticketId)}`
  const callbackPath = '/api/support/external/inbound'

  return {
    ticketId: input.ticketId,
    ticketNumber: input.ticketNumber,
    title: sanitizeExternalBridgeMessage(input.title),
    summary: sanitizeExternalBridgeMessage(input.summary),
    recipient: sanitizeExternalBridgeMessage(input.recipient),
    internalTicketUrl: toBridgeUrl(input.baseUrl, internalTicketPath),
    idempotencyKey: input.idempotencyKey ?? `hermes:${input.ticketId}`,
    callbackUrl: toBridgeUrl(input.baseUrl, callbackPath),
  }
}

export function verifyExternalBridgeAuthorization(authorizationHeader: string | null, expectedToken: string) {
  if (!authorizationHeader || !expectedToken) return false
  const expected = Buffer.from(`Bearer ${expectedToken}`)
  const received = Buffer.from(authorizationHeader)
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

export function sanitizeExternalBridgeMessage(message: string) {
  return message
    .replace(/https?:\/\/\S*(?:signature|token|X-Amz-Signature|r2)\S*/gi, '[redacted-url]')
    .replace(/\b(?:token|signedUrl|signature|password|cookie)=\S+/gi, '[redacted]')
    .replace(/support\/[\w-]+\/[\w-]+\/\S+/gi, '[redacted-object-key]')
    .trim()
}

export async function processExternalBridgeInboundUpdate(params: ProcessExternalBridgeInboundUpdateParams) {
  if (!verifyExternalBridgeAuthorization(params.authorizationHeader, params.expectedToken)) {
    return { success: false as const, status: 401, error: 'Unauthorized external support update' }
  }

  const parsed = inboundUpdateSchema.safeParse(params.body)
  if (!parsed.success) {
    return { success: false as const, status: 400, error: 'Invalid external support update' }
  }

  const inboundUpdate = await params.persistInboundUpdate({
    ticketId: parsed.data.ticketId,
    actorUsuarioId: params.authorUsuarioId,
    action: 'external.update.received',
    targetType: 'support_external_update',
    idempotencyKey: parsed.data.idempotencyKey,
    body: sanitizeExternalBridgeMessage(parsed.data.message),
    isInternal: false,
  })

  if (inboundUpdate.duplicate) {
    return { success: true as const, duplicate: true, eventId: inboundUpdate.eventId }
  }

  return { success: true as const, duplicate: false, messageId: inboundUpdate.messageId, eventId: inboundUpdate.eventId }
}

export async function supportExternalInboundRoute(request: Request): Promise<Response> {
  const expectedToken = process.env.SUPPORT_EXTERNAL_BRIDGE_TOKEN
  const authorUsuarioId = process.env.SUPPORT_EXTERNAL_BRIDGE_AUTHOR_USUARIO_ID

  if (!expectedToken || !authorUsuarioId) {
    return jsonResponse({ error: 'External support bridge is not configured' }, 503)
  }

  if (!verifyExternalBridgeAuthorization(request.headers.get('authorization'), expectedToken)) {
    return jsonResponse({ error: 'Unauthorized external support update' }, 401)
  }

  const body = await readJson(request)
  if (!body.success) {
    return jsonResponse({ error: 'Malformed external support update' }, 400)
  }

  const supabase = createSupabaseAdminClient()
  const result = await processExternalBridgeInboundUpdate({
    authorizationHeader: request.headers.get('authorization'),
    expectedToken,
    authorUsuarioId,
    body: body.data,
    persistInboundUpdate: (input) => recordSupportExternalInboundUpdate(supabase, input),
  })

  if (!result.success) {
    return jsonResponse({ error: result.error }, result.status)
  }

  return jsonResponse(result)
}

async function readJson(request: Request) {
  try {
    return { success: true as const, data: await request.json() }
  } catch {
    return { success: false as const }
  }
}

async function recordSupportExternalInboundUpdate(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: InsertAuditEventInput
): Promise<PersistInboundUpdateResult> {
  const { data, error } = await supabase
    .rpc('record_support_external_inbound_update', {
      p_ticket_id: input.ticketId,
      p_author_usuario_id: input.actorUsuarioId,
      p_message_body: input.body,
      p_idempotency_key: input.idempotencyKey,
    })

  if (error || !data) throw new Error('External support update persistence failed')

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.event_id) throw new Error('External support update persistence failed')

  return {
    duplicate: Boolean(row.duplicate),
    eventId: row.event_id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function toBridgeUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) return path
  return new URL(path, baseUrl).toString()
}
