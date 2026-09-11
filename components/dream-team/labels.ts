/**
 * Dream Team — shared Spanish copy + badge color mapping for `DreamTeamEstado`,
 * `DreamTeamMotivo`, org-tree experiencia keys, and rol labels. Used across
 * all three Dream Team screens (estructura, servidores, mi-equipo) plus the
 * shared `<AvanceEtapaControl>` and `<NodoFila>`, so labels and colors stay
 * identical everywhere a servicio's estado, an equipo's experiencia, or a
 * rol is shown. Never render a raw catalog/rol key to the user — always go
 * through these helpers.
 */
import type { DreamTeamEstado, DreamTeamMotivo } from '@/lib/platform/dream-team/types'
import { PLATFORM_EXPERIENCE_CATALOG } from '@/lib/platform/experiences'

export const ESTADO_LABELS: Record<DreamTeamEstado, string> = {
  postulado: 'Postulado',
  en_orientacion: 'En orientación',
  activo: 'Activo',
  en_pausa: 'En pausa',
  inactivo: 'Inactivo',
  retirado: 'Retirado',
}

export type BadgeVariante = 'default' | 'success' | 'warning' | 'error' | 'info'

export const ESTADO_BADGE_VARIANTE: Record<DreamTeamEstado, BadgeVariante> = {
  postulado: 'info',
  en_orientacion: 'info',
  activo: 'success',
  en_pausa: 'warning',
  inactivo: 'default',
  retirado: 'error',
}

export const MOTIVO_LABELS: Record<DreamTeamMotivo, string> = {
  admin_asignacion: 'Asignación administrativa',
  admin_promocion: 'Promoción administrativa',
  admin_pausa: 'Pausa administrativa',
  admin_reactivacion: 'Reactivación administrativa',
  admin_retiro: 'Retiro administrativo',
  reasignacion: 'Reasignación',
  requisito_vencido: 'Requisito vencido',
  gdv_liderazgo_removed: 'Liderazgo removido en Grupos de Vida',
  auto_pausa: 'Pausa automática',
  otro: 'Otro',
}

/**
 * Resolves a `PLATFORM_EXPERIENCE_CATALOG` key (e.g. `talleres_crecimiento`,
 * `atraccion`) to its Spanish label. Falls back to the raw key for a value
 * that isn't in the catalog rather than throwing — an equipo's `experiencia`
 * is typed as `PlatformExperienceKey` but this also has to tolerate stale or
 * hand-edited data without crashing the tree view.
 */
export function experienciaLabel(key: string): string {
  const entrada = (PLATFORM_EXPERIENCE_CATALOG as Readonly<Record<string, { readonly label: string }>>)[key]
  return entrada?.label ?? key
}

/**
 * Dream Team roles are stored lowercase, without accents (`director`,
 * `coordinador`, `lider`, `voluntario`). This is the Spanish display label
 * for each of the four known roles.
 */
export const ROL_LABELS: Readonly<Record<string, string>> = {
  director: 'Director',
  coordinador: 'Coordinador',
  lider: 'Líder',
  voluntario: 'Voluntario',
}

/**
 * Resolves a stored rol label to its Spanish display label. An unknown rol
 * (not one of the four above) falls back to capitalizing just its first
 * letter, rather than a raw lowercase key.
 */
export function rolLabel(label: string): string {
  const conocido = ROL_LABELS[label.toLowerCase()]
  if (conocido) return conocido
  if (label.length === 0) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Badge variant per rol, following the Grupos de Vida hierarchy convention
 * (see GrupoDetailClient.tsx): the top role gets `warning`, the next gets
 * `info`, the rest `default`.
 */
export const ROL_BADGE_VARIANTE: Readonly<Record<string, BadgeVariante>> = {
  director: 'warning',
  coordinador: 'info',
  lider: 'default',
  voluntario: 'default',
}

/** Looks up `ROL_BADGE_VARIANTE` case-insensitively, defaulting to `default`. */
export function rolBadgeVariante(label: string): BadgeVariante {
  return ROL_BADGE_VARIANTE[label.toLowerCase()] ?? 'default'
}
