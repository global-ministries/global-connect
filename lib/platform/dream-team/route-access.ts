import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { PLATFORM_CAPABILITIES, resolvePlatformCapability } from '@/lib/platform/experiences'
import { getDreamTeamFlags } from '@/lib/platform/flags'
import type { PlatformSession } from '@/lib/platform/session/types'

const READ_CAPABILITIES = ['dream_team.metrics.read', 'dream_team.requirements.manage', 'dream_team.director.coordinate']
const WRITE_CAPABILITIES = ['dream_team.requirements.manage', 'dream_team.director.coordinate']

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
