export const PLATFORM_SCOPE_TYPES = ['experience', 'equipo', 'etapa', 'grupo', 'salon', 'taller'] as const

export type PlatformScopeType = (typeof PLATFORM_SCOPE_TYPES)[number]

export const PLATFORM_EXPERIENCE_CATALOG = {
  grupos_vida: { label: 'Grupos de Vida', scopeTypes: ['etapa', 'grupo'] },
  dps: { label: 'DPS', scopeTypes: ['equipo'] },
  ninos: { label: 'Niños', scopeTypes: ['salon'] },
  estudiantes: { label: 'Estudiantes', scopeTypes: ['salon', 'equipo'] },
  the_living_room: { label: 'The Living Room', scopeTypes: ['experience'] },
  talleres_crecimiento: { label: 'Talleres de Crecimiento', scopeTypes: ['taller'] },
  family: { label: 'Familia', scopeTypes: ['experience'] },
  dream_team: { label: 'Dream Team', scopeTypes: ['experience', 'equipo'] },
  operating_core: { label: 'Operating Core', scopeTypes: ['experience'] },
} satisfies Record<string, { label: string; scopeTypes: readonly PlatformScopeType[] }>

export type PlatformExperienceKey = keyof typeof PLATFORM_EXPERIENCE_CATALOG

export const PLATFORM_CAPABILITIES = {
  'platform.context.read': { experience: 'the_living_room', scopeType: 'experience' },
  'grupos_vida.stage.read': { experience: 'grupos_vida', scopeType: 'etapa' },
  'dps.team.serve': { experience: 'dps', scopeType: 'equipo' },
  'ninos.room.read': { experience: 'ninos', scopeType: 'salon' },
  'estudiantes.room.read': { experience: 'estudiantes', scopeType: 'salon' },
  'talleres_crecimiento.participation.read': { experience: 'talleres_crecimiento', scopeType: 'taller' },
  'family.minor.read': { experience: 'family', scopeType: 'experience' },
  'family.minor.consent': { experience: 'family', scopeType: 'experience' },
  // Generic Dream Team capabilities (hybrid model)
  'dream_team.serve': { experience: 'dream_team', scopeType: 'experience' },
  'dream_team.lead': { experience: 'dream_team', scopeType: 'equipo' },
  'dream_team.coordinate': { experience: 'dream_team', scopeType: 'equipo' },
  'dream_team.director.coordinate': { experience: 'dream_team', scopeType: 'experience' },
  'dream_team.requirements.manage': { experience: 'dream_team', scopeType: 'experience' },
  'dream_team.metrics.read': { experience: 'dream_team', scopeType: 'experience' },
  'dream_team.gdv.lead': { experience: 'grupos_vida', scopeType: 'grupo' },
  // Domain-specific team capabilities
  'dps.team.lead': { experience: 'dps', scopeType: 'equipo' },
  'dps.team.director': { experience: 'dps', scopeType: 'equipo' },
  'estudiantes.team.serve': { experience: 'estudiantes', scopeType: 'equipo' },
  'estudiantes.team.lead': { experience: 'estudiantes', scopeType: 'equipo' },
  'talleres_crecimiento.team.serve': { experience: 'talleres_crecimiento', scopeType: 'taller' },
  'ninos.team.serve': { experience: 'ninos', scopeType: 'salon' },
  'the_living_room.team.serve': { experience: 'the_living_room', scopeType: 'experience' },
  // Operating Core capabilities
  'operating_core.events.read': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.events.manage': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.services.read': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.services.manage': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.participation.read': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.capacity.manage': { experience: 'operating_core', scopeType: 'experience' },
  // Forms capabilities (S15)
  'operating_core.forms.manage': { experience: 'operating_core', scopeType: 'experience' },
  'operating_core.forms.submit': { experience: 'operating_core', scopeType: 'experience' },
} satisfies Record<string, { experience: PlatformExperienceKey; scopeType: PlatformScopeType }>

export type PlatformCapabilityKey = keyof typeof PLATFORM_CAPABILITIES
export type PlatformScopeInput = { experience?: string | null; type?: string | null; id?: string | null }
export type PlatformCapabilityGrantInput = { key?: string | null; scope?: PlatformScopeInput | null; source?: string | null }
export type PlatformCapabilityActor = { personaId: string; allowedFlows: string[]; grants: PlatformCapabilityGrantInput[] }
export type PlatformCapabilityRequirement = { key: string; scope?: PlatformScopeInput | null }
export type PlatformCapabilityResolutionInput = {
  actor: PlatformCapabilityActor | null | undefined
  flow: string
  required: PlatformCapabilityRequirement
}
export type PlatformCapabilityDeniedReason =
  | 'actor_required'
  | 'flow_not_allowed'
  | 'unknown_capability'
  | 'missing_required_scope'
  | 'malformed_required_scope'
  | 'unknown_required_scope'
  | 'grant_scope_missing'
  | 'grant_scope_malformed'
  | 'grant_scope_unknown'
  | 'duplicate_scope'
  | 'conflicting_scope'
  | 'missing_required_capability'
