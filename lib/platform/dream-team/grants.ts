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

// Keys are pre-normalized with normalizeLabel so lookups below stay a plain object read.
// SQL mirror: public.dream_team_grants_de_servicio (the volunteer loader cannot call
// TypeScript). Both sides are pinned to the grants-table of
// supabase/tests/dream-team-cargar-voluntarios.test.sql (see grants-sql-mirror.test.ts),
// so a change here needs that table and a new migration for the mirror.
const ROLE_TO_GENERIC_CAPABILITIES: Record<string, readonly string[]> = {
  [normalizeLabel('Voluntario')]: ['dream_team.serve'],
  [normalizeLabel('Voluntario de Cámara')]: ['dream_team.serve'],
  [normalizeLabel('Líder')]: ['dream_team.serve', 'dream_team.lead'],
  [normalizeLabel('Líder de grupo')]: ['dream_team.serve', 'dream_team.lead', 'dream_team.gdv.lead'],
  [normalizeLabel('Facilitador')]: ['dream_team.serve', 'dream_team.lead'],
  // Entrenador (the Waumba Land trainer, formerly "mentor") gets exactly what Líder gets.
  [normalizeLabel('Entrenador')]: ['dream_team.serve', 'dream_team.lead'],
  [normalizeLabel('Coordinador')]: ['dream_team.serve', 'dream_team.coordinate'],
  // Director mints the equipo-scoped dream_team.direct (area director), NOT the global
  // dream_team.director.coordinate. That capability is declared with scopeType 'experience', so
  // scopeIdForGrant() always returns undefined for it — a grant with scope_id = NULL means GLOBAL
  // scope to auth_has_dream_team_capability_in_tree. Assigning it through this flow gave every area
  // director authority over the whole church. dream_team.director.coordinate now stays a global
  // capability granted by hand only, for the actual person in charge of Dream Team as a whole.
  [normalizeLabel('Director')]: ['dream_team.serve', 'dream_team.direct'],
}

// The normalized role labels that mint generic capabilities. Exported so the
// pin test can require every one of them in the table the SQL mirror is checked against.
export function mappedRoleLabels(): readonly string[] {
  return Object.keys(ROLE_TO_GENERIC_CAPABILITIES)
}

// ── Experience-specific capability (hybrid model) ────────────────────

// The role labels that pick the lead or the director tier below; any other label serves.
const LEAD_ROLE_LABELS: ReadonlySet<string> = new Set(
  ['Líder', 'Líder de grupo', 'Facilitador', 'Entrenador', 'Coordinador'].map(normalizeLabel),
)
const DIRECTOR_ROLE_LABELS: ReadonlySet<string> = new Set(['Director'].map(normalizeLabel))

interface ExperienceSpecificTiers {
  readonly serve: string
  readonly lead: string
  readonly director: string
}

function sameForEveryTier(capabilityKey: string): ExperienceSpecificTiers {
  return { serve: capabilityKey, lead: capabilityKey, director: capabilityKey }
}

// The capability an equipo's experiencia adds on top of the generic ones, per tier. An
// experiencia missing here adds none. Same SQL mirror and pin as ROLE_TO_GENERIC_CAPABILITIES:
// a change here needs the grants-table and a new migration for dream_team_grants_de_servicio.
const EXPERIENCE_SPECIFIC_CAPABILITIES: Record<string, ExperienceSpecificTiers> = {
  dps: { serve: 'dps.team.serve', lead: 'dps.team.lead', director: 'dps.team.director' },
  estudiantes: {
    serve: 'estudiantes.team.serve',
    lead: 'estudiantes.team.lead',
    director: 'estudiantes.team.lead',
  },
  talleres_crecimiento: sameForEveryTier('talleres_crecimiento.team.serve'),
  ninos: sameForEveryTier('ninos.team.serve'),
  the_living_room: sameForEveryTier('the_living_room.team.serve'),
}

// The experiencias with a capability of their own, and the normalized labels that pick a
// tier. Exported so the pin test can require every such pair in the grants-table.
export function experiencesWithSpecificCapability(): readonly string[] {
  return Object.keys(EXPERIENCE_SPECIFIC_CAPABILITIES)
}

export function leadOrDirectorRoleLabels(): readonly string[] {
  return [...LEAD_ROLE_LABELS, ...DIRECTOR_ROLE_LABELS]
}

// ── Helpers ──────────────────────────────────────────────────────────

// Case- and diacritic-insensitive: the talleres_role_capability_map SQL trigger seeds
// roles as lowercase, no-diacritic labels ('coordinador', 'director'), while role labels
// shown in the UI are capitalized and accented ('Coordinador', 'Director'). Both must
// resolve to the same generic/experience-specific capabilities.
function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  if (!Object.prototype.hasOwnProperty.call(EXPERIENCE_SPECIFIC_CAPABILITIES, experience)) {
    return undefined
  }
  const tiers = EXPERIENCE_SPECIFIC_CAPABILITIES[experience]
  const label = normalizeLabel(roleLabel)
  if (DIRECTOR_ROLE_LABELS.has(label)) return tiers.director
  if (LEAD_ROLE_LABELS.has(label)) return tiers.lead
  return tiers.serve
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
