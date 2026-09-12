import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  normalizeLegacyRoles,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import type { Database } from '@/lib/supabase/database.types'
import type { PlatformSession, PlatformSessionPersona } from '@/lib/platform/session/types'

type Usuario = Database['public']['Tables']['usuarios']['Row']

// Mirrors the SUPPORT_CAPABILITIES allowlist in hooks/useCurrentUser.tsx.
// Duplicated rather than imported: this module is server-only (it imports
// lib/supabase/server) and must never be reachable from that client hook —
// see the "must be imported ONLY from the layouts" constraint at the call
// sites. Keep both lists in sync if support capabilities change.
const SUPPORT_CAPABILITIES = ['support.view', 'support.reply', 'support.manage'] as const
type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number]

export interface CurrentUserSnapshot {
  authUserId: string | null
  usuario: Usuario | null
  roles: string[]
  supportCapabilities: string[]
  platformSession: PlatformSession | null
}

const SIGNED_OUT_SNAPSHOT: CurrentUserSnapshot = {
  authUserId: null,
  usuario: null,
  roles: [],
  supportCapabilities: [],
  platformSession: null,
}

type SnapshotSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Server-side counterpart of the sequential client fetch in
 * hooks/useCurrentUser.tsx (getUser → usuarios → obtener_roles_usuario RPC →
 * support_user_capabilities → platformSession). That chain runs entirely on
 * mount in the browser, so every full page load painted the sidebar without
 * roles, support capabilities or the platform session for as long as the
 * whole chain took — hiding every canAccess-gated item (Usuarios, Soporte,
 * Dream Team, ...) until it finally landed.
 *
 * This resolves the exact same shape during SSR so app/(auth)/layout.tsx and
 * app/(pastoral)/layout.tsx can hand CurrentUserProvider an `initial`
 * snapshot: the first paint is already correct, and the client-side fetch in
 * useCurrentUser.tsx keeps running afterward purely as background
 * revalidation.
 *
 * Accepts an already-created Supabase server client so a caller that already
 * built one for something else (branding, in app/(auth)/layout.tsx) can
 * reuse it instead of paying for a second one; omit it and this creates its
 * own, matching the parameterless convention used by requireDreamTeamSession
 * in lib/platform/dream-team/route-access.ts.
 *
 * Must NEVER throw — this feeds a layout's server render. Returns
 * `CurrentUserSnapshot | null`, and the two are NOT interchangeable:
 * `null` means "could not resolve" (an auth.getUser() error, or any other
 * unexpected failure caught below) — the middleware may have already let a
 * genuinely signed-in user through, so returning the signed-out snapshot
 * here would assert something false (no user, no roles) to the first
 * paint instead of simply not having resolved yet. Callers must fall back
 * to their pre-snapshot behaviour on `null` (pass `initial` as `undefined`),
 * not treat it as a signed-out session. Only a real `!user` with no error
 * returns the signed-out snapshot, because that IS authoritative — there is
 * no session to resolve. A failure inside one of the individual
 * usuario/roles/support-capabilities/platform-session queries below (an
 * `error` on the query result, not a throw) still returns a real snapshot
 * with the actual authUserId and just that field left empty: "signed in,
 * nothing resolved yet" is true there, and the client-side background
 * revalidation in CurrentUserProvider fills it in.
 *
 * Round-trip shape: getUser() → usuarios select → ONE parallel stage with
 * the roles RPC, the platform session and support_user_capabilities
 * together. The platform session is fed a findPersonaByAuthId that reuses
 * the usuarios row already fetched above (see toSnapshotPlatformPersona
 * below, mirroring toClientPlatformPersona in hooks/useCurrentUser.tsx)
 * instead of findPlatformSessionPersonaByAuthId re-querying the exact same
 * row by auth_id — that fallback only fires when the row is missing or
 * (defensively) mismatched.
 */
