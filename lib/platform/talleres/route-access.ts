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
  | 'talleres_recursos'
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
  // PR42 — Global inscripciones admin view. The page itself enforces the
  // multi-capability write gate (coordinator.write OR director.write OR
  // admin.manage); the sidebar keys the entry to `coordinator.read` so
  // every coordinator sees it under "Coordinación". PR H — with the
  // director.read superset removed, a pure director no longer sees this
  // C-keyed entry; directors manage enrollment from their own Dirección
  // surface, and admin.manage reaches the page by URL.
  | 'talleres_coordinacion_inscripciones_global'

export type TalleresNavItem = Readonly<{
  id: TalleresNavItemId
  label: string
  href: string
  requiredCapability: string
}>

interface NavItemSpec {
  readonly id: TalleresNavItemId
  readonly label: string
  readonly href: string
  readonly requiredCapability: string
}

/**
 * Master sub-item table. The renderer filters this list against the
 * user's capability set. Order within a role group is preserved so the
 * UI renders in a deterministic order.
 */
export const TALLERES_NAV_ITEMS: readonly NavItemSpec[] = [
  // P — Participante
  { id: 'talleres_participante_explorar', label: 'Explorar', href: '/talleres/explorar', requiredCapability: 'talleres_crecimiento.participation.read' },
  { id: 'talleres_participante_mis_talleres', label: 'Mis Talleres', href: '/talleres/mis-talleres', requiredCapability: 'talleres_crecimiento.participation.read' },
  { id: 'talleres_participante_historial', label: 'Historial', href: '/talleres/historial', requiredCapability: 'talleres_crecimiento.participation.read' },
  { id: 'talleres_participante_certificados', label: 'Certificados', href: '/talleres/certificados', requiredCapability: 'talleres_crecimiento.participation.read' },
  // L / V — Líder + Voluntario (lead.read OR volunteer.read)
  { id: 'talleres_grupos_mis_grupos', label: 'Mis Grupos', href: '/talleres/grupos', requiredCapability: 'talleres_crecimiento.lead.read' },
  { id: 'talleres_sesiones_proximas', label: 'Próximas Sesiones', href: '/talleres/sesiones', requiredCapability: 'talleres_crecimiento.lead.read' },
  { id: 'talleres_recursos', label: 'Recursos', href: '/talleres/recursos', requiredCapability: 'talleres_crecimiento.lead.read' },
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
  // PR42 — Global admin/coordinacion inscripciones view. The page
  // itself enforces multi-capability (director.write OR admin.manage
  // OR coordinator.write). The sidebar carries the C-key entry under
  // `coordinator.read` so coordinators see it under "Coordinación".
  // PR H — the director.read superset is removed, so a pure director no
  // longer sees this entry in the sidebar; directors act on enrollment
  // from their own Dirección surface, and admin.manage reaches the page
  // by URL. The page-level action gate (coordinator.write) keeps the
  // write surface protected.
  { id: 'talleres_coordinacion_inscripciones_global', label: 'Inscripciones (global)', href: '/admin/talleres/inscripciones', requiredCapability: 'talleres_crecimiento.coordinator.read' },
]

/**
 * Returns the list of talleres sub-items visible to the user based on
 * their capability set. Multi-role users get the union of all matching
 * sub-items — an item shows if and only if the user holds that item's
 * own `requiredCapability`. Returns an empty array if the talleres
 * feature flag is off (kill switch).
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

  return TALLERES_NAV_ITEMS.filter((item) => caps.has(item.requiredCapability)).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    requiredCapability: item.requiredCapability,
  }))
}

