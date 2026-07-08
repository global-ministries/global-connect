import { transition as transitionStateMachine } from './state-machine'
import {
  applyGrantsForTransition,
  type GrantsDecision,
  type PausedGrantsSnapshot,
} from './grants'
import { createPlatformGrantAudit } from '@/lib/platform/grants'
import type { DreamTeamError } from './errors'
import type {
  DreamTeamEstado,
  DreamTeamMotivo,
  DreamTeamParticipationEventType,
  DreamTeamServicio,
} from './types'
import type { DreamTeamParticipationEventWriter } from './repository'

export interface TransitionWithGrantsInput {
  readonly servicio: DreamTeamServicio
  readonly estadoNuevo: DreamTeamEstado
  readonly motivo: DreamTeamMotivo
  readonly detalleMotivo?: string
  readonly actorPersonaId: string
  readonly fecha: string
  readonly audit: ReturnType<typeof createPlatformGrantAudit>
  readonly equipo?: { id: string; experiencia: string }
  readonly rol?: { id: string; label: string }
  readonly previousSnapshot?: PausedGrantsSnapshot
  readonly participationWriter?: DreamTeamParticipationEventWriter
}

export type TransitionParticipationEvent = {
  readonly tipo: DreamTeamParticipationEventType
  readonly payload: Readonly<Record<string, unknown>>
}

export type TransitionWithGrantsResult =
  | {
      readonly ok: true
      readonly servicioNuevo: DreamTeamServicio
      readonly grantsDecision: GrantsDecision
      readonly pausedGrantsSnapshot?: PausedGrantsSnapshot
      readonly participationEvents: readonly TransitionParticipationEvent[]
    }
  | { readonly ok: false; readonly error: DreamTeamError }

export async function transitionWithGrants(
  input: TransitionWithGrantsInput,
): Promise<TransitionWithGrantsResult> {
  const result = transitionStateMachine({
    servicio: input.servicio,
    estadoNuevo: input.estadoNuevo,
    motivo: input.motivo,
    detalleMotivo: input.detalleMotivo,
    fecha: input.fecha,
  })

  if (!result.ok) return result

  const grantsDecision = applyGrantsForTransition(
    {
      servicio: input.servicio,
      estadoAnterior: input.servicio.estado,
      estadoNuevo: input.estadoNuevo,
      motivo: input.motivo,
      actorPersonaId: input.actorPersonaId,
      fecha: input.fecha,
      previousSnapshot: input.previousSnapshot,
      equipo: input.equipo,
      rol: input.rol,
    },
    input.audit,
  )

  const pausedGrantsSnapshot =
    grantsDecision.action === 'revoke' && grantsDecision.snapshot
      ? grantsDecision.snapshot
      : undefined

  const participationEvents = buildParticipationEvents(input, grantsDecision)

  if (input.participationWriter) {
    for (const event of participationEvents) {
      await input.participationWriter.append({
        personaId: input.servicio.personaId,
        servicioId: input.servicio.id,
        tipoEvento: event.tipo,
        payload: event.payload,
        fecha: input.fecha,
      })
    }
  }

  return {
    ok: true,
    servicioNuevo: result.servicioNuevo,
    grantsDecision,
    participationEvents,
    ...(pausedGrantsSnapshot ? { pausedGrantsSnapshot } : {}),
  }
}

function buildParticipationEvents(
  input: Pick<
    TransitionWithGrantsInput,
    'servicio' | 'estadoNuevo' | 'motivo'
  >,
  grantsDecision: GrantsDecision,
): readonly TransitionParticipationEvent[] {
  const events: TransitionParticipationEvent[] = []

  if (grantsDecision.action === 'grant' && input.servicio.estado !== 'activo') {
    events.push({
      tipo: 'service_state_changed',
      payload: { from: input.servicio.estado, to: input.estadoNuevo, motivo: input.motivo },
    })
  } else if (grantsDecision.action === 'revoke' && input.estadoNuevo === 'en_pausa') {
    events.push({
      tipo: 'service_state_changed',
      payload: {
        from: input.servicio.estado,
        to: 'en_pausa',
        motivo: input.motivo,
        snapshot_id: grantsDecision.snapshot?.pausedAt,
      },
    })
  } else if (grantsDecision.action === 'restore') {
    events.push({
      tipo: 'service_reactivated',
      payload: { from: 'en_pausa', to: 'activo', motivo: input.motivo },
    })
  } else if (grantsDecision.action === 'revoke' && input.estadoNuevo === 'retirado') {
    events.push({
      tipo: 'service_retired',
      payload: { from: input.servicio.estado, to: 'retirado', motivo: input.motivo },
    })
  }

  return events
}
