import { resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformCapabilityDeniedReason, PlatformCapabilityGrantInput, PlatformScopeInput } from '@/lib/platform/experiences'
import type { PlatformNavigationFlags } from '@/lib/platform/flags'
import type { PlatformSession, PlatformSessionCapability, PlatformSessionContext } from '@/lib/platform/session/types'

export const PLATFORM_NAVIGATION_FLOW = 'navigation'

export type PlatformNavigationSession = Pick<PlatformSession, 'personaId' | 'subjectAuthId' | 'globalRoles' | 'contexts' | 'capabilities'>
export type PlatformNavigationAdapterResult =
  | { ok: true; contexts?: readonly PlatformSessionContext[]; capabilities?: readonly PlatformSessionCapability[] }
  | { ok: false; reason: string }
export type PlatformNavigationAdapter = (session: PlatformNavigationSession) => Promise<PlatformNavigationAdapterResult>
export type PlatformNavigationFallbackReason = 'feature_flag_disabled' | 'kill_switch_enabled' | 'platform_session_required' | 'adapter_failed'
export type PlatformNavigationRouteDeniedReason = 'route_unavailable'
export type PlatformNavigationDeniedReason = PlatformNavigationFallbackReason | PlatformCapabilityDeniedReason | PlatformNavigationRouteDeniedReason
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
  | 'pastor_dashboard'
  | 'pastor_usuarios'
  | 'pastor_crisis'
  | 'pastor_lecturas'
  | 'lider_dashboard'
  | 'lider_uno_a_uno'
  | 'lider_triada'
  | 'asistido_roadmap'
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
export type PlatformNavigationGate =
  | { ok: true; platformSession: PlatformNavigationSession }
  | { ok: false; reason: PlatformNavigationFallbackReason }

type PlatformNavigationDefinition = {
  id: PlatformNavigationItemId
  capability: string
  label: string
  availableHref?: string
  experience: string
  fallbackScope: PlatformScopeInput
}

const ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION = {
  itemId: 'uno_a_uno_global',
  capability: 'uno_a_uno.global.read',
  label: '1:1 Global',
  experience: 'the_living_room',
} as const

const PLATFORM_NAVIGATION_SCOPE_LABELS: Partial<Record<PlatformNavigationItemId, Readonly<Record<string, string>>>> = {
  dps_team_service: { musica: 'DPS Música' },
}

const PLATFORM_NAVIGATION_DEFINITIONS = [
  { id: 'grupos_vida_stage', capability: 'grupos_vida.stage.read', label: 'Grupos de Vida', availableHref: '/grupos-vida', experience: 'grupos_vida', fallbackScope: { experience: 'grupos_vida', type: 'etapa', id: 'required' } },
  { id: 'dps_team_service', capability: 'dps.team.serve', label: 'DPS', experience: 'dps', fallbackScope: { experience: 'dps', type: 'equipo', id: 'required' } },
  { id: 'ninos_room_context', capability: 'ninos.room.read', label: 'Niños', experience: 'ninos', fallbackScope: { experience: 'ninos', type: 'salon', id: 'required' } },
  { id: 'estudiantes_room_context', capability: 'estudiantes.room.read', label: 'Estudiantes', experience: 'estudiantes', fallbackScope: { experience: 'estudiantes', type: 'salon', id: 'required' } },
  { id: 'talleres_participation', capability: 'talleres_crecimiento.participation.read', label: 'Talleres de Crecimiento', availableHref: '/talleres/explorar', experience: 'talleres_crecimiento', fallbackScope: { experience: 'talleres_crecimiento', type: 'taller', id: 'global' } },
  { id: 'dps_admin', capability: 'dps.admin.manage', label: 'Administración DPS', experience: 'dps', fallbackScope: { experience: 'dps', type: 'equipo', id: 'global' } },
  { id: 'nextgen_admin', capability: 'nextgen.admin.manage', label: 'Administración NextGen', experience: 'nextgen', fallbackScope: { experience: 'nextgen', type: 'experience' } },
  { id: 'talleres_admin', capability: 'talleres_crecimiento.admin.manage', label: 'Administración Talleres', availableHref: '/admin/talleres/abstracto', experience: 'talleres_crecimiento', fallbackScope: { experience: 'talleres_crecimiento', type: 'taller', id: 'global' } },
  { id: ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION.itemId, capability: ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION.capability, label: ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION.label, experience: ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION.experience, fallbackScope: { experience: ONE_ON_ONE_THE_LIVING_ROOM_NAVIGATION.experience, type: 'experience' } },
  { id: 'pastor_dashboard', capability: 'pastoral.read.all', label: 'Sesiones 1:1', availableHref: '/pastor', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'experience' } },
  { id: 'pastor_usuarios', capability: 'pastoral.admin.manage', label: 'Gestión de Usuarios', availableHref: '/pastor/usuarios', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'experience' } },
  { id: 'pastor_crisis', capability: 'pastoral.read.all', label: 'Alertas de Crisis', availableHref: '/pastor/crisis', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'experience' } },
  { id: 'pastor_lecturas', capability: 'pastoral.read.all', label: 'Lecturas Pastorales', availableHref: '/pastor/lecturas', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'experience' } },
  { id: 'lider_dashboard', capability: 'pastoral.one_on_one.create', label: 'Dashboard del Líder', availableHref: '/lider', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'one_on_one', id: 'required' } },
  { id: 'lider_uno_a_uno', capability: 'pastoral.one_on_one.read', label: '1:1 del Líder', availableHref: '/lider/uno-a-uno', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'one_on_one', id: 'required' } },
  { id: 'lider_triada', capability: 'pastoral.triada.read', label: 'Tríadas del Líder', availableHref: '/lider/triada', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'triada', id: 'required' } },
  { id: 'asistido_roadmap', capability: 'pastoral.one_on_one.read', label: 'Mi Camino Pastoral', availableHref: '/asistido', experience: 'pastoral', fallbackScope: { experience: 'pastoral', type: 'one_on_one', id: 'required' } },
] satisfies readonly PlatformNavigationDefinition[]

