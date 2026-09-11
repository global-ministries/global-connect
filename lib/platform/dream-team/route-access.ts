import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { getDreamTeamFlags } from '@/lib/platform/flags'

// The capability gates below moved to capabilities.ts — they touch nothing
// server-only, so a client component (the desktop sidebar) can import them
// directly without pulling in createSupabaseServerClient. Re-exported here
// so existing callers of this module are unaffected.
export {
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  hasDreamTeamMetricsCapability,
  hasDreamTeamOrgManageCapability,
} from './capabilities'

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
