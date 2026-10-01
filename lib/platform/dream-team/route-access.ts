import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  normalizeLegacyRoles,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
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
  hasDreamTeamMiEquipoAccess,
  isGdvDirectorSession,
} from './capabilities'

export const isDreamTeamEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  getDreamTeamFlags(env).enabled || env.NEXT_PUBLIC_DREAM_TEAM_ENABLED === 'on'

/**
 * The server session of the caller, with their Dream Team capabilities.
 *
 * `globalRoles` stays EMPTY unless `includeRoles` is passed: the roles cost one
 * extra RPC and only /dream-team/mi-equipo needs them (a Grupos de Vida director
 * opens it by system role, see hasDreamTeamMiEquipoAccess). Every other caller
 * is gated on capabilities alone and keeps its session and its round trips as
 * they were. A failed role lookup yields no roles (the director rule then simply
 * does not apply), never an error.
 */
export async function requireDreamTeamSession({ includeRoles = false }: { includeRoles?: boolean } = {}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  let globalRoles: string[] | undefined
  if (includeRoles) {
    const { data: roles, error: rolesError } = await supabase.rpc('obtener_roles_usuario', { p_auth_id: user.id })
    globalRoles = rolesError ? [] : normalizeLegacyRoles(roles)
  }

  return resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    // Without this, resolveReadOnlyPlatformSession builds no capability lookup at
    // all and returns a session whose capabilities array is silently EMPTY — not
    // an error, just empty, which reads downstream exactly like "this person has
    // no permissions". Every Dream Team gate denied regardless of what the
    // database held.
    capabilitySupabase: supabase,
    globalRoles,
  })
}
