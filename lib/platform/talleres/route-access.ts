/**
 * PR1 — DT-002 — Talleres route access helpers.
 * Sibling to lib/platform/pastoral/route-access.ts pattern.
 *
 * PR17 — DT-070 — `getTalleresNavItems(sessionCapabilities)` helper for
 * the talleres sub-items menu (UI / navigation, design §9). Multi-role
 * users see the union of inherited sub-items.
 *
 * PR25 — Added admin-only sub-item `talleres_admin_abstracto` so users
 * with `talleres_crecimiento.admin.manage` (and no other talleres cap)
 * still see a meaningful entry in the sub-menu pointing at the wizard
 * entry-point (`/admin/talleres/abstracto`).
 */

import {
  isRouteAccessDenied,
  isRouteNotFound,
  isFlagDisabled,
  type RouteAccessError,
} from './errors'
import { isTalleresEnabled } from './flags'
import { PLATFORM_CAPABILITIES, type PlatformCapabilityKey } from '@/lib/platform/experiences'

/**
 * Checks if the user has access to talleres routes based on capabilities.
 *
 * Returns void if access is granted, throws RouteAccessError if denied.
 */
export function assertTalleresRouteAccess(params: {
  sessionCapabilities: string[]
  requiredCapabilities?: string[]
  isEnabled?: boolean
  routeExists?: boolean
}): void {
  const { sessionCapabilities, requiredCapabilities, isEnabled = true, routeExists = true } = params

  if (!isEnabled) {
    throw {
      code: 'FLAG_DISABLED' as const,
      message: 'Talleres feature flag is disabled',
    } satisfies RouteAccessError
  }

  if (!routeExists) {
    throw {
      code: 'ROUTE_NOT_FOUND' as const,
      message: 'Talleres route does not exist',
    } satisfies RouteAccessError
  }

  if (requiredCapabilities && requiredCapabilities.length > 0) {
    const hasCapability = requiredCapabilities.some((cap) =>
      sessionCapabilities.includes(cap),
    )
    if (!hasCapability) {
      throw {
        code: 'ROUTE_ACCESS_DENIED' as const,
        message: 'Missing required capability for Talleres route access',
        context: { requiredCapabilities },
      } satisfies RouteAccessError
    }
  }
}

/**
 * Returns whether the user can access talleres routes based on capabilities.
 */
export function canAccessTalleres(params: {
  sessionCapabilities: string[]
  requiredCapabilities?: string[]
  isEnabled?: boolean
}): boolean {
  const { sessionCapabilities, requiredCapabilities, isEnabled = true } = params

  if (!isEnabled) return false

  if (!requiredCapabilities || requiredCapabilities.length === 0) return true

  return requiredCapabilities.some((cap) => sessionCapabilities.includes(cap))
}

export { isRouteAccessDenied, isRouteNotFound, isFlagDisabled }
export type { RouteAccessError }

// ─── T1 — canonical capability list ────────────────────────────────────────
//
// odd/tasks/talleres-consolidar-pantallas.md, T0: the old
// lib/platform/talleres/capabilities.ts (a dead module — no importer
// outside its own cluster/tests) hard-coded this same 13-key array by
// hand. Rather than resurrect it, this derives the list LIVE from
// lib/platform/experiences.ts's PLATFORM_CAPABILITIES — the actual
// registry every capability grant is validated against — so it can never
// drift from what's really registered.

export type TalleresCapabilityKey = Extract<PlatformCapabilityKey, `talleres_crecimiento.${string}`>

export const TALLERES_CAPABILITY_KEYS: readonly TalleresCapabilityKey[] = (
  Object.keys(PLATFORM_CAPABILITIES) as PlatformCapabilityKey[]
).filter((key): key is TalleresCapabilityKey => key.startsWith('talleres_crecimiento.'))

// ─── PR17 — DT-070 — Navigation sub-items ──────────────────────────────────

/**
 * Sub-item identifier for the talleres navigation menu. Stable strings
 * for the rendering layer; routes use these as `id` keys.
 */
