import { hasDreamTeamMiEquipoAccess, hasDreamTeamPendientesAccess, hasDreamTeamReadCapability } from './capabilities'
import type { DpsAcceso } from './dps/acceso'
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

// The Dream Team screens, in the order they should appear under the sidebar's
// "Dream Team" parent. All gate on hasDreamTeamReadCapability (see
// app/(auth)/dream-team/mi-equipo/page.tsx, app/(auth)/dream-team/pendientes/page.tsx
// and the two page.tsx files under app/(auth)/admin/dream-team/) — mirrored
// below — except that Mi equipo also opens for a Grupos de Vida director by
// system role and for an area or sub-area coordinator, read-only
// (hasDreamTeamMiEquipoAccess), and Pendientes for that coordinator
// (hasDreamTeamPendientesAccess), who then see those items only. Mi equipo
// stays first: the group itself links there.
export const DREAM_TEAM_NAV_ITEMS: readonly DreamTeamNavItem[] = [
  { id: 'dt-mi-equipo', label: 'Mi equipo', href: '/dream-team/mi-equipo' },
  { id: 'dt-pendientes', label: 'Pendientes', href: '/dream-team/pendientes' },
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

// What a Grupos de Vida director (system role) gets without a read capability:
// Mi equipo alone; an area coordinator (dream_team.coordinate) or whoever
// registers people, Mi equipo and Pendientes. The same items as above.
const DREAM_TEAM_MI_EQUIPO_ONLY: readonly DreamTeamNavItem[] = DREAM_TEAM_NAV_ITEMS.slice(0, 1)
const DREAM_TEAM_MI_EQUIPO_Y_PENDIENTES: readonly DreamTeamNavItem[] = DREAM_TEAM_NAV_ITEMS.slice(0, 2)

// The DPS planning screens (odd/tasks/dps-asistencia-pco.md, T9), after the
// items above. Their facts come from dps_puede_ver / dps_puede_planificar
// (lib/platform/dream-team/dps/acceso.ts), resolved by the (auth) layout.
export const DPS_ASISTENCIA_NAV_ITEM: DreamTeamNavItem = { id: 'dt-dps-asistencia', label: 'Asistencia DPS', href: '/dream-team/dps/asistencia' }
export const DPS_CONFIGURACION_NAV_ITEM: DreamTeamNavItem = {
  id: 'dt-dps-configuracion',
  label: 'Configuración DPS',
  href: '/dream-team/dps/configuracion',
}

/**
 * Whether the menu links the DPS attendance: a planner (who passes it in every
 * team), or someone who sees DPS and coordinates or directs some team. That
 * team may not be a DPS one or may not pass attendance; the page then says
 * there is nothing to mark (dps_asistencia_planilla decides per team).
 */
export function puedeAbrirAsistenciaDps(session: PlatformSession, dps: DpsAcceso): boolean {
  return (
    dps.planificar ||
    (dps.ver && session.capabilities.some((c) => c.key === 'dream_team.coordinate' || c.key === 'dream_team.direct'))
  )
}

function itemsDps(session: PlatformSession, dps: DpsAcceso | undefined): DreamTeamNavItem[] {
  if (!dps) return []
  return [
    ...(puedeAbrirAsistenciaDps(session, dps) ? [DPS_ASISTENCIA_NAV_ITEM] : []),
    ...(dps.planificar ? [DPS_CONFIGURACION_NAV_ITEM] : []),
  ]
}

/**
 * Resolves the Dream Team sidebar items for a session — [] when the flag is
 * off, there is no session, or the session can open none of the screens.
 * A session that passes hasDreamTeamReadCapability gets every item in
 * DREAM_TEAM_NAV_ITEMS order; an area coordinator without a read capability
 * gets Mi equipo and Pendientes, a Grupos de Vida director Mi equipo alone
 * (Servidores and Estructura still need one).
 * Whoever may register new people (`acceso.puedeRegistrar`, the volunteer
 * coordinator of an area, T11) gets Mi equipo and Pendientes too: a fact the session does not carry,
 * computed server-side by the (auth) layout and handed down.
 * The DPS entries (`acceso.dps`, the same layout) go after those, gated by
 * puedeAbrirAsistenciaDps and dps_puede_planificar; without them the result
 * is exactly the one above.
 */
export function getDreamTeamNavItems(
  session: PlatformSession | null | undefined,
  enabled: boolean,
  acceso: { readonly puedeRegistrar?: boolean; readonly dps?: DpsAcceso } = {},
): readonly DreamTeamNavItem[] {
  if (!enabled || !session) return []
  const base = itemsBase(session, acceso.puedeRegistrar === true)
  const dps = itemsDps(session, acceso.dps)
  return dps.length === 0 ? base : [...base, ...dps]
}

function itemsBase(session: PlatformSession, puedeRegistrar: boolean): readonly DreamTeamNavItem[] {
  if (hasDreamTeamReadCapability(session)) return DREAM_TEAM_NAV_ITEMS
  if (hasDreamTeamPendientesAccess(session) || puedeRegistrar) return DREAM_TEAM_MI_EQUIPO_Y_PENDIENTES
  if (hasDreamTeamMiEquipoAccess(session)) return DREAM_TEAM_MI_EQUIPO_ONLY
  return []
}
