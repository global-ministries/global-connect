import {
  createExternalEscalationPayload,
  type ExternalEscalationInput,
  type ExternalEscalationPayload,
} from '@/lib/support/external-bridge'

export const SUPPORT_HERMES_EVENTS = {
  escalationRequested: 'support/hermes.escalation.requested',
} as const

export type SupportHermesEscalationRequestedEvent = {
  name: typeof SUPPORT_HERMES_EVENTS.escalationRequested
  id: string
  data: {
    eventId: string
    ticketId: string
    escalation: ExternalEscalationPayload
  }
}

export type HermesDispatchMode = 'dry-run' | 'disabled'

type CreateHermesEscalationRequestedEventInput = ExternalEscalationInput & {
  eventId: string
}

type DispatchHermesEscalationOptions = {
  mode?: HermesDispatchMode
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

function readHermesDispatchMode(): HermesDispatchMode {
  return process.env.SUPPORT_HERMES_DISPATCH_MODE === 'disabled' ? 'disabled' : 'dry-run'
}