export type TalleresNavItemId =
  // Participante
  | 'talleres_participante_explorar'
  // T9 (odd/tasks/talleres-consolidar-pantallas.md) — mis_talleres/
  // historial/certificados merge into this one id. See
  // TALLERES_NAV_ITEMS's own comment below.
  | 'talleres_participante_mi_recorrido'
  // T6 (odd/tasks/talleres-consolidar-pantallas.md) — the coordinator's
  // cross-taller inbox. Shared by coordinador AND director, so it cannot
  // key off either role's own `.read` capability alone without hiding it
  // from the other. See its `requiredCapability` below for why.
  | 'talleres_pendientes'
  // T7 (odd/tasks/talleres-consolidar-pantallas.md) — the consolidated
  // reportes list. Shared by coordinador AND director, so
  // it is keyed to metrics.read for the exact same reason as
  // talleres_pendientes above: it is the one capability both mutually-
  // exclusive roles are auto-granted.
  | 'talleres_reportes'
  // T8 (odd/tasks/talleres-consolidar-pantallas.md) — the consolidated
  // /talleres/temporadas list, a straight move out of /admin.
  | 'talleres_temporadas'

export type TalleresNavItem = Readonly<{
  id: TalleresNavItemId
  label: string
  href: string
  /**
   * The capability required to see this item, or `null` when the item is
   * open to ANY authenticated user (odd/tasks/talleres-autoinscripcion.md,
   * acceptance criterion 7 — the participant items must be reachable by a
   * member with zero talleres capabilities). `null` is an explicit marker,
   * not a magic string, so `getTalleresNavItems` never has to compare
   * against a sentinel capability key.
   */
  requiredCapability: string | null
}>

interface NavItemSpec {
  readonly id: TalleresNavItemId
  readonly label: string
  readonly href: string
  readonly requiredCapability: string | null
}

/**
 * Master sub-item table. The renderer filters this list against the
 * user's capability set. Order within a role group is preserved so the
 * UI renders in a deterministic order.
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — this used to carry
 * every role-prefixed old item (Coordinación, Dirección, the líder's
 * Mis Grupos/Próximas Sesiones, the admin wizard) alongside the new
 * consolidated ones, since the old screens stayed reachable by direct
 * URL until this task. T10 deletes every old screen, so this table now
 * holds ONLY the ~5 items backing the approved ~12-route tree — the
 * URL no longer encodes the role (docs/talleres-de-punta-a-punta.md §9).
 */
export const TALLERES_NAV_ITEMS: readonly NavItemSpec[] = [
  // P — Participante. requiredCapability: null — odd/tasks/talleres-
  // autoinscripcion.md acceptance criterion 7: any authenticated member,
  // with zero talleres capabilities, must see "Para Mí" and reach these
  // pages. The pages themselves no longer require participation.read
  // either (lib/platform/talleres/participante.ts); RLS is the real wall.
  { id: 'talleres_participante_explorar', label: 'Explorar', href: '/talleres/explorar', requiredCapability: null },
  // T9 — /talleres/mi-recorrido REPLACES the three items that used to
  // live here (Mis Talleres / Historial / Certificados — now one tabbed
  // screen, deleted in T10).
  { id: 'talleres_participante_mi_recorrido', label: 'Mi Recorrido', href: '/talleres/mi-recorrido', requiredCapability: null },
  // T6 — /talleres/pendientes, the cross-taller inbox (replaces the
  // líder's own Mis Grupos/Próximas Sesiones nav entries too — both
  // sections now live inside the catalog, /talleres, which every
  // authenticated user already reaches via the platform's top-level
  // talleres_participation entry). `TalleresNavItem.requiredCapability`
  // is a single string (one href -> one capability — see the
  // TALLERES_ROUTE_CAPABILITY_MAP invariant test), so this cannot be
  // "coordinator.read OR director.read". `metrics.read` is the ONE
  // capability the auto-grant trigger gives to BOTH roles identically
  // (supabase/migrations/20260810120000_talleres_role_auto_grant.sql) —
  // and per that same migration, a director/coordinador role assignment
  // is mutually exclusive (a persona is granted one row's capability set,
  // never both), so this never doubles up with a same-href duplicate the
  // way two separate coordinator/director-keyed entries would. The page
  // itself gates on flag+session only (RLS decides content per docs/
  // talleres-de-punta-a-punta.md §9's "el rol deja de vivir en la URL");
  // this capability only controls the MENU entry's visibility.
  { id: 'talleres_pendientes', label: 'Pendientes', href: '/talleres/pendientes', requiredCapability: 'talleres_crecimiento.metrics.read' },
  // T7 — /talleres/reportes. Same reasoning as talleres_pendientes above
  // (one href -> one requiredCapability; metrics.read is the one
  // capability both coordinador and director are auto-granted).
  { id: 'talleres_reportes', label: 'Reportes', href: '/talleres/reportes', requiredCapability: 'talleres_crecimiento.metrics.read' },
  // T8 — /talleres/temporadas, a straight move out of /admin. director.read
  // is one of the three qualifying capabilities on talleres_temporadas_
  // select's RLS (alongside metrics.read and admin.manage —
  // supabase/migrations/20260819000001_pr45_talleres_temporadas.sql:
  // 128-135): temporadas has no coordinador/lead branch in its RLS at
  // all, so there is no cross-role sharing problem to solve the way
  // talleres_pendientes/talleres_reportes need metrics.read for.
  { id: 'talleres_temporadas', label: 'Temporadas', href: '/talleres/temporadas', requiredCapability: 'talleres_crecimiento.director.read' },
]

