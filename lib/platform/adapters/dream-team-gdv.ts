import type { PlatformSession } from '@/lib/platform/session/types'
import { personaId, type PersonaId } from '@/lib/platform/dream-team/types'
import type {
  DreamTeamGdvMember,
  DreamTeamGdvMembershipReader,
} from '@/lib/platform/dream-team/repository'
import {
  normalizePlatformScopeId,
  resolvePlatformCapability,
  type PlatformScope,
  type PlatformCapabilityGrant,
} from '@/lib/platform/experiences'

const GDV_LEAD_CAPABILITY_KEY = 'dream_team.gdv.lead' as const
const GDV_LEAD_SOURCE = 'gdv:lider' as const
const GDV_ADAPTER_FLOW = 'gdv_adapter' as const

export interface DreamTeamGdvAdapterInput {
  readonly session: PlatformSession | null | undefined
  readonly reader: DreamTeamGdvMembershipReader
  /** Membership previa (cache del caller). Si no se provee, se considera "sin liderazgo previo" */
  readonly previousMemberships?: readonly DreamTeamGdvMember[]
}

export interface DreamTeamGdvAdapterContext {
  readonly personaId: PersonaId
  readonly grupoId: string
  readonly tipoLider: 'director_etapa' | 'lider_grupo' | 'coordinador_grupo' | 'miembro'
}

export interface DreamTeamGdvAdapterLeadershipChange {
  readonly personaId: PersonaId
  readonly grupoId: string
  readonly kind: 'added' | 'removed' | 'unchanged'
  readonly previous: DreamTeamGdvMember | null
  readonly current: DreamTeamGdvMember | null
}

export type DreamTeamGdvAdapterResult =
  | {
      readonly ok: true
      readonly contexts: readonly DreamTeamGdvAdapterContext[]
      readonly capabilities: readonly PlatformCapabilityGrant[]
      readonly leadershipChanges: readonly DreamTeamGdvAdapterLeadershipChange[]
      readonly audit: {
        readonly decision: 'allowed'
        readonly readerCalls: number
        readonly membershipCount: number
        readonly grantCount: number
      }
    }
  | {
      readonly ok: false
      readonly reason: 'session_required' | 'adapter_read_failed' | 'invalid_gdv_scope'
      readonly audit: {
        readonly decision: 'denied'
        readonly reason: string
        readonly readerCalls: number
      }
    }

/**
 * Adapter PURO que combina el session de plataforma con el reader de GDV
 * para producir capabilities de Dream Team (específicamente `dream_team.gdv.lead`).
 *
 * NO escribe a DB, NO toca Supabase. Es la capa de transformación.
 * La escritura a `dream_team_capability_grants` la hace el orchestrator de grants (S7).
 */
export async function resolveDreamTeamGdvPlatformContext(
  input: DreamTeamGdvAdapterInput,
): Promise<DreamTeamGdvAdapterResult> {
  const personaIdValue = normalizePlatformScopeId(input.session?.personaId)
  if (!personaIdValue || !input.session?.subjectAuthId.trim()) {
    return denied('session_required')
  }

  let memberships: readonly DreamTeamGdvMember[]
  try {
    memberships = await input.reader.listActiveLideres()
  } catch {
    return denied('adapter_read_failed', 1)
  }

  const contexts: DreamTeamGdvAdapterContext[] = []
  const capabilities: PlatformCapabilityGrant[] = []

  for (const member of memberships) {
    const normalizedMember = normalizeMember(member)
    if (!normalizedMember || !isLeadershipRole(normalizedMember.tipoLider)) continue

    const grant = buildGdvLeadGrant(normalizedMember)
    const resolution = resolvePlatformCapability({
      actor: {
        personaId: personaIdValue,
        allowedFlows: [GDV_ADAPTER_FLOW],
        grants: [grant],
      },
      flow: GDV_ADAPTER_FLOW,
      required: {
        key: GDV_LEAD_CAPABILITY_KEY,
        scope: grant.scope,
      },
    })

    if (!resolution.ok) {
      // Resolver rechazó el grant (scope inválido/conflicto). No es fatal.
      continue
    }

    contexts.push({
      personaId: normalizedMember.personaId,
      grupoId: normalizedMember.grupoId,
      tipoLider: normalizedMember.tipoLider,
    })
    capabilities.push(resolution.grant)
  }

  const leadershipChanges = diffMemberships(input.previousMemberships ?? [], memberships)

  return {
    ok: true,
    contexts,
    capabilities,
    leadershipChanges,
    audit: {
      decision: 'allowed',
      readerCalls: 1,
      membershipCount: memberships.length,
      grantCount: capabilities.length,
    },
  }
}

