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
  | 'talleres_participante_mis_talleres'
  | 'talleres_participante_historial'
  | 'talleres_participante_certificados'
  // Líder / Voluntario
  | 'talleres_grupos_mis_grupos'
  | 'talleres_sesiones_proximas'
  // T6 (odd/tasks/talleres-consolidar-pantallas.md) — the coordinator's
  // cross-taller inbox. Shared by coordinador AND director (it replaces
  // both /talleres/coordinacion/inscripciones + /talleres/coordinacion/
  // solicitudes and /talleres/direccion/solicitudes), so it cannot key
  // off either role's own `.read` capability alone without hiding it
  // from the other. See its `requiredCapability` below for why.
  | 'talleres_pendientes'
  // T7 (odd/tasks/talleres-consolidar-pantallas.md) — the consolidated
  // reportes list. Shared by coordinador AND director (it replaces both
  // /talleres/coordinacion/reportes and /talleres/direccion/reportes), so
  // it is keyed to metrics.read for the exact same reason as
  // talleres_pendientes above: it is the one capability both mutually-
  // exclusive roles are auto-granted.
  | 'talleres_reportes'
  // Coordinador
  | 'talleres_coordinacion_resumen'
  | 'talleres_coordinacion_inscripciones_pendientes'
  | 'talleres_coordinacion_talleres'
  | 'talleres_coordinacion_equipos'
  | 'talleres_coordinacion_reportes'
  // Director
  | 'talleres_direccion_resumen_global'
  | 'talleres_direccion_temporadas'
  | 'talleres_direccion_talleres'
  | 'talleres_direccion_periodos'
  | 'talleres_direccion_equipos'
  | 'talleres_direccion_solicitudes'
  | 'talleres_direccion_metricas'
  | 'talleres_direccion_reportes'
  // Admin
  | 'talleres_admin_abstracto'
  // Finding #5 — Global inscripciones view belongs to the administrator /
  // director general, NOT the coordinador. Keyed to `admin.manage` and
  // grouped under "Administración" (A). Previously it was coordinator.read-
  // keyed under Coordinación (C), which leaked an admin page into the
  // coordinador's menu; the page guard now also drops coordinator.read.
  | 'talleres_admin_inscripciones_global'

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
 */
