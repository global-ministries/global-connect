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
