// Generic longitudinal participation contract.
//
// Pure module. No DB, no filesystem, no env vars, no `@/lib/supabase/*` imports.
// Mirrors the precedent set by `lib/platform/family.ts` (taxonomy + helpers) and
// `lib/platform/preflight.ts` (discriminated-union guard). Reusable by future
// adapters (Phase 6 grants audit, Operating Core) without further changes here.

// ── Event type taxonomy ─────────────────────────────────────────────
export const PLATFORM_PARTICIPATION_EVENT_TYPES = [
  'attendance',
  'service',
  'taller_participation',
  'group_join',
  'group_leave',
  'family_consent',
  'contact_authorization',
] as const

export type PlatformParticipationEventType = (typeof PLATFORM_PARTICIPATION_EVENT_TYPES)[number]

// ── Sensitivity classification ─────────────────────────────────────
export const PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS = [
  'public',
  'internal',
  'sensitive',
] as const

export type PlatformParticipationEventSensitivity =
  (typeof PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS)[number]

// ── Retention policy (structured object, NOT a free-form string) ──
export type PlatformParticipationRetention = {
  /** Minimum days the event MUST be retained. Pending legal review. */
  minDays: number
  /** Maximum days the event MAY be retained before anonymization/purge. Pending legal review. */
  maxDays: number
  /** True when the type cannot be retained without explicit consent. */
  requiresExplicitConsentToRetain: boolean
}

// ── Scope ──────────────────────────────────────────────────────────
export type PlatformParticipationEventScope = {
  experience: string
  scopeType: string
  scopeId?: string
}

// ── Event contract (mirrors design.md L60-69 with stricter types) ──
export type PlatformParticipationEvent = {
  eventType: PlatformParticipationEventType
  source: string
  occurredAt: Date
  scope: PlatformParticipationEventScope
  actorPersonaId?: string
}

// ── Per-type lookup maps (single source of truth) ──────────────────
/**
 * Default sensitivity classification per event type.
 *
 * The `family_consent` and `contact_authorization` types are `sensitive`;
 * the remaining five types are `internal` (visible to scoped capabilities
 * but not exposed publicly). Update this map if a future event type is
 * introduced.
 */
export const PLATFORM_PARTICIPATION_SENSITIVITY: Record<
  PlatformParticipationEventType,
  PlatformParticipationEventSensitivity
> = {
  attendance: 'internal',
  service: 'internal',
  taller_participation: 'internal',
  group_join: 'internal',
  group_leave: 'internal',
  family_consent: 'sensitive',
  contact_authorization: 'sensitive',
} as const

/**
 * Default retention policy per event type.
 *
 * NOTE: pending legal review. These are starting values and may change
 * once legal counsel reviews data retention requirements for the platform.
 * Operating Core / Phase 6 must validate against actual legal/audit
 * requirements before any DB schema uses these values.
 */
export const PLATFORM_PARTICIPATION_RETENTION: Record<
  PlatformParticipationEventType,
  PlatformParticipationRetention
> = {
  attendance: { minDays: 365, maxDays: 730, requiresExplicitConsentToRetain: false },
  service: { minDays: 365, maxDays: 1095, requiresExplicitConsentToRetain: false },
  taller_participation: { minDays: 180, maxDays: 730, requiresExplicitConsentToRetain: false },
  group_join: { minDays: 365, maxDays: 1825, requiresExplicitConsentToRetain: false },
  group_leave: { minDays: 365, maxDays: 1825, requiresExplicitConsentToRetain: false },
  family_consent: { minDays: 90, maxDays: 730, requiresExplicitConsentToRetain: true },
  contact_authorization: { minDays: 90, maxDays: 730, requiresExplicitConsentToRetain: true },
} as const

// ── Capability shape (generic; not bound to PlatformCapabilityKey) ─
export type PlatformParticipationCapability = {
  key: string
  experience: string
  scopeType: string
  scopeId?: string
  source: string
}

// ── Read guard ─────────────────────────────────────────────────────
export type PlatformParticipationReadActor = {
  personaId: string
}

export type PlatformParticipationReadResult =
  | { allowed: true; reason: 'self' | 'scoped_capability' | 'system_audit' }
  | {
      allowed: false
      reason: 'no_event' | 'no_actor' | 'insufficient_scope' | 'sensitive_no_capability'
    }

