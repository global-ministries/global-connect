import { PLATFORM_CAPABILITIES } from '@/lib/platform/experiences'
import type { PlatformScopeType } from '@/lib/platform/experiences'
import type { PlatformGrantAuditEvent } from '@/lib/platform/grants'
import { NIVELES_ROL, nivelDesdeLabel, normalizeLabel } from '@/lib/platform/dream-team/nivel-rol'
import type {
  DreamTeamEstado,
  DreamTeamMotivo,
  DreamTeamNivelRol,
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
  readonly rol?: GrantsRol
}

// The rol a servicio holds. nivel decides its grants; a caller that does not
// know it (older code) gets the level of the label, never more (T6, S6.5).
export interface GrantsRol {
  readonly id: string
  readonly label: string
  readonly nivel?: DreamTeamNivelRol
}

// ── Nivel → generic capability mapping (hybrid model) ───────────────

// SQL mirror: public.dream_team_grants_de_servicio (the volunteer loader cannot call
// TypeScript). Both sides are pinned to the grants-table of
// supabase/tests/dream-team-grants-por-nivel.test.sql (see grants-sql-mirror.test.ts),
// so a change here needs that table and a new migration for the mirror.
const NIVEL_TO_GENERIC_CAPABILITIES: Record<DreamTeamNivelRol, readonly string[]> = {
  voluntario: ['dream_team.serve'],
  lider: ['dream_team.serve', 'dream_team.lead'],
  coordinador: ['dream_team.serve', 'dream_team.coordinate'],
  // Director mints the equipo-scoped dream_team.direct (area director), NOT the global
  // dream_team.director.coordinate. That capability is declared with scopeType 'experience', so
  // scopeIdForGrant() always returns undefined for it — a grant with scope_id = NULL means GLOBAL
  // scope to auth_has_dream_team_capability_in_tree. Assigning it through this flow gave every area
  // director authority over the whole church. dream_team.director.coordinate now stays a global
  // capability granted by hand only, for the actual person in charge of Dream Team as a whole.
  director: ['dream_team.serve', 'dream_team.direct'],
}

// The one grant still decided by the label: a "Líder de grupo" also leads its group of
// grupos_vida, scoped to the rol. No nivel mints it (T6, S6.3).
const LIDER_DE_GRUPO_LABEL = normalizeLabel('Líder de grupo')
const LIDER_DE_GRUPO_CAPABILITY = 'dream_team.gdv.lead'

// ── Experience-specific capability (hybrid model) ────────────────────

interface ExperienceSpecificTiers {
  readonly serve: string
  readonly lead: string
  readonly director: string
}

function sameForEveryTier(capabilityKey: string): ExperienceSpecificTiers {
  return { serve: capabilityKey, lead: capabilityKey, director: capabilityKey }
}

// The capability an equipo's experiencia adds on top of the generic ones, per tier. An
// experiencia missing here adds none. Same SQL mirror and pin as NIVEL_TO_GENERIC_CAPABILITIES:
// a change here needs the grants-table and a new migration for dream_team_grants_de_servicio.
const EXPERIENCE_SPECIFIC_CAPABILITIES: Record<string, ExperienceSpecificTiers> = {
  dps: { serve: 'dps.team.serve', lead: 'dps.team.lead', director: 'dps.team.director' },
  global_music: {
    serve: 'global_music.team.serve',
    lead: 'global_music.team.lead',
    director: 'global_music.team.director',
  },
  estudiantes: {
    serve: 'estudiantes.team.serve',
    lead: 'estudiantes.team.lead',
    director: 'estudiantes.team.lead',
  },
  talleres_crecimiento: sameForEveryTier('talleres_crecimiento.team.serve'),
  ninos: sameForEveryTier('ninos.team.serve'),
  the_living_room: sameForEveryTier('the_living_room.team.serve'),
}

// The tier each nivel picks: lider and coordinador lead, director directs (T6, S6.2).
const TIER_BY_NIVEL: Record<DreamTeamNivelRol, keyof ExperienceSpecificTiers> = {
  voluntario: 'serve',
  lider: 'lead',
  coordinador: 'lead',
  director: 'director',
}

// The experiencias with a capability of their own. Exported so the pin test can require
// every nivel under each of them in the grants-table.
export function experiencesWithSpecificCapability(): readonly string[] {
  return Object.keys(EXPERIENCE_SPECIFIC_CAPABILITIES)
}

// ── Helpers ──────────────────────────────────────────────────────────

function capabilityDefinition(key: string) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, key)
    ? PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
    : undefined
}

function resolveExperienceSpecificCapability(
  experience: string,
  nivel: DreamTeamNivelRol,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(EXPERIENCE_SPECIFIC_CAPABILITIES, experience)) {
    return undefined
  }
  return EXPERIENCE_SPECIFIC_CAPABILITIES[experience][TIER_BY_NIVEL[nivel]]
}

function capabilityKeysForRol(experience: string, rol: GrantsRol): readonly string[] {
  const nivel = rol.nivel ?? nivelDesdeLabel(rol.label)
  const labelKeys = normalizeLabel(rol.label) === LIDER_DE_GRUPO_LABEL ? [LIDER_DE_GRUPO_CAPABILITY] : []
  const specificKey = resolveExperienceSpecificCapability(experience, nivel)
  return [...NIVEL_TO_GENERIC_CAPABILITIES[nivel], ...labelKeys, ...(specificKey ? [specificKey] : [])]
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
  rol: GrantsRol,
): readonly DreamTeamServiceGrant[] {
  return capabilityKeysForRol(equipo.experiencia, rol).flatMap((key) => buildGrant(key, equipo, rol) ?? [])
}

// Everything any nivel could have minted for this equipo and rol, current nivel first (T6, S6.7).
// A retire or a pause revokes this set: the rol's nivel may have changed since activation, and
// revoking only what the current nivel mints would leave alive what an earlier nivel minted.
// Each key keeps the scope buildGrantsForServicio gives it, so the revoke matches the stored rows;
// revoking a key that was never granted touches no row.
export function buildRevocableGrantsForServicio(
  equipo: { id: string; experiencia: string },
  rol: GrantsRol,
): readonly DreamTeamServiceGrant[] {
  const everyNivel = NIVELES_ROL.flatMap(({ nivel }) => buildGrantsForServicio(equipo, { ...rol, nivel }))
  return uniqueByCapabilityKey([...buildGrantsForServicio(equipo, rol), ...everyNivel])
}

function uniqueByCapabilityKey(grants: readonly DreamTeamServiceGrant[]): readonly DreamTeamServiceGrant[] {
  const byKey = new Map<string, DreamTeamServiceGrant>()
  for (const grant of grants) {
    if (!byKey.has(grant.capabilityKey)) byKey.set(grant.capabilityKey, grant)
  }
  return [...byKey.values()]
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

    const grants = buildRevocableGrantsForServicio(equipo, rol)
    const auditEvents = emitAuditEvents(grants, 'revoke', ctx, audit)

    if (isPausing) {
      // The snapshot is what a resume grants back, so it holds only the current nivel's grants.
      const snapshot = serializePausedGrantsSnapshot(
        ctx.servicio.id,
        ctx.servicio.personaId,
        buildGrantsForServicio(equipo, rol),
        ctx.fecha,
      )
      return { action: 'revoke', grants, snapshot, auditEvents }
    }

    return { action: 'revoke', grants, auditEvents }
  }

  return { action: 'noop', reason: 'not_a_grant_relevant_transition' }
}
