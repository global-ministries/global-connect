/**
 * Operating Core participation event read guard.
 * Mirrors the shape of canReadPlatformParticipationEvent from participation.ts.
 * Pattern reference: lib/platform/participation.ts:162 (read-only).
 *
 * This guard determines whether an actor can read an Operating Core participation event.
 * Uses PLATFORM_CAPABILITIES from experiences.ts — does NOT import from participation.ts.
 */
import { PLATFORM_CAPABILITIES, resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformScopeType } from '@/lib/platform/experiences'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperatingCoreParticipationReadActor = {
  readonly personaId: string
  readonly allowedFlows: readonly string[]
  readonly grants: ReadonlyArray<{
    readonly key: string
    readonly scope: { readonly experience: string; readonly type: PlatformScopeType; readonly id?: string }
    readonly source: string
  }>
}

export type OperatingCoreParticipationEventScope = {
  readonly experience: string
  readonly scopeType: PlatformScopeType
  readonly scopeId?: string
}

export type OperatingCoreParticipationReadEvent = {
  readonly id: string
  readonly actorPersonaId?: string
  readonly scope: OperatingCoreParticipationEventScope
  readonly eventType: string
}

export type OperatingCoreParticipationEvent = OperatingCoreParticipationReadEvent

export type OperatingCoreParticipationReadInput = {
  readonly actor: OperatingCoreParticipationReadActor | null | undefined
  readonly event: OperatingCoreParticipationEvent | null | undefined
  readonly capabilities: ReadonlyArray<{
    readonly experience: string
    readonly scopeType: PlatformScopeType
    readonly scopeId?: string
  }>
}

export type OperatingCoreParticipationReadResult =
  | { readonly allowed: true; readonly reason: 'self' | 'scoped_capability' }
  | { readonly allowed: false; readonly reason: 'no_event' | 'no_actor' | 'sensitive_no_capability' | 'insufficient_scope' }

const SENSITIVE_EVENT_TYPES: ReadonlySet<string> = new Set([])

// ---------------------------------------------------------------------------
// Read guard
// ---------------------------------------------------------------------------

/**
 * Determines whether an actor can read an Operating Core participation event.
 * Mirrors canReadPlatformParticipationEvent from lib/platform/participation.ts.
 *
 * Rules:
 * 1. No event → denied (no_event)
 * 2. No actor / empty personaId → denied (no_actor)
 * 3. Actor is the event subject (actorPersonaId matches) → allowed (self)
 * 4. Actor has a scoped capability matching the event scope → allowed (scoped_capability)
 * 5. Event type is sensitive and no capability matches → denied (sensitive_no_capability)
 * 6. Otherwise → denied (insufficient_scope)
 */
export function canReadOperatingCoreParticipationEvent(
  params: OperatingCoreParticipationReadInput,
): OperatingCoreParticipationReadResult {
  const { actor, event, capabilities } = params

  if (!event) return { allowed: false, reason: 'no_event' }

  if (!actor || !actor.personaId || actor.personaId.trim() === '') {
    return { allowed: false, reason: 'no_actor' }
  }

  // Self-read: actor can always read their own participation events
  if (event.actorPersonaId === actor.personaId) {
    return { allowed: true, reason: 'self' }
  }

  // Check if any of the actor's grants provide a matching capability
  const matchingCapability = capabilities.find((capability) =>
    capabilityMatchesEvent(capability, event.scope),
  )

  if (matchingCapability) {
    return { allowed: true, reason: 'scoped_capability' }
  }

  if (SENSITIVE_EVENT_TYPES.has(event.eventType)) {
    return { allowed: false, reason: 'sensitive_no_capability' }
  }

  return { allowed: false, reason: 'insufficient_scope' }
}

function capabilityMatchesEvent(
  capability: { experience: string; scopeType: PlatformScopeType; scopeId?: string },
  scope: OperatingCoreParticipationEventScope,
): boolean {
  if (capability.experience !== scope.experience) return false
  if (capability.scopeType !== scope.scopeType) return false
  if (scope.scopeId === undefined) {
    return capability.scopeId === undefined
  }
  return capability.scopeId === scope.scopeId
}

/**
 * Convenience helper for route/API layers — checks operating_core.participation.read capability.
 * Returns true if the actor can read participation events for the given scope.
 */
export function hasOperatingCoreParticipationReadCapability(
  actor: OperatingCoreParticipationReadActor,
  scope: OperatingCoreParticipationEventScope,
): boolean {
  const capKey = 'operating_core.participation.read'
  const capDef = PLATFORM_CAPABILITIES[capKey as keyof typeof PLATFORM_CAPABILITIES]
  if (!capDef) return false

  const result = resolvePlatformCapability({
    actor: {
      personaId: actor.personaId,
      allowedFlows: [...actor.allowedFlows],
      grants: actor.grants.map((g) => ({
        key: g.key,
        scope: { experience: g.scope.experience, type: g.scope.type, id: g.scope.id },
        source: g.source,
      })),
    },
    flow: 'operating_core.api',
    required: { key: capKey, scope: { experience: scope.experience, type: scope.scopeType, id: scope.scopeId } },
  })

  return result.ok
}
