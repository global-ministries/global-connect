import { SUPPORT_HERMES_EVENTS } from '@/lib/support/hermes'
import { inngest } from '@/lib/support/inngest-client'
import { SUPPORT_INNGEST_EVENTS } from '@/lib/support/inngest'

const supportTicketCreatedFoundation = inngest.createFunction(
  { id: 'support-ticket-created-foundation', triggers: { event: SUPPORT_INNGEST_EVENTS.ticketCreated } },
  async ({ event, step }) => {
    return step.run('record safe dual-mode ticket event', () => ({
      accepted: true,
      eventId: event.data.eventId,
      ticketId: event.data.ticketId,
    }))
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