export const TALLERES_NAV_ITEMS: readonly NavItemSpec[] = [
  // P — Participante. requiredCapability: null — odd/tasks/talleres-
  // autoinscripcion.md acceptance criterion 7: any authenticated member,
  // with zero talleres capabilities, must see "Para Mí" and reach these
  // four pages. The pages themselves no longer require participation.read
  // either (lib/platform/talleres/participante.ts); RLS is the real wall.
  { id: 'talleres_participante_explorar', label: 'Explorar', href: '/talleres/explorar', requiredCapability: null },
  { id: 'talleres_participante_mis_talleres', label: 'Mis Talleres', href: '/talleres/mis-talleres', requiredCapability: null },
  { id: 'talleres_participante_historial', label: 'Historial', href: '/talleres/historial', requiredCapability: null },
  { id: 'talleres_participante_certificados', label: 'Certificados', href: '/talleres/certificados', requiredCapability: null },
  // L / V — Líder + Voluntario (lead.read OR volunteer.read)
  // T0 — repointed at the real pages (previously /talleres/grupos and
  // /talleres/sesiones, neither of which existed — a silent 404). Recursos
  // is deleted in this consolidation (odd/tasks/talleres-consolidar-
  // pantallas.md, decisiones): it rendered a placeholder with no real
  // resource data, so the nav item is dropped rather than repointed.
  { id: 'talleres_grupos_mis_grupos', label: 'Mis Grupos', href: '/talleres/equipo/mis-grupos', requiredCapability: 'talleres_crecimiento.lead.read' },
  { id: 'talleres_sesiones_proximas', label: 'Próximas Sesiones', href: '/talleres/equipo/proximas-sesiones', requiredCapability: 'talleres_crecimiento.lead.read' },
  // T6 — /talleres/pendientes. `TalleresNavItem.requiredCapability` is a
  // single string (one href -> one capability — see the
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
  // capability both coordinador and director are auto-granted). The old
  // talleres_coordinacion_reportes / talleres_direccion_reportes items
  // below stay untouched — their pages keep working until T10 deletes
  // them and this item alongside.
  { id: 'talleres_reportes', label: 'Reportes', href: '/talleres/reportes', requiredCapability: 'talleres_crecimiento.metrics.read' },
  // C — Coordinador
  { id: 'talleres_coordinacion_resumen', label: 'Resumen', href: '/talleres/coordinacion', requiredCapability: 'talleres_crecimiento.coordinator.read' },
  { id: 'talleres_coordinacion_inscripciones_pendientes', label: 'Inscripciones Pendientes', href: '/talleres/coordinacion/inscripciones', requiredCapability: 'talleres_crecimiento.coordinator.read' },
  { id: 'talleres_coordinacion_talleres', label: 'Talleres', href: '/talleres/coordinacion/talleres', requiredCapability: 'talleres_crecimiento.coordinator.read' },
  { id: 'talleres_coordinacion_equipos', label: 'Equipos', href: '/talleres/coordinacion/equipos', requiredCapability: 'talleres_crecimiento.coordinator.read' },
  { id: 'talleres_coordinacion_reportes', label: 'Reportes', href: '/talleres/coordinacion/reportes', requiredCapability: 'talleres_crecimiento.coordinator.read' },
  // D — Director (director.read OR metrics.read)
  { id: 'talleres_direccion_resumen_global', label: 'Resumen Global', href: '/talleres/direccion', requiredCapability: 'talleres_crecimiento.director.read' },
  // PR46 — global seasons (talleres_temporadas). The Dirección entry-point
  // for "abro una temporada → elijo qué talleres abren". Lives under /admin
  // (the management surface); the page gates mutations on director.write OR
  // admin.manage, while the list is director.read-viewable (RLS parity).
  { id: 'talleres_direccion_temporadas', label: 'Temporadas', href: '/admin/talleres/temporadas', requiredCapability: 'talleres_crecimiento.director.read' },
  { id: 'talleres_direccion_talleres', label: 'Talleres', href: '/talleres/direccion/talleres', requiredCapability: 'talleres_crecimiento.director.read' },
  { id: 'talleres_direccion_periodos', label: 'Periodos', href: '/talleres/direccion/periodos', requiredCapability: 'talleres_crecimiento.director.read' },
  { id: 'talleres_direccion_equipos', label: 'Equipos', href: '/talleres/direccion/equipos', requiredCapability: 'talleres_crecimiento.director.read' },
  { id: 'talleres_direccion_solicitudes', label: 'Solicitudes', href: '/talleres/direccion/solicitudes', requiredCapability: 'talleres_crecimiento.director.read' },
  { id: 'talleres_direccion_metricas', label: 'Métricas', href: '/talleres/direccion/metricas', requiredCapability: 'talleres_crecimiento.metrics.read' },
  { id: 'talleres_direccion_reportes', label: 'Reportes', href: '/talleres/direccion/reportes', requiredCapability: 'talleres_crecimiento.director.read' },
  // A — Admin (admin.manage). PR25: admin-only sub-item pointing at the
  // wizard entry-point (`/admin/talleres/abstracto`). Users with ONLY
  // this cap (no participation.read) need at least one sub-menu entry
  // — previously they got an empty sub-menu, which made the sidebar
  // entry look broken even though the capability gate resolved.
  { id: 'talleres_admin_abstracto', label: 'Grupos de Corto Plazo', href: '/admin/talleres/abstracto', requiredCapability: 'talleres_crecimiento.admin.manage' },
  // Finding #5 — Global inscripciones view. This page belongs to the
  // administrator / director general, NOT the coordinador. Keyed to
  // `admin.manage` so admin + director-general (who holds admin.manage)
  // see it under "Administración" and the coordinador does not — and the
  // page guard drops coordinator.read so it is unreachable by URL too. The
  // page's write actions still gate on director.write OR admin.manage.
  { id: 'talleres_admin_inscripciones_global', label: 'Inscripciones (global)', href: '/admin/talleres/inscripciones', requiredCapability: 'talleres_crecimiento.admin.manage' },
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

