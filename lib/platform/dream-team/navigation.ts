import { hasDreamTeamReadCapability } from './capabilities'
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
// under app/(auth)/admin/dream-team/) — mirrored below.
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

/**
 * Resolves the Dream Team sidebar items for a session — [] when the flag is
 * off, there is no session, or the session cannot read any of the three
 * screens (all three share hasDreamTeamReadCapability, see the module doc
 * above), otherwise the three items in DREAM_TEAM_NAV_ITEMS order.
 */
export function getDreamTeamNavItems(
  session: PlatformSession | null | undefined,
  enabled: boolean,
): readonly DreamTeamNavItem[] {
  if (!enabled || !session) return []
  if (!hasDreamTeamReadCapability(session)) return []
  return DREAM_TEAM_NAV_ITEMS
}