export type PlatformCapabilityAudit = {
  actorPersonaId?: string
  decision: 'allowed' | 'denied'
  reason?: PlatformCapabilityDeniedReason
  flow: string
  requiredCapability: string
  requiredScope?: string
  evaluatedGrantSignatures: string[]
}
export type PlatformCapabilityGrant = { key: PlatformCapabilityKey; scope: PlatformScope; source: string }
export type PlatformScope = { experience: PlatformExperienceKey; type: PlatformScopeType; id?: string }
export type PlatformCapabilityResolution =
  | { ok: true; decision: 'allowed'; grant: PlatformCapabilityGrant; audit: PlatformCapabilityAudit }
  | { ok: false; decision: 'denied'; reason: PlatformCapabilityDeniedReason; audit: PlatformCapabilityAudit }

type CapabilityDefinition = { experience: PlatformExperienceKey; scopeType: PlatformScopeType }
type ScopeValidationFailure = 'missing' | 'malformed' | 'unknown' | 'conflicting'
type ScopeValidationResult = { ok: true; scope: PlatformScope; signature: string } | { ok: false; reason: ScopeValidationFailure }
type NormalizedGrant = PlatformCapabilityGrant & { signature: string }
type DeniedParams = {
  input: PlatformCapabilityResolutionInput
  reason: PlatformCapabilityDeniedReason
  evaluatedGrantSignatures: string[]
  requiredCapability: string
  requiredScope?: string
}
type AuditParams = {
  input: PlatformCapabilityResolutionInput
  decision: 'allowed' | 'denied'
  evaluatedGrantSignatures: string[]
  requiredCapability: string
  requiredScope?: string
  reason?: PlatformCapabilityDeniedReason
}

const PLATFORM_SCOPE_TYPE_SET: ReadonlySet<string> = new Set(PLATFORM_SCOPE_TYPES)
const SCOPE_ID_MAX_LENGTH = 64
const SCOPE_ID_FIRST_CHARACTER_PATTERN = /^[a-z0-9]$/
const SCOPE_ID_ALLOWED_CHARACTERS_PATTERN = /^[a-z0-9._:-]+$/

export function resolvePlatformCapability(input: PlatformCapabilityResolutionInput): PlatformCapabilityResolution {
  const actorPersonaId = input.actor?.personaId.trim() || undefined
  const requiredCapability = normalizeToken(input.required.key)
  if (!actorPersonaId) return denied({ input, reason: 'actor_required', evaluatedGrantSignatures: [], requiredCapability })
  if (!input.flow.trim() || !input.actor?.allowedFlows.includes(input.flow)) {
    return denied({ input, reason: 'flow_not_allowed', evaluatedGrantSignatures: [], requiredCapability })
  }
  if (!isPlatformCapabilityKey(requiredCapability)) {
    return denied({ input, reason: 'unknown_capability', evaluatedGrantSignatures: [], requiredCapability })
  }

  const definition = PLATFORM_CAPABILITIES[requiredCapability]
  const requiredScope = normalizeScope(input.required.scope, definition)
  if (!requiredScope.ok) {
    return denied({ input, reason: toRequiredScopeReason(requiredScope.reason), evaluatedGrantSignatures: [], requiredCapability })
  }

  const grants = input.actor.grants.filter((grant) => normalizeToken(grant.key) === requiredCapability)
  const normalizedGrants: NormalizedGrant[] = []
  for (const grant of grants) {
    const normalized = normalizeScope(grant.scope, definition)
    if (!normalized.ok) {
      return denied({
        input,
        reason: toGrantScopeReason(normalized.reason),
        evaluatedGrantSignatures: normalizedGrants.map((item) => item.signature),
        requiredCapability,
        requiredScope: requiredScope.signature,
      })
    }
    normalizedGrants.push({ key: requiredCapability, scope: normalized.scope, source: normalizeSource(grant.source), signature: `${requiredCapability}|${normalized.signature}` })
  }

  normalizedGrants.sort((left, right) => left.signature.localeCompare(right.signature) || left.source.localeCompare(right.source))
  const evaluatedGrantSignatures = normalizedGrants.map((grant) => grant.signature)
  if (hasDuplicateSignature(evaluatedGrantSignatures)) {
    return denied({ input, reason: 'duplicate_scope', evaluatedGrantSignatures, requiredCapability, requiredScope: requiredScope.signature })
  }

  const matchingGrant = normalizedGrants.find((grant) => grant.signature === `${requiredCapability}|${requiredScope.signature}`)
  if (!matchingGrant) {
    return denied({ input, reason: 'missing_required_capability', evaluatedGrantSignatures, requiredCapability, requiredScope: requiredScope.signature })
  }

  return {
    ok: true,
    decision: 'allowed',
    grant: { key: matchingGrant.key, scope: matchingGrant.scope, source: matchingGrant.source },
    audit: toAudit({ input, decision: 'allowed', evaluatedGrantSignatures, requiredCapability, requiredScope: requiredScope.signature }),
  }
}

