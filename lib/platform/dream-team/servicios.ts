import { transition as transitionStateMachine } from './state-machine'
import {
  applyGrantsForTransition,
  serializePausedGrantsSnapshot,
  type DreamTeamServiceGrant,
  type GrantsDecision,
  type GrantsTransitionContext,
  type PausedGrantsSnapshot,
} from './grants'
import { createPlatformGrantAudit, type PlatformGrantAuditEvent } from '@/lib/platform/grants'
import type { DreamTeamError } from './errors'
import type { DreamTeamEstado, DreamTeamMotivo, DreamTeamServicio } from './types'

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
}

export type TransitionWithGrantsResult =
  | {
      readonly ok: true
      readonly servicioNuevo: DreamTeamServicio
      readonly grantsDecision: GrantsDecision
      readonly pausedGrantsSnapshot?: PausedGrantsSnapshot
    }
  | { readonly ok: false; readonly error: DreamTeamError }

export function transitionWithGrants(input: TransitionWithGrantsInput): TransitionWithGrantsResult {
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

  return {
    ok: true,
    servicioNuevo: result.servicioNuevo,
    grantsDecision,
    ...(pausedGrantsSnapshot ? { pausedGrantsSnapshot } : {}),
  }
}
