import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { PLATFORM_CAPABILITIES, resolvePlatformCapability } from '@/lib/platform/experiences'
import { getDreamTeamFlags } from '@/lib/platform/flags'
import type { PlatformSession } from '@/lib/platform/session/types'

// dream_team.org.manage governs writing the org tree: it is the capability wired into every
// RLS policy and into dream_team_apply_servicio_grants, and it is what a structure admin
// holds. Leaving it out of these lists meant the very person who administers the tree hit
// notFound() on every Dream Team screen. It is scopeType 'experience', so it resolves
// through hasCapability() normally.
const READ_CAPABILITIES = ['dream_team.metrics.read', 'dream_team.requirements.manage', 'dream_team.director.coordinate', 'dream_team.org.manage']
const WRITE_CAPABILITIES = ['dream_team.requirements.manage', 'dream_team.director.coordinate', 'dream_team.org.manage']

// dream_team.direct is scopeType 'equipo'. hasCapability() below resolves capabilities through
// resolvePlatformCapability(), whose normalizeScope() fails closed with reason:'missing' when the
// required scope's type isn't 'experience' and no id is supplied — and this route has no id to
// supply, since it only knows "is this actor an area director of SOME node", not which node. So
// dream_team.direct can never pass hasCapability() and must be checked by mere presence instead.
//
// This is intentional and safe: the route is only a coarse filter ("does this person direct some
// area at all?"). The real per-node scoping lives downstream, in RLS policies and in the
// dream_team_apply_servicio_grants RPC, which both check the actor against the specific equipo
// node being read or written. The route itself never decides which node — it only decides whether
// to let the request through to the layer that does.
const hasScopedCapabilityAnywhere = (session: PlatformSession, key: string) =>
  session.capabilities.some((c) => c.key === key)

export const isDreamTeamEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  getDreamTeamFlags(env).enabled || env.NEXT_PUBLIC_DREAM_TEAM_ENABLED === 'on'

export async function requireDreamTeamSession() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    // Without this, resolveReadOnlyPlatformSession builds no capability lookup at
    // all and returns a session whose capabilities array is silently EMPTY — not
    // an error, just empty, which reads downstream exactly like "this person has
    // no permissions". Every Dream Team gate denied regardless of what the
    // database held.
    capabilitySupabase: supabase,
  })
}

function toActor(session: PlatformSession) {
  return {
    personaId: session.personaId,
    allowedFlows: ['dream_team.api'],
    grants: session.capabilities.map((c) => ({
      key: c.key,
      scope: { experience: c.experience, type: c.scopeType, ...(c.scopeId ? { id: c.scopeId } : {}) },
      source: c.source,
    })),
  }
}

function hasCapability(session: PlatformSession, key: string) {
  const def = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
  if (!def) return false
  return resolvePlatformCapability({
    actor: toActor(session),
    flow: 'dream_team.api',
    required: { key, scope: { experience: def.experience, type: def.scopeType } },
  }).ok
}

// dream_team.direct also gates read: an area director needs to see their own equipo's servicios
// and metrics, and — same reasoning as write below — the actual row-level scoping to their node
// is enforced downstream (RLS / repository queries), not here.
export const hasDreamTeamReadCapability = (session: PlatformSession) =>
  READ_CAPABILITIES.some((key) => hasCapability(session, key)) ||
  hasScopedCapabilityAnywhere(session, 'dream_team.direct')

export const hasDreamTeamWriteCapability = (session: PlatformSession) =>
  WRITE_CAPABILITIES.some((key) => hasCapability(session, key)) ||
  hasScopedCapabilityAnywhere(session, 'dream_team.direct')

export const hasDreamTeamMetricsCapability = (session: PlatformSession) =>
  hasCapability(session, 'dream_team.metrics.read')

// Reshaping the org tree (create, rename, deactivate nodes and roles) is
// RLS-gated on dream_team.org.manage — NOT on the generic write gate. An area
// director passes hasDreamTeamWriteCapability through dream_team.direct, but
// their UPDATE on dream_team_equipos matches zero rows. Gate structure editing
// here so the screen never offers an action the database will always refuse.
export const hasDreamTeamOrgManageCapability = (session: PlatformSession) =>
  hasCapability(session, 'dream_team.org.manage')