export type PlatformParticipationReadInput = {
  actor: PlatformParticipationReadActor | null | undefined
  event: PlatformParticipationEvent | null | undefined
  capabilities: readonly PlatformParticipationCapability[]
}

/**
 * Decide whether an actor may read a single participation event.
 *
 * Pure function. Same inputs → same result. Returns a discriminated union
 * so callers can branch on `result.allowed` and `result.reason` without
 * ever echoing the event payload on denial (the spec requires that
 * denial of sensitive-event reads must not reveal existence).
 *
 * Precedence:
 *   1. `event` null/undefined → `{ allowed: false, reason: 'no_event' }`.
 *   2. `actor` null/undefined or blank `personaId` → `{ allowed: false, reason: 'no_actor' }`.
 *   3. `event.actorPersonaId === actor.personaId` → `{ allowed: true, reason: 'self' }`.
 *   4. `PLATFORM_PARTICIPATION_SENSITIVITY[event.eventType] === 'sensitive'`:
 *      - a matching capability (see match rule below) → `{ allowed: true, reason: 'scoped_capability' }`.
 *      - otherwise → `{ allowed: false, reason: 'sensitive_no_capability' }`.
 *   5. Non-sensitive events: a matching capability → `{ allowed: true, reason: 'scoped_capability' }`.
 *      Otherwise → `{ allowed: false, reason: 'insufficient_scope' }`.
 *
 * `system_audit` is in the allowed-reason union as forward-compatibility
 * for Fase 6 grants audit (a system-audit capability will produce it).
 * This function never returns `system_audit` today because no such
 * capability exists yet — no test in this slice asserts it.
 *
 * Capability match rule (used in steps 4 and 5):
 *   same `experience` AND same `scopeType` AND
 *   (both `scopeId` undefined OR both `scopeId` strictly equal).
 *
 * Strict equality — no wildcard broadening:
 *   - When `event.scopeId` is defined: `capability.scopeId` MUST equal
 *     `event.scopeId`.
 *   - When `event.scopeId` is undefined: `capability.scopeId` MUST also
 *     be undefined (a capability with `scopeId` set does NOT match an
 *     event without `scopeId`, and a capability with `scopeId` undefined
 *     does NOT serve as a wildcard for events with a defined `scopeId`).
 */
export function canReadPlatformParticipationEvent(
  params: PlatformParticipationReadInput,
): PlatformParticipationReadResult {
  const { actor, event, capabilities } = params

  if (!event) return { allowed: false, reason: 'no_event' }

  if (!actor || !actor.personaId || actor.personaId.trim() === '') {
    return { allowed: false, reason: 'no_actor' }
  }

  if (event.actorPersonaId === actor.personaId) {
    return { allowed: true, reason: 'self' }
  }

  const matchingCapability = capabilities.find((capability) =>
    capabilityMatchesEvent(capability, event.scope),
  )

  if (matchingCapability) {
    return { allowed: true, reason: 'scoped_capability' }
  }

  if (PLATFORM_PARTICIPATION_SENSITIVITY[event.eventType] === 'sensitive') {
    return { allowed: false, reason: 'sensitive_no_capability' }
  }

  return { allowed: false, reason: 'insufficient_scope' }
}

function capabilityMatchesEvent(
  capability: PlatformParticipationCapability,
  scope: PlatformParticipationEventScope,
): boolean {
  if (capability.experience !== scope.experience) return false
  if (capability.scopeType !== scope.scopeType) return false
  if (scope.scopeId === undefined) {
    return capability.scopeId === undefined
  }
  return capability.scopeId === scope.scopeId
}

// ── Repository (read-only, future adapter contract) ────────────────
/**
 * Read-only data-provider contract for participation events.
 *
 * Pure contract: no DB, no env, no `@/lib/supabase/*` imports here — only the
 * data shape that future adapters (in-memory, Supabase, audit) MUST satisfy.
 *
 * The repository ONLY returns events. It is NOT an authorization gate:
 * `canReadPlatformParticipationEvent` still performs every read-boundary
 * decision (separation of concerns). An adapter that returns events does not
 * imply the caller may read them — the guard remains the single source of
 * authorization truth.
 */
export type PlatformParticipationReadRepository = {
  findEventsByActorPersonaId(personaId: string): Promise<readonly PlatformParticipationEvent[]>
  findEventsByScope(params: {
    experience: string
    scopeType: string
    scopeId?: string
  }): Promise<readonly PlatformParticipationEvent[]>
}
