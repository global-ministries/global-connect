import { SUPPORT_HERMES_EVENTS, dispatchHermesTicketCreated } from '@/lib/support/hermes'
import { inngest } from '@/lib/support/inngest-client'
import { SUPPORT_INNGEST_EVENTS } from '@/lib/support/inngest'

const SUPPORT_EVENT_ID_PATTERN = /^[A-Za-z0-9._-]+$/

const supportTicketCreatedFoundation = inngest.createFunction(
  { id: 'support-ticket-created-foundation', triggers: { event: SUPPORT_INNGEST_EVENTS.ticketCreated } },
  async ({ event, step }) => {
    const ticketEvent = normalizeTicketCreatedEvent(event.data)
    const hermes = await step.run('dispatch hermes ticket created', () => dispatchHermesTicketCreated(ticketEvent))

    return {
      accepted: true,
      eventId: ticketEvent.data.eventId,
      ticketId: ticketEvent.data.ticketId,
      hermes,
    }
  }
)

const supportHermesEscalationRequestedFoundation = inngest.createFunction(
  { id: 'support-hermes-escalation-requested-foundation', triggers: { event: SUPPORT_HERMES_EVENTS.escalationRequested } },
  async ({ event, step }) => {
    return step.run('record dry-run hermes escalation request', () => ({
      accepted: true,
      dryRun: true,
      eventId: event.data.eventId,
      ticketId: event.data.ticketId,
    }))
  }
)

export const supportInngestFunctions = [
  supportTicketCreatedFoundation,
  supportHermesEscalationRequestedFoundation,
]

function normalizeTicketCreatedEvent(data: Record<string, unknown>) {
  const eventId = normalizeSupportEventId(data.eventId, 'eventId')
  const ticketId = normalizeSupportEventId(data.ticketId, 'ticketId')
  const actorUserId = typeof data.actorUserId === 'string' ? data.actorUserId : undefined

  return {
    name: SUPPORT_INNGEST_EVENTS.ticketCreated,
    id: `support:${eventId}`,
    data: {
      eventId,
      ticketId,
      ...(actorUserId ? { actorUserId } : {}),
    },
  }
}

function normalizeSupportEventId(value: unknown, fieldName: 'eventId' | 'ticketId') {
  if (typeof value !== 'string') {
    throw new Error(`Support ticket.created event requires a valid ${fieldName}`)
  }

  const trimmed = value.trim()
  if (!trimmed || !SUPPORT_EVENT_ID_PATTERN.test(trimmed)) {
    throw new Error(`Support ticket.created event requires a valid ${fieldName}`)
  }

  return trimmed
}
