
import {
  findPlatformSessionPersonaByAuthId,
  normalizeLegacyRoles,
  resolveReadOnlyPlatformSession,
  toAuthBaseSupabaseClient,
  type AuthBaseSupabaseClient,
} from '@/lib/auth/platformSessionReadOnly'
import type { PlatformSession } from '@/lib/platform/session/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type UserWithRolesResult = {
  user: { id: string; email?: string }
  roles: string[]
  platformSession: PlatformSession | null
}

export function getUserWithRoles(supabase: SupabaseClient): Promise<UserWithRolesResult | null>
export function getUserWithRoles(supabase: AuthBaseSupabaseClient): Promise<UserWithRolesResult | null>
export async function getUserWithRoles(supabase: SupabaseClient | AuthBaseSupabaseClient): Promise<UserWithRolesResult | null> {
  const authBaseSupabase = toAuthBaseSupabaseClient(supabase)
  const { data: { user }, error: errorUser } = await authBaseSupabase.auth.getUser();
  if (errorUser || !user) return null;

  // Usa la instancia recibida para la función RPC
  const { data: rolesData, error: errorRoles } = await authBaseSupabase.rpc("obtener_roles_usuario", { p_auth_id: user.id });
  const roles = errorRoles || !rolesData ? [] : normalizeLegacyRoles(rolesData)
  const platformSession = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(authBaseSupabase, authId),
    globalRoles: roles,
  })

  return { user, roles, platformSession };
}
