import { resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformCapabilityDeniedReason, PlatformCapabilityGrantInput, PlatformScopeInput } from '@/lib/platform/experiences'
import type { PlatformSession, PlatformSessionCapability, PlatformSessionContext } from '@/lib/platform/session/types'

export const PLATFORM_NAVIGATION_FLOW = 'navigation'

export type PlatformNavigationSession = Pick<PlatformSession, 'personaId' | 'subjectAuthId' | 'globalRoles' | 'contexts' | 'capabilities'>
export type PlatformNavigationFlags = { enabled: boolean; killSwitch?: boolean }
export type PlatformNavigationAdapterResult =
  | { ok: true; contexts?: readonly PlatformSessionContext[]; capabilities?: readonly PlatformSessionCapability[] }
  | { ok: false; reason: string }
export type PlatformNavigationAdapter = (session: PlatformNavigationSession) => Promise<PlatformNavigationAdapterResult>
export type PlatformNavigationFallbackReason = 'feature_flag_disabled' | 'kill_switch_enabled' | 'platform_session_required' | 'adapter_failed'
export type PlatformNavigationDeniedReason = PlatformNavigationFallbackReason | PlatformCapabilityDeniedReason
export type PlatformNavigationItemId =
  | 'grupos_vida_stage'
  | 'dps_team_service'
  | 'ninos_room_context'
  | 'estudiantes_room_context'
  | 'talleres_participation'
  | 'dps_admin'
  | 'nextgen_admin'
  | 'talleres_admin'
  | 'uno_a_uno_global'
export type PlatformNavigationItem = {
  id: PlatformNavigationItemId
  label: string
  href: string
  experience: string
  scope: { type: string; id?: string }
}
export type PlatformNavigationDeniedItem = { id: PlatformNavigationItemId; reason: PlatformNavigationDeniedReason }
export type PlatformNavigationAudit = {
  decision: 'allowed' | 'denied'
  flow: typeof PLATFORM_NAVIGATION_FLOW
  reason?: PlatformNavigationDeniedReason
  visibleItemCount: number
  deniedItemCount: number
}
export type PlatformNavigationResolution = {
  mode: 'platform' | 'legacy_fallback'
  legacyFallback: boolean
  visibleItems: PlatformNavigationItem[]
  deniedItems: PlatformNavigationDeniedItem[]
  audit: PlatformNavigationAudit
}
export type PlatformNavigationResolverInput = {
  flags: PlatformNavigationFlags
  platformSession: PlatformNavigationSession | null | undefined
  adapters?: readonly PlatformNavigationAdapter[]
}

type PlatformNavigationDefinition = {
  id: PlatformNavigationItemId
  capability: string
  label: string
  href: string
  experience: string
  fallbackScope: PlatformScopeInput
}

const PLATFORM_NAVIGATION_DEFINITIONS = [
  { id: 'grupos_vida_stage', capability: 'grupos_vida.stage.read', label: 'Grupos de Vida', href: '/dashboard/grupos-vida', experience: 'grupos_vida', fallbackScope: { experience: 'grupos_vida', type: 'etapa', id: 'required' } },
  { id: 'dps_team_service', capability: 'dps.team.serve', label: 'DPS', href: '/dashboard/dps', experience: 'dps', fallbackScope: { experience: 'dps', type: 'equipo', id: 'required' } },
  { id: 'ninos_room_context', capability: 'ninos.room.read', label: 'Niños', href: '/dashboard/ninos', experience: 'ninos', fallbackScope: { experience: 'ninos', type: 'salon', id: 'required' } },
  { id: 'estudiantes_room_context', capability: 'estudiantes.room.read', label: 'Estudiantes', href: '/dashboard/estudiantes', experience: 'estudiantes', fallbackScope: { experience: 'estudiantes', type: 'salon', id: 'required' } },
  { id: 'talleres_participation', capability: 'talleres_crecimiento.participation.read', label: 'Talleres de Crecimiento', href: '/dashboard/talleres', experience: 'talleres_crecimiento', fallbackScope: { experience: 'talleres_crecimiento', type: 'taller', id: 'required' } },
  { id: 'dps_admin', capability: 'dps.admin.manage', label: 'Administración DPS', href: '/dashboard/dps/admin', experience: 'dps', fallbackScope: { experience: 'dps', type: 'equipo', id: 'global' } },
  { id: 'nextgen_admin', capability: 'nextgen.admin.manage', label: 'Administración NextGen', href: '/dashboard/nextgen/admin', experience: 'nextgen', fallbackScope: { experience: 'nextgen', type: 'experience' } },
  { id: 'talleres_admin', capability: 'talleres_crecimiento.admin.manage', label: 'Administración Talleres', href: '/dashboard/talleres/admin', experience: 'talleres_crecimiento', fallbackScope: { experience: 'talleres_crecimiento', type: 'taller', id: 'global' } },
  { id: 'uno_a_uno_global', capability: 'uno_a_uno.global.read', label: '1:1 Global', href: '/dashboard/uno-a-uno', experience: 'uno_a_uno', fallbackScope: { experience: 'the_living_room', type: 'experience' } },
] satisfies readonly PlatformNavigationDefinition[]

