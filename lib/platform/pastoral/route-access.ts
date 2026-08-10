/**
 * W06 — DT-037+ — Pastoral route access helpers.
 *
 * Mirrors dream-team/route-access.ts and operating-core/route-access.ts patterns.
 *
 * Lessons from W02-W05:
 * - Use auth.uid() directly, NOT public.current_persona_id()
 * - Policy names must be unique (sufijos _select, _update, etc.)
 * - For untyped Supabase methods like .exists(), use `as any` only when necessary
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { PLATFORM_CAPABILITIES } from '@/lib/platform/experiences'
import type { PlatformSession } from '@/lib/platform/session/types'
import { isPastoralEnabled } from './flags'

// ─── Capability sets ───────────────────────────────────────────────────────────

const ONE_ON_ONE_READ = ['pastoral.one_on_one.read', 'pastoral.read.all'] as const
const ONE_ON_ONE_WRITE = ['pastoral.one_on_one.create', 'pastoral.read.all'] as const
const ONE_ON_ONE_NOTES = ['pastoral.one_on_one.write_notes', 'pastoral.read.all'] as const
const ONE_ON_ONE_VALIDATE = ['pastoral.one_on_one.validate_step', 'pastoral.read.all'] as const
const ONE_ON_ONE_COMPLETE = ['pastoral.one_on_one.complete', 'pastoral.read.all'] as const

// ─── Flag check ───────────────────────────────────────────────────────────────

/**
 * Returns true when pastoral features are enabled.
 * Honors killSwitch: if killSwitch is on, pastoral is disabled.
 */
export const isPastoralRouteEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  return isPastoralEnabled(env)
}

// ─── Session ─────────────────────────────────────────────────────────────────

/**
 * Resolves the platform session for the authenticated user.
 * Returns null if not authenticated.
 */
export async function requirePastoralSession() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
}

// ─── Actor adapter ────────────────────────────────────────────────────────────

function toActor(session: PlatformSession) {
  return {
    personaId: session.personaId,
    allowedFlows: ['pastoral.api'],
    grants: session.capabilities.map((c) => ({
      key: c.key,
      scope: { experience: c.experience, type: c.scopeType, ...(c.scopeId ? { id: c.scopeId } : {}) },
      source: c.source,
    })),
  }
}

// ─── Generic capability checker ─────────────────────────────────────────────────
//
// "Does this session have AT LEAST ONE grant that covers the (experience,
// scopeType) shape of this capability?" — equivalent to "can the user
// act on some record of this type" without specifying which one.
//
// The upstream resolvePlatformCapability() rejects the required scope when
// `scope.id` is missing on a non-experience scopeType (it requires an
// id, since otherwise it cannot compute an exact-match signature). For the
// generic "can they do X?" question we don't need exact id match — we
// just need to confirm a grant exists for the same experience+scopeType
// shape. We do that directly here and skip the resolver.

function hasCapability(session: PlatformSession, key: string): boolean {
  const def = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
  if (!def) return false
  const needExp = def.experience
  const needType = def.scopeType
  return session.capabilities.some((grant) => {
    if (grant.key !== key) return false
    if (grant.experience !== needExp) return false
    if (grant.scopeType !== needType) return false
    return true
  })
}

// ─── Specific capability predicates ───────────────────────────────────────────

/**
 * Check if actor can read pastoral 1:1 records.
 * pastoral.read.all grants read to everything; specific read capability is also checked.
 */
