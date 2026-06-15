type SupportEventOutboxClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{ data?: SupportEventOutboxClaimedRow[] | null; error?: SupportEventOutboxError | null }>
  from: (table: string) => {
    upsert: (
      values: SupportEventOutboxRow,
      options: { onConflict: 'event_key'; ignoreDuplicates: true },
    ) => Promise<{ error?: SupportEventOutboxError | null }>
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error?: SupportEventOutboxError | null }>
    }
  }
}

type SupportEventOutboxError = {
  code?: string
  message?: string
}

type SupportEventOutboxRow = {
  ticket_id: string
  event_type: string
  event_key: string
  payload: unknown
}

type SupportEventOutboxClaimedRow = SupportEventOutboxRow & {
  id: string
  attempts: number
}

type SupportEventOutboxDispatchEvent = {
  id: string
  name: 'support/ticket.created' | 'support/ticket.message.created' | 'support/ticket.status.changed'
  data: {
    eventId: string
    ticketId: string
    actorUserId?: string
    messageId?: string
  }
}

type SupportEventOutboxDispatchResult =
  | { success: true; skipped?: boolean; reason?: string; status?: number }
  | { success: false; error?: unknown; status?: number }

type DrainSupportEventOutboxOptions = {
  limit?: number
  now?: Date
  dispatch?: (event: SupportEventOutboxDispatchEvent) => Promise<SupportEventOutboxDispatchResult>
}

const ALLOWED_SUPPORT_OUTBOX_EVENT_TYPES = new Set<SupportEventOutboxDispatchEvent['name']>([
  'support/ticket.created',
  'support/ticket.message.created',
  'support/ticket.status.changed',
])

const DEFAULT_DRAIN_LIMIT = 10
const MAX_DRAIN_LIMIT = 50
const MAX_LAST_ERROR_LENGTH = 500

export type EnqueueSupportEventOutboxInput = {
  ticketId: string
  eventType: string
  eventKey: string
  payload: unknown
}

