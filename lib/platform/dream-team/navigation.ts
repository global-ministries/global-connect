import { hasDreamTeamReadCapability, isGdvDirectorSession } from './capabilities'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * Dream Team — client-safe navigation items.
 *
 * Powers the desktop sidebar's "Dream Team" entry. Only depends on
 * capabilities.ts (pure) and the literal env read below, so it is safe to
 * import from a client component — unlike route-access.ts, which pulls in
 * createSupabaseServerClient (server-only, uses next/headers).
 */

export type DreamTeamNavItem = {
  id: string
  label: string
  href: string
}

// The three Dream Team screens, in the order they should appear under the
// sidebar's "Dream Team" parent. All three gate on hasDreamTeamReadCapability
// (see app/(auth)/dream-team/mi-equipo/page.tsx and the two page.tsx files
// under app/(auth)/admin/dream-team/) — mirrored below — except that Mi equipo
// also opens for a Grupos de Vida director by system role
// (hasDreamTeamMiEquipoAccess), who then sees that one item only.
export const DREAM_TEAM_NAV_ITEMS: readonly DreamTeamNavItem[] = [
  { id: 'dt-mi-equipo', label: 'Mi equipo', href: '/dream-team/mi-equipo' },
  { id: 'dt-servidores', label: 'Servidores', href: '/admin/dream-team/servidores' },
  { id: 'dt-estructura', label: 'Estructura', href: '/admin/dream-team/estructura' },
]

/**
 * Client-safe reader for the Dream Team flag.
 *
 * MUST read `process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED` as a literal member
 * expression, not through an indirection. Next.js's client bundler only
 * inlines `process.env.NEXT_PUBLIC_*` when it can statically see that exact
 * expression at build time — it does not evaluate through a variable like
 * `env.NEXT_PUBLIC_DREAM_TEAM_ENABLED` where `env` was passed in as
 * `process.env` at the call site. That is exactly the shape of
 * isDreamTeamEnabled(env = process.env) in route-access.ts: it works for
 * server callers (real process.env, read at runtime) but always resolves to
 * `false` in the browser bundle, since nothing gets inlined and the browser
 * has no `process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED` at all. Accepts the
 * same two truthy values as isDreamTeamEnabled: 'true' (getDreamTeamFlags'
 * own check, see lib/platform/flags.ts) and 'on' (the extra OR branch in
 * route-access.ts). See __tests__/lib/platform/dream-team/navigation.test.ts
 * for the parity test against isDreamTeamEnabled.
 */
export function isDreamTeamEnabledClient(): boolean {
  const value = process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
  return value === 'true' || value === 'on'
}

// What a Grupos de Vida director (system role, no capability) gets: Mi equipo
// alone. Same id, label and href as the first of the three items above.
const DREAM_TEAM_MI_EQUIPO_ONLY: readonly DreamTeamNavItem[] = DREAM_TEAM_NAV_ITEMS.slice(0, 1)

/**
 * Resolves the Dream Team sidebar items for a session — [] when the flag is
 * off, there is no session, or the session can open none of the screens.
 * A session that passes hasDreamTeamReadCapability gets the three items in
 * DREAM_TEAM_NAV_ITEMS order; a Grupos de Vida director without a capability
 * gets Mi equipo alone (Servidores and Estructura still need a capability).
 * So does whoever may register new people (`acceso.puedeRegistrar`, the
 * volunteer coordinator of an area, T11): a fact the session does not carry,
 * computed server-side by the (auth) layout and handed down.
 */
export function getDreamTeamNavItems(
  session: PlatformSession | null | undefined,
  enabled: boolean,
  acceso: { readonly puedeRegistrar?: boolean } = {},
): readonly DreamTeamNavItem[] {
  if (!enabled || !session) return []
  if (hasDreamTeamReadCapability(session)) return DREAM_TEAM_NAV_ITEMS
  if (isGdvDirectorSession(session) || acceso.puedeRegistrar === true) return DREAM_TEAM_MI_EQUIPO_ONLY
  return []
}
