/**
 * W01 — DT-006 — Pastoral capability resolver.
 * Pure function resolving pastoral capabilities against session grants.
 * Same shape as resolveOperatingCoreCapability from F3.
 *
 * Separation of read vs write (P5): pastoral.read.all does NOT grant
 * validate_step, disband, or complete capabilities. Those require
 * explicit grants scoped to the specific pastoral record.
 */
import { PLATFORM_CAPABILITIES } from '@/lib/platform/experiences'
import type { PlatformScopeType } from '@/lib/platform/experiences'

export type PastoralSessionContext = {
  readonly session: {
    readonly personaId: string
    readonly allowedFlows: readonly string[]
    readonly grants?: ReadonlyArray<{
      readonly key: string
      readonly scope: { readonly experience: string; readonly type: string; readonly id?: string } | null
      readonly source?: string | null
    }>
  } | null
  readonly requiredCapability: string
  readonly flow: string
}

type PastoralScope = { experience: 'pastoral'; type: PlatformScopeType; id?: string }

type PastoralCapabilityResolution =
  | {
      ok: true
      decision: 'allowed'
      grant: { key: string; scope: PastoralScope; source: string }
      audit: PastoralCapabilityAudit
    }
  | {
      ok: false
      decision: 'denied'
      reason: PastoralDeniedReason
      audit: PastoralCapabilityAudit
    }

type PastoralDeniedReason =
  | 'actor_required'
  | 'flow_not_allowed'
  | 'unknown_capability'
  | 'missing_required_capability'

type PastoralCapabilityAudit = {
  actorPersonaId?: string
  decision: 'allowed' | 'denied'
  reason?: PastoralDeniedReason
  flow: string
  requiredCapability: string
}

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function resolvePastoralCapability(ctx: PastoralSessionContext): PastoralCapabilityResolution {
  const actorPersonaId = ctx.session?.personaId.trim() ?? ''
  const requiredCapability = normalizeToken(ctx.requiredCapability)
  const flow = normalizeToken(ctx.flow)

  // Actor required
  if (!actorPersonaId) {
    return {
      ok: false,
      decision: 'denied',
      reason: 'actor_required',
      audit: { decision: 'denied', reason: 'actor_required', flow, requiredCapability },
    }
  }

  // Flow must be allowed
  if (!flow || !(ctx.session?.allowedFlows ?? []).includes(flow)) {
    return denied({ reason: 'flow_not_allowed', actorPersonaId, flow, requiredCapability })
  }

  // Capability must exist in PLATFORM_CAPABILITIES
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, requiredCapability)) {
    return denied({ reason: 'unknown_capability', actorPersonaId, flow, requiredCapability })
  }

  const definition = PLATFORM_CAPABILITIES[requiredCapability as keyof typeof PLATFORM_CAPABILITIES]
  const grants = ctx.session?.grants ?? []
  const matchingGrants = grants.filter((g) => normalizeToken(g.key) === requiredCapability)

  if (matchingGrants.length === 0) {
    return denied({ reason: 'missing_required_capability', actorPersonaId, flow, requiredCapability })
  }

  // For pastoral, we require an exact match on experience='pastoral'
  const pastoralGrants = matchingGrants.filter(
    (g) => g.scope && normalizeToken(g.scope.experience) === 'pastoral',
  )

  if (pastoralGrants.length === 0) {
    return denied({ reason: 'missing_required_capability', actorPersonaId, flow, requiredCapability })
  }

  // Find first grant with matching scope type
  const matchingGrant = pastoralGrants.find((g) => {
    const scopeType = normalizeToken(g.scope?.type)
    return scopeType === definition.scopeType
  })

  if (!matchingGrant) {
    return denied({ reason: 'missing_required_capability', actorPersonaId, flow, requiredCapability })
  }

  const scope = matchingGrant.scope!
  return {
    ok: true,
    decision: 'allowed',
    grant: {
      key: requiredCapability,
      scope: { experience: 'pastoral', type: definition.scopeType, id: scope.id },
      source: normalizeToken(matchingGrant.source),
    },
    audit: {
      actorPersonaId,
      decision: 'allowed',
      flow,
      requiredCapability,
    },
  }
}

function denied(params: {
  reason: PastoralDeniedReason
  actorPersonaId: string
  flow: string
  requiredCapability: string
}): PastoralCapabilityResolution {
  const { reason, actorPersonaId, flow, requiredCapability } = params
  return {
    ok: false,
    decision: 'denied',
    reason,
    audit: {
      actorPersonaId,
      decision: 'denied',
      reason,
      flow,
      requiredCapability,
    },
  }
}