function buildGdvLeadGrant(member: DreamTeamGdvMember): PlatformCapabilityGrant {
  const scope = buildGdvLeadScope(member)
  return {
    key: GDV_LEAD_CAPABILITY_KEY,
    scope,
    source: GDV_LEAD_SOURCE,
  }
}

function buildGdvLeadScope(member: DreamTeamGdvMember): PlatformScope {
  return { experience: 'grupos_vida', type: 'grupo', id: member.grupoId }
}

function diffMemberships(
  previous: readonly DreamTeamGdvMember[],
  current: readonly DreamTeamGdvMember[],
): readonly DreamTeamGdvAdapterLeadershipChange[] {
  const changes: DreamTeamGdvAdapterLeadershipChange[] = []
  const previousByKey = new Map<string, DreamTeamGdvMember>()
  for (const member of previous) {
    const normalized = normalizeMember(member)
    if (!normalized) continue
    previousByKey.set(memberKey(normalized), normalized)
  }

  const processedKeys = new Set<string>()
  for (const currentMember of current) {
    const normalizedCurrent = normalizeMember(currentMember)
    if (!normalizedCurrent) continue
    const key = memberKey(normalizedCurrent)
    processedKeys.add(key)
    const previousMember = previousByKey.get(key) ?? null
    if (!previousMember) {
      changes.push({
        personaId: normalizedCurrent.personaId,
        grupoId: normalizedCurrent.grupoId,
        kind: 'added',
        previous: null,
        current: normalizedCurrent,
      })
    } else {
      changes.push({
        personaId: normalizedCurrent.personaId,
        grupoId: normalizedCurrent.grupoId,
        kind: 'unchanged',
        previous: previousMember,
        current: normalizedCurrent,
      })
    }
  }

  for (const previousMember of previousByKey.values()) {
    const key = memberKey(previousMember)
    if (processedKeys.has(key)) continue
    changes.push({
      personaId: previousMember.personaId,
      grupoId: previousMember.grupoId,
      kind: 'removed',
      previous: previousMember,
      current: null,
    })
  }

  return changes
}

function memberKey(member: DreamTeamGdvMember): string {
  return `${member.personaId}|${member.grupoId}`
}

function isLeadershipRole(
  tipoLider: DreamTeamGdvMember['tipoLider'],
): tipoLider is 'director_etapa' | 'lider_grupo' | 'coordinador_grupo' {
  return tipoLider !== 'miembro'
}

function normalizeMember(member: DreamTeamGdvMember): DreamTeamGdvMember | null {
  const grupoId = normalizePlatformScopeId(member.grupoId)
  if (!grupoId) return null
  const normalizedPersonaId = normalizePlatformScopeId(member.personaId)
  return {
    ...member,
    personaId: personaId(normalizedPersonaId ?? member.personaId),
    grupoId,
  }
}

function denied(
  reason: 'session_required' | 'adapter_read_failed' | 'invalid_gdv_scope',
  readerCalls: number = 0,
): DreamTeamGdvAdapterResult {
  return {
    ok: false,
    reason,
    audit: {
      decision: 'denied',
      reason,
      readerCalls,
    },
  }
}
