/**
 * Shared types for the inscripciones admin/coordination tables.
 *
 * Two pages render the same shape (global `/admin/talleres/inscripciones`
 * and coordinator `/talleres/coordinacion/inscripciones`), and both
 * call `ApproveInscripcionButton` / `RejectInscripcionButton` against
 * server actions exported from `lib/platform/talleres/inscripciones-actions`.
 *
 * To keep the loader + component + actions decoupled, the row shape
 * lives here. Both `lib/platform/talleres/admin-inscripciones.ts` and
 * `lib/platform/talleres/operacional.ts` re-export or implement it,
 * and `components/talleres/tabla-inscripciones.tsx` consumes it.
 *
 * Design notes:
 *   - The shape matches the data that the admin loader already
 *     projects (`AdminInscripcionRow`). Reusing it keeps the shared
 *     table component truly portable across both pages.
 *   - The shape is `readonly` everywhere — loaders and consumers
 *     treat the rows as immutable projections.
 *   - `motivo_no_aprobado` is intentionally NOT surfaced here (the
 *     admin loader omits it, see comment in admin-inscripciones.ts).
 *     The participant's rejection reason is RLS-protected for the
 *     participant and the coordinator workflow does not need it
 *     surfaced at the row level (the action that WRITES motivo
 *     on rejection writes it directly to the DB).
 */

export type InscripcionEstado =
  | 'pendiente'
  | 'aprobado'
  | 'no_aprobado'
  | 'completado'

/**
 * Row shape for the admin + coordinator inscripciones tables.
 *
 * Mirrors `AdminInscripcionRow` (the shape returned by
 * `loadAdminInscripciones`). The coordination loader
 * (`loadCoordInscripcionesPendientes`) builds the same shape with
 * the same field semantics so the shared `<TablaInscripciones>`
 * component can render both feeds.
 */
export interface InscripcionAdminRow {
  readonly id: string
  readonly edicion_id: string
  readonly edicion_nombre: string
  readonly edicion_estado: string
  readonly taller_id: string
  readonly taller_nombre: string
  readonly taller_slug: string
  readonly cohorte_id: string | null
  readonly cohorte_edicion: string | null
  readonly persona_principal_id: string
  readonly persona_principal_nombre: string
  readonly persona_principal_email: string | null
  readonly companero_id: string | null
  readonly companero_nombre: string | null
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly estado: InscripcionEstado
  readonly created_at: string
  readonly updated_at: string
}