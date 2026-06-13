import {
  createExternalEscalationPayload,
  type ExternalEscalationInput,
  type ExternalEscalationPayload,
} from '@/lib/support/external-bridge'
import type { SupportInngestEvent } from '@/lib/support/inngest'

export const SUPPORT_HERMES_EVENTS = {
  escalationRequested: 'support/hermes.escalation.requested',
} as const

export const SUPPORT_HERMES_TICKET_CREATED_EVENT_TYPE = 'ticket.created'

const DEFAULT_HERMES_TIMEOUT_MS = 5000
const MAX_HERMES_TIMEOUT_MS = 30000
const SUPPORT_EVENT_ID_PATTERN = /^[A-Za-z0-9._-]+$/

export type SupportHermesEscalationRequestedEvent = {
  name: typeof SUPPORT_HERMES_EVENTS.escalationRequested
  id: string
  data: {
    eventId: string
    ticketId: string
    escalation: ExternalEscalationPayload
  }
}

export type HermesDispatchMode = 'dry-run' | 'disabled' | 'live'

export type HermesTicketCreatedPayload = {
  event_type: typeof SUPPORT_HERMES_TICKET_CREATED_EVENT_TYPE
  delivery_id: string
  ticket: {
    id: string
    internalUrl: string
  }
  source: {
    system: 'global-connect'
    environment: 'preview' | 'production' | 'development' | 'test'
  }
}

type CreateHermesEscalationRequestedEventInput = ExternalEscalationInput & {
  eventId: string
}

type DispatchHermesEscalationOptions = {
  mode?: HermesDispatchMode
}

type DispatchHermesTicketCreatedOptions = {
  mode?: HermesDispatchMode
  webhookUrl?: string
  webhookSecret?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export function createHermesEscalationRequestedEvent(input: CreateHermesEscalationRequestedEventInput): SupportHermesEscalationRequestedEvent {
  return {
    name: SUPPORT_HERMES_EVENTS.escalationRequested,
    id: `support:${input.eventId}`,
    data: {
      eventId: input.eventId,
      ticketId: input.ticketId,
      escalation: createExternalEscalationPayload(input),
    },
  }
}

export async function dispatchHermesEscalationRequest(
  event: SupportHermesEscalationRequestedEvent,
  options: DispatchHermesEscalationOptions = {}
) {
  const mode = options.mode ?? readHermesDispatchMode()

  if (mode === 'disabled') {
    return { success: true as const, skipped: true as const, reason: 'Hermes escalation dispatch disabled' }
  }

  return {
    success: true as const,
    skipped: true as const,
    dryRun: true as const,
    eventId: event.data.eventId,
    reason: 'Hermes live outbound dispatch is deferred',
  }
}

export async function dispatchHermesTicketCreated(
  event: SupportInngestEvent<'support/ticket.created', { eventId: string; ticketId: string; actorUserId?: string }>,
  options: DispatchHermesTicketCreatedOptions = {}
) {
  const mode = options.mode ?? readHermesDispatchMode()

  if (mode === 'disabled') {
    return { success: true as const, skipped: true as const, reason: 'Hermes ticket dispatch disabled' }
  }

  const payload = createHermesTicketCreatedPayload(event)

  if (mode === 'dry-run') {
    return {
      success: true as const,
      skipped: true as const,
      dryRun: true as const,
      eventId: event.data.eventId,
      deliveryId: payload.delivery_id,
      reason: 'Hermes ticket dispatch dry-run',
    }
  }

  const webhookUrl = options.webhookUrl ?? process.env.SUPPORT_HERMES_WEBHOOK_URL
  const webhookSecret = options.webhookSecret ?? process.env.SUPPORT_HERMES_WEBHOOK_SECRET

  if (!webhookUrl || !webhookSecret) {
    throw new Error('Hermes live dispatch is missing SUPPORT_HERMES_WEBHOOK_URL or SUPPORT_HERMES_WEBHOOK_SECRET')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), resolveHermesTimeoutMs(options.timeoutMs))

  try {
    const response = await (options.fetch ?? fetch)(webhookUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${webhookSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Hermes ticket dispatch failed with status ${response.status}`)
    }

    return { success: true as const, status: response.status, deliveryId: payload.delivery_id }
  } finally {
    clearTimeout(timeout)
  }
}

export function createHermesTicketCreatedPayload(
  event: SupportInngestEvent<'support/ticket.created', { eventId: string; ticketId: string; actorUserId?: string }>
): HermesTicketCreatedPayload {
  const eventId = assertSupportEventId(event.data.eventId, 'eventId')
  const ticketId = assertSupportEventId(event.data.ticketId, 'ticketId')

  return {
    event_type: SUPPORT_HERMES_TICKET_CREATED_EVENT_TYPE,
    delivery_id: `global-connect:${eventId}`,
    ticket: {
      id: ticketId,
      internalUrl: createInternalTicketUrl(ticketId),
    },
    source: {
      system: 'global-connect',
      environment: resolveHermesSourceEnvironment(),
    },
  }
}

function readHermesDispatchMode(): HermesDispatchMode {
  if (process.env.SUPPORT_HERMES_DISPATCH_MODE === 'disabled') return 'disabled'
  if (process.env.SUPPORT_HERMES_DISPATCH_MODE === 'live') return 'live'
  return 'dry-run'
}

function assertSupportEventId(value: string, fieldName: 'eventId' | 'ticketId') {
  const trimmed = value.trim()
  if (!trimmed || !SUPPORT_EVENT_ID_PATTERN.test(trimmed)) {
    throw new Error(`Hermes ticket dispatch requires a valid ${fieldName}`)
  }
  return trimmed
}

function createInternalTicketUrl(ticketId: string) {
  const path = `/ayuda/tickets/${encodeURIComponent(ticketId)}`
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!baseUrl) return path
  return new URL(path, baseUrl).toString()
}

function resolveHermesSourceEnvironment(): HermesTicketCreatedPayload['source']['environment'] {
  if (process.env.NODE_ENV === 'test') return 'test'
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') return 'production'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  return 'development'
}

function resolveHermesTimeoutMs(timeoutMs: number | undefined) {
  const rawTimeout = timeoutMs ?? (Number(process.env.SUPPORT_HERMES_TIMEOUT_MS) || DEFAULT_HERMES_TIMEOUT_MS)
  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) return DEFAULT_HERMES_TIMEOUT_MS
  return Math.min(rawTimeout, MAX_HERMES_TIMEOUT_MS)
}
