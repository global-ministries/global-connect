import { PLATFORM_CAPABILITIES } from '@/lib/platform/experiences'
import type { PlatformScopeType } from '@/lib/platform/experiences'
import type { PlatformGrantAuditEvent } from '@/lib/platform/grants'
import type {
  DreamTeamEstado,
  DreamTeamMotivo,
  DreamTeamServicio,
} from '@/lib/platform/dream-team/types'

// ── Grants derived from a service assignment ─────────────────────────

export interface DreamTeamServiceGrant {
  readonly capabilityKey: string
  readonly experience: string
  readonly scopeType: PlatformScopeType
  readonly scopeId?: string
}

export interface PausedGrantsSnapshot {
  readonly servicioId: string
  readonly personaId: string
  readonly grants: readonly DreamTeamServiceGrant[]
  readonly pausedAt: string
}

export type GrantsDecision =
  | {
      readonly action: 'grant'
      readonly grants: readonly DreamTeamServiceGrant[]
      readonly auditEvents: readonly PlatformGrantAuditEvent[]
    }
  | {
      readonly action: 'revoke'
      readonly grants: readonly DreamTeamServiceGrant[]
      readonly snapshot?: PausedGrantsSnapshot
      readonly auditEvents: readonly PlatformGrantAuditEvent[]
    }
  | {
      readonly action: 'restore'
      readonly grants: readonly DreamTeamServiceGrant[]
      readonly auditEvents: readonly PlatformGrantAuditEvent[]
    }
  | { readonly action: 'noop'; readonly reason: string }

export interface GrantsTransitionContext {
  readonly servicio: DreamTeamServicio
  readonly estadoAnterior: DreamTeamEstado
  readonly estadoNuevo: DreamTeamEstado
  readonly motivo: DreamTeamMotivo
  readonly actorPersonaId: string
  readonly fecha: string
  readonly previousSnapshot?: PausedGrantsSnapshot
  readonly equipo?: { id: string; experiencia: string }
  readonly rol?: { id: string; label: string }
}

// ── Role → generic capability mapping (hybrid model) ─────────────────

const ROLE_TO_GENERIC_CAPABILITIES: Record<string, readonly string[]> = {
  Voluntario: ['dream_team.serve'],
  'Voluntario de Cámara': ['dream_team.serve'],
  Líder: ['dream_team.serve', 'dream_team.lead'],
  'Líder de grupo': ['dream_team.serve', 'dream_team.lead', 'dream_team.gdv.lead'],
  Coordinador: ['dream_team.serve', 'dream_team.coordinate'],
  Director: ['dream_team.serve', 'dream_team.director.coordinate'],
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label.trim()
}

function capabilityDefinition(key: string) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, key)
    ? PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
    : undefined
}

function resolveExperienceSpecificCapability(
  experience: string,
  roleLabel: string,
): string | undefined {
  const label = normalizeLabel(roleLabel)
  const isLead =
    label === 'Líder' || label === 'Líder de grupo' || label === 'Coordinador'
  const isDirector = label === 'Director'

  switch (experience) {
    case 'dps':
      return isDirector ? 'dps.team.director' : isLead ? 'dps.team.lead' : 'dps.team.serve'
    case 'estudiantes':
      return isLead || isDirector ? 'estudiantes.team.lead' : 'estudiantes.team.serve'
    case 'talleres_crecimiento':
      return 'talleres_crecimiento.team.serve'
    case 'ninos':
      return 'ninos.team.serve'
    case 'the_living_room':
      return 'the_living_room.team.serve'
    default:
      return undefined
  }
}

function scopeIdForGrant(
  scopeType: PlatformScopeType,
  equipo: { id: string },
  rol: { id: string },
): string | undefined {
  if (scopeType === 'experience') return undefined
  if (scopeType === 'grupo') return rol.id
  return equipo.id
}

function buildGrant(
  capabilityKey: string,
  equipo: { id: string },
  rol: { id: string },
): DreamTeamServiceGrant | undefined {
  const definition = capabilityDefinition(capabilityKey)
  if (!definition) return undefined

  return {
    capabilityKey,
    experience: definition.experience,
    scopeType: definition.scopeType,
    scopeId: scopeIdForGrant(definition.scopeType, equipo, rol),
  }
}