export function hasPastoralOneOnOneReadCapability(session: PlatformSession): boolean {
  return (ONE_ON_ONE_READ as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can create pastoral 1:1 records.
 */
export function hasPastoralOneOnOneWriteCapability(session: PlatformSession): boolean {
  return (ONE_ON_ONE_WRITE as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can write notes on pastoral 1:1 records.
 * Separation of read vs write per P5: pastoral.read.all does NOT grant write_notes.
 */
export function hasPastoralOneOnOneNotesCapability(session: PlatformSession): boolean {
  return (ONE_ON_ONE_NOTES as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can validate steps on pastoral 1:1 records.
 * Per P5: pastoral.read.all does NOT grant validate_step (separate explicit grant required).
 */
export function hasPastoralOneOnOneValidateCapability(session: PlatformSession): boolean {
  return (ONE_ON_ONE_VALIDATE as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can complete pastoral 1:1 records.
 */
export function hasPastoralOneOnOneCompleteCapability(session: PlatformSession): boolean {
  return (ONE_ON_ONE_COMPLETE as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor has pastoral.read.all capability.
 * Used for full-read access to all pastoral records.
 */
export function hasPastoralReadAllCapability(session: PlatformSession): boolean {
  return hasCapability(session, 'pastoral.read.all')
}

// W10 — DT-060: Mentor cascade resolve capability
const MENTOR_CASCADE_RESOLVE = ['pastoral.mentor.cascade.resolve', 'pastoral.read.all'] as const

/**
 * Check if actor can resolve mentor cascade for a persona.
 * pastoral.mentor.cascade.resolve or pastoral.read.all.
 */
export function hasPastoralMentorCascadeResolveCapability(session: PlatformSession): boolean {
  return (MENTOR_CASCADE_RESOLVE as readonly string[]).some((key) => hasCapability(session, key))
}

// W09 — DT-055: Crisis detect capability
const CRISIS_DETECT = ['pastoral.crisis.detect', 'pastoral.read.all'] as const

/**
 * Check if actor can trigger crisis scan on a pastoral 1:1.
 * pastoral.crisis.detect or pastoral.read.all.
 */
export function hasPastoralCrisisDetectCapability(session: PlatformSession): boolean {
  return (CRISIS_DETECT as readonly string[]).some((key) => hasCapability(session, key))
}

// W08 — DT-040, DT-041, DT-044: Tríada capabilities
const TRIADA_READ = ['pastoral.triada.read', 'pastoral.read.all'] as const
const TRIADA_CREATE = ['pastoral.triada.create', 'pastoral.read.all'] as const
const TRIADA_NOTES = ['pastoral.triada.write_notes', 'pastoral.read.all'] as const
const TRIADA_DISBAND = ['pastoral.triada.disband', 'pastoral.read.all'] as const

/**
 * Check if actor can read pastoral tríada records.
 * pastoral.triada.read or pastoral.read.all.
 */
export function hasPastoralTriadaReadCapability(session: PlatformSession): boolean {
  return (TRIADA_READ as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can create pastoral tríada records.
 * pastoral.triada.create or pastoral.read.all.
 */
export function hasPastoralTriadaCreateCapability(session: PlatformSession): boolean {
  return (TRIADA_CREATE as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can write notes on pastoral tríada records.
 * Separation of read vs write per P5: pastoral.read.all does NOT grant write_notes.
 */
export function hasPastoralTriadaNotesCapability(session: PlatformSession): boolean {
  return (TRIADA_NOTES as readonly string[]).some((key) => hasCapability(session, key))
}

/**
 * Check if actor can disband pastoral tríada records.
 * pastoral.triada.disband or pastoral.read.all.
 */
export function hasPastoralTriadaDisbandCapability(session: PlatformSession): boolean {
  return (TRIADA_DISBAND as readonly string[]).some((key) => hasCapability(session, key))
}

// W12 — DT-069: Pastoral metrics read capability
const METRICS_READ = ['pastoral.metrics.read', 'pastoral.read.all'] as const

/**
 * Check if actor can read pastoral metrics dashboard cards.
 * pastoral.metrics.read or pastoral.read.all.
 */
export function hasPastoralMetricsReadCapability(session: PlatformSession): boolean {
  return (METRICS_READ as readonly string[]).some((key) => hasCapability(session, key))
}

// W17 — DT-001: Pastoral admin manage capability
const ADMIN_MANAGE = ['pastoral.admin.manage', 'pastoral.read.all'] as const

/**
 * Check if actor can manage pastoral admin grants.
 * pastoral.admin.manage or pastoral.read.all.
 */
export function hasPastoralAdminManageCapability(session: PlatformSession): boolean {
  return (ADMIN_MANAGE as readonly string[]).some((key) => hasCapability(session, key))
}
