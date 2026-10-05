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
  | 'retirado'

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
  /**
   * T2 (odd/tasks/talleres-inscripcion-a-grupo.md) — the grupo this
   * inscripción is placed in, or null when unplaced. `grupo_nombre` is
   * null exactly when `grupo_id` is null; when `grupo_id` is set but the
   * grupo lookup can't resolve a name, it degrades to '—' (T6b rule:
   * never drop the row, never invent a name).
   */
  readonly grupo_id: string | null
  readonly grupo_nombre: string | null
  /**
   * T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — placed
   * above the edición's cupo by a director/coordinator/admin via
   * talleres_inscribir_sobre_cupo. Optional (defaults to false when a
   * loader omits it) so the two other constructors of this shape
   * (loadCoordInscripcionesPendientes, loadPendientesInscripciones) don't
   * need updating just to keep compiling — only loadAdminInscripciones
   * (the edición page's own loader) currently populates it.
   */
  readonly sobre_cupo?: boolean
  readonly sobre_cupo_por_nombre?: string | null
  readonly sobre_cupo_en?: string | null
  /**
   * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
   * resultado talleres_cerrar_edicion stamps on the inscripción
   * (completado / no_completado / abandono), null until the edición is
   * closed. Optional for the same reason as `sobre_cupo`: only
   * loadAdminInscripciones (the edición page's loader) populates it.
   */
  readonly unit_estado?: string | null
  /**
   * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
   * C2): how the partner was identified ('conyuge_registrado' | 'cedula' |
   * 'ficha_nueva'), and for 'ficha_nueva' the access invitation estado read
   * with the admin client (null when unknown). Optional: older loaders omit them.
   */
  readonly pareja_origen?: string | null
  readonly acceso_estado?: string | null
  /** true when the invitation's ultimo_error is set (the last send failed). */
  readonly acceso_ultimo_envio_fallido?: boolean
}