export async function resolveCurrentUserSnapshot(
  supabaseClient?: SnapshotSupabaseClient
): Promise<CurrentUserSnapshot | null> {
  try {
    const supabase = supabaseClient ?? (await createSupabaseServerClient())
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // authError means the auth lookup itself failed — that is not proof of
    // being signed out, so this must NOT return the signed-out snapshot
    // (see the "null" paragraph above). It falls through to the outer catch
    // handling via an explicit early return instead, kept separate from the
    // `!user` check below so the two cases can never be conflated again.
    if (authError) return null
    if (!user) return SIGNED_OUT_SNAPSHOT

    // The usuario row is fetched first (not folded into the Promise.all
    // below) specifically so its result can be handed to the platform
    // session as an already-resolved persona — see toSnapshotPlatformPersona
    // below. Querying it separately here, instead of letting
    // resolveReadOnlyPlatformSession's own persona lookup re-select the same
    // row by auth_id, is what collapses that would-be extra round trip.
    const usuarioResult = await supabase.from('usuarios').select('*').eq('auth_id', user.id).maybeSingle()
    const usuario = usuarioResult.error ? null : usuarioResult.data ?? null

    // The legacy roles RPC, the platform session and support_user_capabilities
    // are independent of one another once the usuario row above is known —
    // resolving them with Promise.all (instead of the client hook's fully
    // sequential chain) is the entire point of this module.
    const [rolesResult, platformSessionBase, supportResult] = await Promise.all([
      supabase.rpc('obtener_roles_usuario', { p_auth_id: user.id }),
      resolveReadOnlyPlatformSession({
        subjectAuthId: user.id,
        findPersonaByAuthId: async (authId) => {
          // Reuse the usuario row already fetched above when it matches —
          // this is the only reason usuarios was queried ahead of this
          // Promise.all instead of inside it. Falls back to the real lookup
          // (one more round trip) only when the row is missing or, as a
          // defensive check mirroring toClientPlatformPersona in
          // hooks/useCurrentUser.tsx, its auth_id doesn't match.
          const persona = toSnapshotPlatformPersona(usuario, authId)
          if (persona) return persona
          return findPlatformSessionPersonaByAuthId(supabase, authId)
        },
        // Without this, resolveReadOnlyPlatformSession builds no capability
        // lookup at all and the session comes back with an EMPTY
        // capabilities array — not an error, just silently empty. See the
        // identical note on requireDreamTeamSession in
        // lib/platform/dream-team/route-access.ts.
        capabilitySupabase: supabase,
      }),
      // support_user_capabilities is keyed by usuario.id (not auth_id).
      // Skip the query entirely (rather than issuing and discarding it)
      // when there is no linked usuario to key it by.
      usuario?.id
        ? supabase.from('support_user_capabilities').select('capability').eq('usuario_id', usuario.id).is('revoked_at', null)
        : Promise.resolve({ data: [] as { capability: string }[], error: null }),
    ])

    const roles = rolesResult.error ? [] : normalizeLegacyRoles(rolesResult.data)

    let supportCapabilities: string[] = []
    if (!supportResult.error && supportResult.data) {
      supportCapabilities = supportResult.data
        .map((row: { capability: string }) => row.capability)
        .filter((capability): capability is SupportCapability =>
          SUPPORT_CAPABILITIES.includes(capability as SupportCapability)
        )
    }

    // resolveReadOnlyPlatformSession only stamps globalRoles from whatever
    // it is handed at call time. Roles resolved concurrently above (not
    // before it was called), so attach the real roles onto the session here
    // instead of threading them through the parallel call.
    const platformSession = platformSessionBase
      ? { ...platformSessionBase, globalRoles: [...roles] }
      : null

    return { authUserId: user.id, usuario, roles, supportCapabilities, platformSession }
  } catch {
    // An unexpected failure (a rejected query, a thrown error) is not proof
    // the user is signed out either — same reasoning as the authError case
    // above. `null` tells the caller "unresolved", not "signed out".
    return null
  }
}

// Mirrors toClientPlatformPersona in hooks/useCurrentUser.tsx: turns the
// usuarios row already fetched by resolveCurrentUserSnapshot into a
// PlatformSessionPersona, without a second query, whenever its auth_id
// matches. Returns null (letting the caller fall back to
// findPlatformSessionPersonaByAuthId) when there is no linked row or, as a
// defensive check, its auth_id doesn't match the id being looked up.
function toSnapshotPlatformPersona(usuario: Usuario | null, authId: string): PlatformSessionPersona | null {
  if (!usuario?.id || usuario.auth_id !== authId) return null
  return { id: usuario.id, authId: usuario.auth_id }
}