export async function resolvePlatformNavigation(input: PlatformNavigationResolverInput): Promise<PlatformNavigationResolution> {
  if (!input.flags.enabled) return legacyFallback('feature_flag_disabled')
  if (input.flags.killSwitch) return legacyFallback('kill_switch_enabled')
  if (!input.platformSession?.personaId.trim() || !input.platformSession.subjectAuthId.trim()) return legacyFallback('platform_session_required')

  const adapterState = await applyAdapters(input.platformSession, input.adapters ?? [])
  if (!adapterState.ok) return legacyFallback('adapter_failed')

  const visibleItems: PlatformNavigationItem[] = []
  const deniedItems: PlatformNavigationDeniedItem[] = []
  for (const definition of PLATFORM_NAVIGATION_DEFINITIONS) {
    const resolved = resolveNavigationDefinition(definition, adapterState.session)
    visibleItems.push(...resolved.visibleItems)
    if (resolved.deniedItem) deniedItems.push(resolved.deniedItem)
  }

  visibleItems.sort((left, right) => left.id.localeCompare(right.id) || left.label.localeCompare(right.label))
  return {
    mode: 'platform',
    legacyFallback: false,
    visibleItems,
    deniedItems,
    audit: { decision: 'allowed', flow: PLATFORM_NAVIGATION_FLOW, visibleItemCount: visibleItems.length, deniedItemCount: deniedItems.length },
  }
}

async function applyAdapters(session: PlatformNavigationSession, adapters: readonly PlatformNavigationAdapter[]) {
  const merged: PlatformNavigationSession = toClientSafeSession(session)
  for (const adapter of adapters) {
    let result: PlatformNavigationAdapterResult
    try {
      result = await adapter(toClientSafeSession(session))
    } catch {
      return { ok: false } as const
    }
    if (!result.ok) return { ok: false } as const
    merged.contexts = [...merged.contexts, ...(result.contexts ?? [])]
    merged.capabilities = [...merged.capabilities, ...(result.capabilities ?? [])]
  }
  return { ok: true, session: merged } as const
}

function resolveNavigationDefinition(definition: PlatformNavigationDefinition, session: PlatformNavigationSession) {
  const matchingCapabilities = session.capabilities.filter((capability) => capability.key === definition.capability)
  if (matchingCapabilities.length === 0) {
    return { visibleItems: [], deniedItem: denyByCapability(definition, session, definition.fallbackScope) }
  }

  const visibleItems: PlatformNavigationItem[] = []
  let deniedItem: PlatformNavigationDeniedItem | undefined
  for (const capability of matchingCapabilities) {
    const missingScopedId = capability.scopeType !== 'experience' && !capability.scopeId?.trim()
    const capabilityResult = missingScopedId
      ? { ok: false, reason: 'grant_scope_missing' as const }
      : resolvePlatformCapability({
        actor: toCapabilityActor(session),
        flow: PLATFORM_NAVIGATION_FLOW,
        required: { key: definition.capability, scope: toScopeInput(capability) },
      })

    if (capabilityResult.ok) {
      visibleItems.push(toNavigationItem(definition, capability, session.contexts))
    } else {
      deniedItem = { id: definition.id, reason: capabilityResult.reason }
    }
  }

  return { visibleItems, deniedItem: visibleItems.length > 0 ? undefined : deniedItem }
}

function denyByCapability(definition: PlatformNavigationDefinition, session: PlatformNavigationSession, scope: PlatformScopeInput): PlatformNavigationDeniedItem {
  const result = resolvePlatformCapability({
    actor: toCapabilityActor(session),
    flow: PLATFORM_NAVIGATION_FLOW,
    required: { key: definition.capability, scope },
  })
  return { id: definition.id, reason: result.ok ? 'missing_required_capability' : result.reason }
}

function legacyFallback(reason: PlatformNavigationFallbackReason): PlatformNavigationResolution {
  const deniedItems = PLATFORM_NAVIGATION_DEFINITIONS.map((definition) => ({ id: definition.id, reason }))
  return {
    mode: 'legacy_fallback',
    legacyFallback: true,
    visibleItems: [],
    deniedItems,
    audit: { decision: 'denied', flow: PLATFORM_NAVIGATION_FLOW, reason, visibleItemCount: 0, deniedItemCount: deniedItems.length },
  }
}

function toCapabilityActor(session: PlatformNavigationSession) {
  return {
    personaId: session.personaId,
    allowedFlows: [PLATFORM_NAVIGATION_FLOW],
    grants: session.capabilities.map(toCapabilityGrant),
  }
}

function toCapabilityGrant(capability: PlatformSessionCapability): PlatformCapabilityGrantInput {
  return { key: capability.key, scope: toScopeInput(capability), source: capability.source }
}

function toScopeInput(capability: PlatformSessionCapability): PlatformScopeInput {
  return { experience: capability.experience, type: capability.scopeType, id: capability.scopeId }
}

function toNavigationItem(definition: PlatformNavigationDefinition, capability: PlatformSessionCapability, contexts: readonly PlatformSessionContext[]): PlatformNavigationItem {
  return {
    id: definition.id,
    label: resolveLabel(definition, capability, contexts),
    href: definition.href,
    experience: definition.experience,
    scope: { type: capability.scopeType, ...(capability.scopeId ? { id: capability.scopeId } : {}) },
  }
}

function resolveLabel(definition: PlatformNavigationDefinition, capability: PlatformSessionCapability, contexts: readonly PlatformSessionContext[]): string {
  const context = contexts.find((item) => item.experience === capability.experience && item.scopeType === capability.scopeType && item.scopeId === capability.scopeId)
  if (context?.label.trim()) return context.label
  if (definition.id === 'dps_team_service' && capability.scopeId === 'musica') return 'DPS Música'
  return capability.scopeId ? `${definition.label} — ${capability.scopeId}` : definition.label
}

function toClientSafeSession(session: PlatformNavigationSession): PlatformNavigationSession {
  return {
    personaId: session.personaId,
    subjectAuthId: session.subjectAuthId,
    globalRoles: [...session.globalRoles],
    contexts: [...session.contexts],
    capabilities: [...session.capabilities],
  }
}