export async function resolvePlatformNavigation(input: PlatformNavigationResolverInput): Promise<PlatformNavigationResolution> {
  const gate = resolvePlatformNavigationGate(input)
  if (!gate.ok) return legacyFallback(gate.reason)

  const adapterState = await applyAdapters(gate.platformSession, input.adapters ?? [])
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

export function resolvePlatformNavigationGate(input: Pick<PlatformNavigationResolverInput, 'flags' | 'platformSession'>): PlatformNavigationGate {
  if (!input.flags.enabled) return { ok: false, reason: 'feature_flag_disabled' }
  if (input.flags.killSwitch) return { ok: false, reason: 'kill_switch_enabled' }
  if (!input.platformSession?.personaId.trim() || !input.platformSession.subjectAuthId.trim()) {
    return { ok: false, reason: 'platform_session_required' }
  }
  return { ok: true, platformSession: input.platformSession }
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

  // PR21.8: admin override for global-scope items. If the user has any
  // admin.manage cap for this experience and the item's fallbackScope
  // is 'global' (e.g. talleres_participation), grant them the item even
  // if they don't have the item-specific cap. This is required because
  // some "global" items (e.g. talleres_participation) have items that
  // are conceptually global, not scoped to a specific taller.
  const isGlobalItem = definition.fallbackScope.id === 'global'
  const adminCap = isGlobalItem
    ? session.capabilities.find(
        (c) =>
          c.experience === definition.experience &&
          (c.key === `${definition.experience}.admin.manage` ||
            (definition.experience === 'talleres_crecimiento' && c.key === 'talleres_crecimiento.metrics.read')),
      )
    : undefined

  if (matchingCapabilities.length === 0 && !adminCap) {
    return { visibleItems: [], deniedItem: denyByCapability(definition, session, definition.fallbackScope) }
  }

  if (matchingCapabilities.length === 0 && adminCap) {
    // Use the admin's cap as the visibleItem's source.
    return { visibleItems: [toNavigationItem(definition, adminCap, session.contexts)!].filter(Boolean), deniedItem: undefined }
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
      const visibleItem = toNavigationItem(definition, capability, session.contexts)
      if (visibleItem) {
        visibleItems.push(visibleItem)
      } else {
        deniedItem = { id: definition.id, reason: 'route_unavailable' }
      }
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

function toNavigationItem(definition: PlatformNavigationDefinition, capability: PlatformSessionCapability, contexts: readonly PlatformSessionContext[]): PlatformNavigationItem | undefined {
  if (!definition.availableHref) return undefined
  return {
    id: definition.id,
    label: resolveLabel(definition, capability, contexts),
    href: definition.availableHref,
    experience: definition.experience,
    scope: { type: capability.scopeType, ...(capability.scopeId ? { id: capability.scopeId } : {}) },
  }
}

function resolveLabel(definition: PlatformNavigationDefinition, capability: PlatformSessionCapability, contexts: readonly PlatformSessionContext[]): string {
  const context = contexts.find((item) => item.experience === capability.experience && item.scopeType === capability.scopeType && item.scopeId === capability.scopeId)
  if (context?.label.trim()) return context.label
  const explicitScopeLabel = resolveExplicitScopeLabel(definition.id, capability.scopeId)
  if (explicitScopeLabel) return explicitScopeLabel
  return capability.scopeId ? `${definition.label} — ${capability.scopeId}` : definition.label
}

function resolveExplicitScopeLabel(itemId: PlatformNavigationItemId, scopeId: string | undefined): string | undefined {
  if (!scopeId) return undefined
  return PLATFORM_NAVIGATION_SCOPE_LABELS[itemId]?.[scopeId]
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