export async function enqueueSupportEventOutbox(
  supabase: SupportEventOutboxClient,
  input: EnqueueSupportEventOutboxInput,
) {
  const { error } = await supabase
    .from('support_event_outbox')
    .upsert(
      {
        ticket_id: input.ticketId,
        event_type: input.eventType,
        event_key: input.eventKey,
        payload: input.payload,
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    )

  if (!error || error.code === '23505') return { success: true as const }
  return { success: false as const, error }
}

export async function drainSupportEventOutbox(
  supabase: SupportEventOutboxClient,
  options: DrainSupportEventOutboxOptions = {},
) {
  const limit = clampDrainLimit(options.limit)
  const now = options.now ?? new Date()
  const dispatch = options.dispatch ?? defaultDispatchSupportOutboxEvent
  const { data, error } = await supabase.rpc('claim_support_event_outbox_batch', { p_limit: limit })

  if (error) return { success: false as const, error, claimed: 0, dispatched: 0, failed: 0 }

  const rows = data ?? []
  let dispatched = 0
  let failed = 0

  for (const row of rows) {
    if (!isSupportedSupportOutboxEventType(row.event_type)) {
      failed += 1
      await markSupportOutboxFailed(supabase, row, `Unsupported support outbox event type: ${row.event_type}`, now)
      continue
    }

    const event = toSupportOutboxDispatchEvent(row)
    if (!event.success) {
      failed += 1
      await markSupportOutboxRetry(supabase, row, event.error, now)
      continue
    }

    const result = await dispatch(event.event)
    if (result.success) {
      dispatched += 1
      await markSupportOutboxDispatched(supabase, row.id)
      continue
    }

    failed += 1
    await markSupportOutboxRetry(supabase, row, dispatchErrorMessage(result), now)
  }

  return { success: true as const, claimed: rows.length, dispatched, failed }
}

function toSupportOutboxDispatchEvent(row: SupportEventOutboxClaimedRow) {
  const name = row.event_type as SupportEventOutboxDispatchEvent['name']

  if (!row.payload || typeof row.payload !== 'object') {
    return { success: false as const, error: 'Invalid support outbox payload' }
  }

  const payload = row.payload as Record<string, unknown>
  const eventId = readString(payload.eventId)
  const ticketId = readString(payload.ticketId)
  if (!eventId || !ticketId) return { success: false as const, error: 'Invalid support outbox payload ids' }

  if (row.event_type === 'support/ticket.message.created') {
    const messageId = readString(payload.messageId)
    if (!messageId) return { success: false as const, error: 'Invalid support outbox message payload' }
    return { success: true as const, event: { id: row.event_key, name, data: { eventId, ticketId, messageId, actorUserId: readString(payload.actorUserId) } } }
  }

  return { success: true as const, event: { id: row.event_key, name, data: { eventId, ticketId, actorUserId: readString(payload.actorUserId) } } }
}

async function defaultDispatchSupportOutboxEvent(event: SupportEventOutboxDispatchEvent) {
  const {
    dispatchSupportInngestEvent,
    createSupportTicketCreatedEvent,
    createSupportTicketMessageCreatedEvent,
    createSupportTicketStatusChangedEvent,
  } = await import('@/lib/support/inngest')

  if (event.name === 'support/ticket.message.created') {
    return dispatchSupportInngestEvent(createSupportTicketMessageCreatedEvent({
      eventId: event.data.eventId,
      ticketId: event.data.ticketId,
      messageId: event.data.messageId ?? '',
      actorUserId: event.data.actorUserId,
    }))
  }

  if (event.name === 'support/ticket.status.changed') {
    return dispatchSupportInngestEvent(createSupportTicketStatusChangedEvent(event.data))
  }

  return dispatchSupportInngestEvent(createSupportTicketCreatedEvent(event.data))
}

async function markSupportOutboxDispatched(supabase: SupportEventOutboxClient, id: string) {
  await supabase.from('support_event_outbox').update({
    status: 'dispatched',
    last_error: null,
    locked_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

async function markSupportOutboxRetry(
  supabase: SupportEventOutboxClient,
  row: SupportEventOutboxClaimedRow,
  error: unknown,
  now: Date,
) {
  const attempts = row.attempts + 1
  await supabase.from('support_event_outbox').update({
    status: 'pending',
    attempts,
    last_error: safeLastError(error),
    available_at: backoffAvailableAt(now, attempts).toISOString(),
    locked_at: null,
    updated_at: now.toISOString(),
  }).eq('id', row.id)
}

async function markSupportOutboxFailed(
  supabase: SupportEventOutboxClient,
  row: SupportEventOutboxClaimedRow,
  error: unknown,
  now: Date,
) {
  await supabase.from('support_event_outbox').update({
    status: 'failed',
    attempts: row.attempts + 1,
    last_error: safeLastError(error),
    locked_at: null,
    updated_at: now.toISOString(),
  }).eq('id', row.id)
}

function isSupportedSupportOutboxEventType(eventType: string): eventType is SupportEventOutboxDispatchEvent['name'] {
  return ALLOWED_SUPPORT_OUTBOX_EVENT_TYPES.has(eventType as SupportEventOutboxDispatchEvent['name'])
}

function clampDrainLimit(limit = DEFAULT_DRAIN_LIMIT) {
  if (!Number.isFinite(limit)) return DEFAULT_DRAIN_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_DRAIN_LIMIT)
}

function backoffAvailableAt(now: Date, attempts: number) {
  const seconds = Math.min(300, 2 ** Math.min(attempts, 8))
  return new Date(now.getTime() + seconds * 1000)
}

function dispatchErrorMessage(result: Extract<SupportEventOutboxDispatchResult, { success: false }>) {
  if (result.error) return result.error
  if (result.status) return `Support event dispatch failed with status ${result.status}`
  return 'Support event dispatch failed'
}

function safeLastError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Support event dispatch failed'

  return message.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_LAST_ERROR_LENGTH)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
