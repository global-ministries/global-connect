/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — talleres' own
 * estado -> badge-variante map, plus a label function, mirroring the
 * EXACT shape of components/dream-team/labels.ts (docs/talleres-de-
 * punta-a-punta.md §9, "Color y estado"):
 *
 *   "cada dominio tiene un solo archivo con el mapa de estado a
 *   variante, más una función de etiqueta... la regla, de la cabecera
 *   de ese archivo: nunca renderizar al usuario una clave cruda del
 *   catálogo — siempre pasar por estos helpers."
 *
 * Two domains: a taller_ediciones row's `estado` (borrador / abierto /
 * en_curso / cerrado / cancelado — the one the /talleres catalog and
 * its "abiertas" filter both key off of) and a talleres row's own
 * `estado` (active / archived).
 */

export type BadgeVariante = 'default' | 'success' | 'warning' | 'error' | 'info'

export type EdicionEstado = 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'

export const EDICION_ESTADO_LABELS: Record<EdicionEstado, string> = {
  borrador: 'Borrador',
  abierto: 'Abierta',
  en_curso: 'En curso',
  cerrado: 'Cerrada',
  cancelado: 'Cancelada',
}

export const EDICION_ESTADO_BADGE_VARIANTE: Record<EdicionEstado, BadgeVariante> = {
  borrador: 'default',
  abierto: 'success',
  en_curso: 'info',
  cerrado: 'default',
  cancelado: 'error',
}

/** Never render a raw `taller_ediciones.estado` key — always go through this. */
export function edicionEstadoLabel(estado: string): string {
  return (EDICION_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function edicionEstadoBadgeVariante(estado: string): BadgeVariante {
  return (EDICION_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}

export type TallerEstado = 'active' | 'archived'

export const TALLER_ESTADO_LABELS: Record<TallerEstado, string> = {
  active: 'Activo',
  archived: 'Archivado',
}

export const TALLER_ESTADO_BADGE_VARIANTE: Record<TallerEstado, BadgeVariante> = {
  active: 'success',
  archived: 'default',
}

/** Never render a raw `talleres.estado` key — always go through this. */
export function tallerEstadoLabel(estado: string): string {
  return (TALLER_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function tallerEstadoBadgeVariante(estado: string): BadgeVariante {
  return (TALLER_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}

/**
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — a `taller_reportes`
 * row's own `estado`. The old coordinacion/reportes + direccion/reportes
 * pages rendered `r.estado` raw with no label or variante at all
 * (`<BadgeSistema>{r.estado}</BadgeSistema>`) — a violation of this
 * file's own header rule, fixed here for the consolidated screen.
 */
export type ReporteEstado = 'borrador' | 'enviado' | 'reabierto' | 'cerrado'

export const REPORTE_ESTADO_LABELS: Record<ReporteEstado, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  reabierto: 'Reabierto',
  cerrado: 'Cerrado',
}

export const REPORTE_ESTADO_BADGE_VARIANTE: Record<ReporteEstado, BadgeVariante> = {
  borrador: 'default',
  enviado: 'success',
  reabierto: 'warning',
  cerrado: 'info',
}

/** Never render a raw `taller_reportes.estado` key — always go through this. */
export function reporteEstadoLabel(estado: string): string {
  return (REPORTE_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function reporteEstadoBadgeVariante(estado: string): BadgeVariante {
  return (REPORTE_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — a `talleres_temporadas`
 * row's own `estado`. The old app/(auth)/admin/talleres/temporadas screens
 * rendered `t.estado` raw inside a `BadgeSistema` (no label, a local
 * `estadoBadgeVariante` duplicated in two files) — this is the single
 * shared map the T2/T7 header rule requires.
 */
export type TemporadaEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'

export const TEMPORADA_ESTADO_LABELS: Record<TemporadaEstado, string> = {
  borrador: 'Borrador',
  abierto: 'Abierta',
  cerrado: 'Cerrada',
  cancelado: 'Cancelada',
}

export const TEMPORADA_ESTADO_BADGE_VARIANTE: Record<TemporadaEstado, BadgeVariante> = {
  borrador: 'info',
  abierto: 'success',
  cerrado: 'default',
  cancelado: 'error',
}

/** Never render a raw `talleres_temporadas.estado` key — always go through this. */
export function temporadaEstadoLabel(estado: string): string {
  return (TEMPORADA_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function temporadaEstadoBadgeVariante(estado: string): BadgeVariante {
  return (TEMPORADA_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}

/**
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — a `taller_inscripciones`
 * row's own participant-facing `estado`. The old mis-talleres page colored
 * aprobado as success and everything else default; historial colored
 * completado as success, no_aprobado as error, and everything else
 * default — two different colors for the same `aprobado` value depending
 * on which old screen rendered it. This is the single shared map the
 * merged /talleres/mi-recorrido screen uses for both its "en curso" and
 * "historial" tabs.
 */
export type InscripcionEstado = 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'

export const INSCRIPCION_ESTADO_LABELS: Record<InscripcionEstado, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  no_aprobado: 'No aprobado',
  completado: 'Completado',
}

export const INSCRIPCION_ESTADO_BADGE_VARIANTE: Record<InscripcionEstado, BadgeVariante> = {
  pendiente: 'warning',
  aprobado: 'success',
  no_aprobado: 'error',
  completado: 'info',
}

/** Never render a raw `taller_inscripciones.estado` key — always go through this. */
export function inscripcionEstadoLabel(estado: string): string {
  return (INSCRIPCION_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function inscripcionEstadoBadgeVariante(estado: string): BadgeVariante {
  return (INSCRIPCION_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}

/**
 * T9 — a `taller_inscripciones` row's own `unit_estado` (the per-unit
 * completion outcome, distinct from the inscripcion `estado` above).
 */
export type UnitEstado = 'completado' | 'no_completado' | 'abandono'

export const UNIT_ESTADO_LABELS: Record<UnitEstado, string> = {
  completado: 'Completado',
  no_completado: 'No completado',
  abandono: 'Abandonó',
}

export const UNIT_ESTADO_BADGE_VARIANTE: Record<UnitEstado, BadgeVariante> = {
  completado: 'success',
  no_completado: 'default',
  abandono: 'error',
}

/** Never render a raw `taller_inscripciones.unit_estado` key — always go through this. */
export function unitEstadoLabel(estado: string): string {
  return (UNIT_ESTADO_LABELS as Readonly<Record<string, string>>)[estado] ?? estado
}

export function unitEstadoBadgeVariante(estado: string): BadgeVariante {
  return (UNIT_ESTADO_BADGE_VARIANTE as Readonly<Record<string, BadgeVariante>>)[estado] ?? 'default'
}