function normalizeScope(scope: PlatformScopeInput | null | undefined, definition: CapabilityDefinition): ScopeValidationResult {
  if (!scope) return { ok: false, reason: 'missing' }
  const experience = normalizeToken(scope.experience)
  const type = normalizeToken(scope.type)
  if (!experience || !type) return { ok: false, reason: 'missing' }
  if (!isPlatformExperienceKey(experience) || !isPlatformScopeType(type)) return { ok: false, reason: 'unknown' }
  if (!experienceAllowsScopeType(experience, type)) return { ok: false, reason: 'unknown' }
  if (experience !== definition.experience || type !== definition.scopeType) return { ok: false, reason: 'conflicting' }

  const id = normalizePlatformScopeId(scope.id)
  if (type !== 'experience' && !id) return { ok: false, reason: scope.id?.trim() ? 'malformed' : 'missing' }
  if (type === 'experience' && scope.id?.trim() && !id) return { ok: false, reason: 'malformed' }

  const normalizedScope = id ? { experience, type, id } : { experience, type }
  return { ok: true, scope: normalizedScope, signature: scopeSignature(normalizedScope) }
}

function denied(params: DeniedParams): PlatformCapabilityResolution {
  const { input, reason, evaluatedGrantSignatures, requiredCapability, requiredScope } = params
  return {
    ok: false,
    decision: 'denied',
    reason,
    audit: toAudit({ input, decision: 'denied', evaluatedGrantSignatures, requiredCapability, requiredScope, reason }),
  }
}

function toAudit(params: AuditParams): PlatformCapabilityAudit {
  const { input, decision, evaluatedGrantSignatures, requiredCapability, requiredScope, reason } = params
  const actorPersonaId = input.actor?.personaId.trim() || undefined
  return {
    ...(actorPersonaId ? { actorPersonaId } : {}),
    decision,
    ...(reason ? { reason } : {}),
    flow: input.flow,
    requiredCapability,
    ...(requiredScope ? { requiredScope } : {}),
    evaluatedGrantSignatures,
  }
}

function toRequiredScopeReason(reason: ScopeValidationFailure): PlatformCapabilityDeniedReason {
  if (reason === 'missing') return 'missing_required_scope'
  if (reason === 'malformed') return 'malformed_required_scope'
  if (reason === 'unknown') return 'unknown_required_scope'
  return 'conflicting_scope'
}

function toGrantScopeReason(reason: ScopeValidationFailure): PlatformCapabilityDeniedReason {
  if (reason === 'missing') return 'grant_scope_missing'
  if (reason === 'malformed') return 'grant_scope_malformed'
  if (reason === 'unknown') return 'grant_scope_unknown'
  return 'conflicting_scope'
}

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeSource(value: string | null | undefined): string {
  return value?.trim() || 'unknown'
}

export function normalizePlatformScopeId(value: string | null | undefined): string | undefined {
  const normalized = normalizeToken(value)
  if (!normalized || normalized.length > SCOPE_ID_MAX_LENGTH) return undefined
  if (!SCOPE_ID_FIRST_CHARACTER_PATTERN.test(normalized[0] ?? '')) return undefined
  return SCOPE_ID_ALLOWED_CHARACTERS_PATTERN.test(normalized) ? normalized : undefined
}

function scopeSignature(scope: PlatformScope): string {
  return scope.id ? `${scope.experience}:${scope.type}:${scope.id}` : `${scope.experience}:${scope.type}`
}

function hasDuplicateSignature(signatures: string[]): boolean {
  return new Set(signatures).size !== signatures.length
}

function experienceAllowsScopeType(experience: PlatformExperienceKey, type: PlatformScopeType): boolean {
  const scopeTypes: readonly PlatformScopeType[] = PLATFORM_EXPERIENCE_CATALOG[experience].scopeTypes
  return scopeTypes.includes(type)
}

function isPlatformCapabilityKey(value: string): value is PlatformCapabilityKey {
  return hasOwnStringKey(PLATFORM_CAPABILITIES, value)
}

function isPlatformExperienceKey(value: string): value is PlatformExperienceKey {
  return hasOwnStringKey(PLATFORM_EXPERIENCE_CATALOG, value)
}

function isPlatformScopeType(value: string): value is PlatformScopeType {
  return PLATFORM_SCOPE_TYPE_SET.has(value)
}

function hasOwnStringKey<T extends object>(record: T, value: string): value is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(record, value)
}