export function buildGrantsForServicio(
  equipo: { id: string; experiencia: string },
  rol: { id: string; label: string },
): readonly DreamTeamServiceGrant[] {
  const grants: DreamTeamServiceGrant[] = []
  const genericKeys = ROLE_TO_GENERIC_CAPABILITIES[normalizeLabel(rol.label)] ?? []

  for (const key of genericKeys) {
    const grant = buildGrant(key, equipo, rol)
    if (grant) grants.push(grant)
  }

  const specificKey = resolveExperienceSpecificCapability(equipo.experiencia, rol.label)
  if (specificKey) {
    const grant = buildGrant(specificKey, equipo, rol)
    if (grant) grants.push(grant)
  }

  return grants
}

export function serializePausedGrantsSnapshot(
  servicioId: string,
  personaId: string,
  grants: readonly DreamTeamServiceGrant[],
  pausedAt: string,
): PausedGrantsSnapshot {
  return { servicioId, personaId, grants, pausedAt }
}

export function restoreFromSnapshot(
  snapshot: PausedGrantsSnapshot,
): readonly DreamTeamServiceGrant[] {
  return snapshot.grants
}

// ── Audit event factory ──────────────────────────────────────────────

function toAuditEvent(
  grant: DreamTeamServiceGrant,
  decision: 'grant' | 'revoke',
  ctx: Pick<GrantsTransitionContext, 'actorPersonaId' | 'motivo' | 'fecha'>,
): PlatformGrantAuditEvent {
  return {
    actorPersonaId: ctx.actorPersonaId,
    source: 'dream_team_servicio',
    decision,
    scope: {
      experience: grant.experience,
      scopeType: grant.scopeType,
      ...(grant.scopeId ? { scopeId: grant.scopeId } : {}),
    },
    ...(decision === 'revoke'
      ? {
          before: { active: true, capabilityKey: grant.capabilityKey },
          after: { active: false, capabilityKey: grant.capabilityKey },
        }
      : {
          after: { active: true, capabilityKey: grant.capabilityKey },
        }),
    reason: ctx.motivo,
    recordedAt: new Date(ctx.fecha),
  }
}

function emitAuditEvents(
  grants: readonly DreamTeamServiceGrant[],
  decision: 'grant' | 'revoke',
  ctx: Pick<GrantsTransitionContext, 'actorPersonaId' | 'motivo' | 'fecha'>,
  audit: { logger: { record(event: PlatformGrantAuditEvent): void } },
): readonly PlatformGrantAuditEvent[] {
  const events = grants.map((grant) => toAuditEvent(grant, decision, ctx))
  for (const event of events) {
    audit.logger.record(event)
  }
  return events
}

// ── Orchestrator decision ────────────────────────────────────────────

export function applyGrantsForTransition(
  ctx: GrantsTransitionContext,
  audit: { logger: { record(event: PlatformGrantAuditEvent): void } },
): GrantsDecision {
  const { estadoAnterior, estadoNuevo, equipo, rol, previousSnapshot } = ctx

  const isBecomingActive = estadoNuevo === 'activo' && estadoAnterior !== 'activo'
  const isPausing = estadoAnterior === 'activo' && estadoNuevo === 'en_pausa'
  const isRetiring = estadoNuevo === 'retirado' && estadoAnterior !== 'retirado'

  if (isBecomingActive) {
    if (estadoAnterior === 'en_pausa' && previousSnapshot) {
      const grants = restoreFromSnapshot(previousSnapshot)
      const auditEvents = emitAuditEvents(grants, 'grant', ctx, audit)
      return { action: 'restore', grants, auditEvents }
    }

    if (!equipo || !rol) {
      return {
        action: 'noop',
        reason: 'not_a_grant_relevant_transition',
      }
    }

    const grants = buildGrantsForServicio(equipo, rol)
    const auditEvents = emitAuditEvents(grants, 'grant', ctx, audit)
    return { action: 'grant', grants, auditEvents }
  }

  if (isPausing || isRetiring) {
    if (!equipo || !rol) {
      return {
        action: 'noop',
        reason: 'not_a_grant_relevant_transition',
      }
    }

    const grants = buildGrantsForServicio(equipo, rol)
    const auditEvents = emitAuditEvents(grants, 'revoke', ctx, audit)

    if (isPausing) {
      const snapshot = serializePausedGrantsSnapshot(
        ctx.servicio.id,
        ctx.servicio.personaId,
        grants,
        ctx.fecha,
      )
      return { action: 'revoke', grants, snapshot, auditEvents }
    }

    return { action: 'revoke', grants, auditEvents }
  }

  return { action: 'noop', reason: 'not_a_grant_relevant_transition' }
}