// ─── T1 — route-access.ts as the single source of "which capability does
// this route need" ──────────────────────────────────────────────────────
//
// docs/talleres-de-punta-a-punta.md §9, "Navegación": "route-access.ts es
// hoy una segunda fuente de verdad que sólo controla la visibilidad del
// menú. Nada garantiza que la capacidad declarada ahí coincida con el
// portón real de la página. Al consolidar, ese catálogo debe pasar a ser
// la única fuente: la ruta declara su capacidad y el portón la lee de
// ahí." This map is that single source: a page's own guard can import
// `getRequiredCapabilityForRoute` instead of hard-coding its capability
// key a second time. No existing page is rewired to consume this in T1
// — that migration happens page-by-page as each screen is rebuilt
// (T2–T9); this only makes the lookup available and keeps it correct by
// construction (derived from TALLERES_NAV_ITEMS, never hand-duplicated).

/**
 * href → requiredCapability, derived from TALLERES_NAV_ITEMS. `null` means
 * the route is open to any authenticated user (the P/participante items).
 */
export const TALLERES_ROUTE_CAPABILITY_MAP: Readonly<Record<string, string | null>> =
  Object.fromEntries(TALLERES_NAV_ITEMS.map((item) => [item.href, item.requiredCapability]))

/**
 * Looks up the capability a route needs. Returns `null` when the route is
 * open to anyone, or `undefined` when the route isn't in the nav catalog
 * at all (a page NOT yet listed in TALLERES_NAV_ITEMS — the caller should
 * treat an unknown route conservatively, not as "open").
 */
export function getRequiredCapabilityForRoute(href: string): string | null | undefined {
  return Object.prototype.hasOwnProperty.call(TALLERES_ROUTE_CAPABILITY_MAP, href)
    ? TALLERES_ROUTE_CAPABILITY_MAP[href]
    : undefined
}

/**
 * Returns the list of talleres sub-items visible to the user based on
 * their capability set. Multi-role users get the union of all matching
 * sub-items — an item shows if and only if the user holds that item's
 * own `requiredCapability`, OR that item's `requiredCapability` is `null`
 * (open to any authenticated caller — the P/participante items; criterion
 * 7). Returns an empty array if the talleres feature flag is off (kill
 * switch).
 *
 * PR H — strict capability filtering. The former `director.read`
 * superset (which implied every non-admin read item) is gone: a pure
 * director now sees only Dirección + its own items, and each role group
 * appears only when its own capability is held. This removes the
 * duplicated same-labeled entries a director used to see under both
 * Coordinación and Dirección.
 *
 * Order: items are returned in the canonical order declared in
 * `TALLERES_NAV_ITEMS` so the UI renders deterministically.
 */
export function getTalleresNavItems(
  sessionCapabilities: readonly string[],
  options?: { readonly isEnabled?: boolean }
): TalleresNavItem[] {
  const enabled = options?.isEnabled ?? isTalleresEnabled()
  if (!enabled) return []

  const caps = new Set(sessionCapabilities)

  return TALLERES_NAV_ITEMS.filter(
    (item) => item.requiredCapability === null || caps.has(item.requiredCapability),
  ).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    requiredCapability: item.requiredCapability,
  }))
}

