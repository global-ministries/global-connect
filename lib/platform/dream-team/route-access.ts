import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { PLATFORM_CAPABILITIES, resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformSession } from '@/lib/platform/session/types'

const READ_CAPABILITIES = ['dream_team.metrics.read', 'dream_team.requirements.manage', 'dream_team.director.coordinate']
const WRITE_CAPABILITIES = ['dream_team.requirements.manage', 'dream_team.director.coordinate']

export const isDreamTeamEnabled = () => process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED === 'on'

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

export const hasDreamTeamReadCapability = (session: PlatformSession) =>
  READ_CAPABILITIES.some((key) => hasCapability(session, key))

export const hasDreamTeamWriteCapability = (session: PlatformSession) =>
  WRITE_CAPABILITIES.some((key) => hasCapability(session, key))
