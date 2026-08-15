/**
 * PR17 — DT-068 — Talleres navigation layout (role-grouped).
 *
 * Companion to `lib/platform/talleres/route-access.ts`. While
 * `route-access.ts` exposes the per-item helper
 * `getTalleresNavItems(sessionCapabilities)`, this file provides the
 * role-grouped LAYOUT data used by the view renderer
 * (`components/ui/platform-navigation-view-items.ts` extension).
 *
 * Per design §9 the sub-items are grouped by role:
 *   P — Participante:      Explorar / Mis-Talleres / Historial / Certificados
 *   L — Líder:             Mis-Grupos / Próximas-Sesiones / Recursos
 *   V — Voluntario:        (same as L; subset via `lead.read | volunteer.read`)
 *   C — Coordinador:       Resumen / Inscripciones-Pendientes / Talleres / Equipos / Reportes
 *   D — Director:          Resumen-Global / Talleres / Periodos / Equipos / Solicitudes / Métricas / Reportes
 *   A — Admin:             Grupos-de-Corto-Plazo (PR25; admin.manage; lives under /admin/...)
 *
 * Multi-role users see the union of inherited groups. The renderer
 * applies this grouping before capability-filtering — so a participant
 * who also has `lead.read` would see both the P-group and the L-group
 * sections in their menu.
 *
 * The renderer (NOT this file) is responsible for the actual UI:
 * `components/ui/platform-navigation-view-items.ts` extension is a
 * separate concern handled at DT-069.
 */

import type { TalleresNavItem, TalleresNavItemId } from './route-access'

/**
 * Group identifier for the renderer. The renderer maps each group to a
 * sub-section header in the menu.
 */
export type TalleresNavGroupId = 'P' | 'L' | 'V' | 'C' | 'D' | 'A'

export interface TalleresNavGroup {
  readonly id: TalleresNavGroupId
  readonly title: string
  readonly items: readonly TalleresNavItem[]
}

/**
 * Returns the talleres sub-items grouped by role, with each group
 * filtered to the user's capability set. Order within each group
 * matches the canonical declaration in `TALLERES_NAV_ITEMS`.
 *
 * The returned groups are flattened — the renderer can map directly.
 * Groups with zero visible items are omitted from the result.
 *
 * @param items The output of `getTalleresNavItems(sessionCapabilities)`
 */
export function groupTalleresNavItems(
  items: readonly TalleresNavItem[]
): TalleresNavGroup[] {
  // Bucket the items by their role-group. The mapping is structural:
  // each TalleresNavItemId belongs to exactly one group via prefix.
  const buckets: Record<TalleresNavGroupId, TalleresNavItem[]> = {
    P: [],
    L: [],
    V: [],
    C: [],
    D: [],
    A: [],
  }
  for (const item of items) {
    const groupId = groupIdForItemId(item.id)
    if (groupId) buckets[groupId].push(item)
  }

  const groups: TalleresNavGroup[] = []
  if (buckets.P.length > 0) groups.push({ id: 'P', title: 'Para Mí', items: buckets.P })
  if (buckets.L.length > 0) groups.push({ id: 'L', title: 'Como Líder', items: buckets.L })
  if (buckets.V.length > 0) groups.push({ id: 'V', title: 'Como Voluntario', items: buckets.V })
  if (buckets.C.length > 0) groups.push({ id: 'C', title: 'Coordinación', items: buckets.C })
  if (buckets.D.length > 0) groups.push({ id: 'D', title: 'Dirección', items: buckets.D })
  // PR25 — Admin group. Title rendered only when the user actually has
  // the admin.manage capability (otherwise the bucket is empty and we
  // skip the section header).
  if (buckets.A.length > 0) groups.push({ id: 'A', title: 'Administración', items: buckets.A })
  return groups
}

function groupIdForItemId(id: TalleresNavItemId): TalleresNavGroupId | null {
  if (id.startsWith('talleres_participante_')) return 'P'
  if (id.startsWith('talleres_grupos_') || id.startsWith('talleres_sesiones_') || id === 'talleres_recursos') return 'L'
  if (id.startsWith('talleres_coordinacion_')) return 'C'
  if (id.startsWith('talleres_direccion_')) return 'D'
  // PR25 — Admin group is the wizard entry-point under `/admin/...`.
  // Currently exactly one item maps here; if more are added later they
  // can either follow the `talleres_admin_` prefix convention or be
  // added as explicit branches.
  if (id.startsWith('talleres_admin_')) return 'A'
  return null
}
