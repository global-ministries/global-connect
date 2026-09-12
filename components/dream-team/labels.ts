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
import type { RolLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'
import type { RolResponsableGdv } from '@/lib/platform/dream-team/estructura-gdv'
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

/**
 * Spanish display label for a Grupos de Vida leader/co-leader surfaced
 * read-only in the servidores/mi-equipo screens (see
 * lib/platform/dream-team/lideres-gdv.ts). These are Grupos de Vida roles
 * projected in, not one of the four Dream Team roles above — kept as a
 * separate map rather than folded into ROL_LABELS.
 */
export const ROL_LIDER_GDV_LABELS: Readonly<Record<RolLiderGdv, string>> = {
  lider: 'Líder de grupo',
  colider: 'Colíder de grupo',
}

/**
 * Spanish display labels for the four Grupos de Vida structure "responsable"
 * roles surfaced read-only on org-tree rows (see
 * lib/platform/dream-team/estructura-gdv.ts, components/dream-team/nodo-fila.tsx).
 * Distinct from `ROL_LIDER_GDV_LABELS`: that one labels a person's row in the
 * servidores/mi-equipo listings ("Líder de grupo"), this one labels the
 * per-node "who's responsible" line on the tree itself, where the node
 * already says which group it is — "Líder" alone reads better there.
 */
export const ROL_RESPONSABLE_GDV_LABELS: Readonly<Record<RolResponsableGdv, string>> = {
  director_general: 'Director general',
  director_etapa: 'Director de etapa',
  lider: 'Líder',
  colider: 'Colíder',
}

/**
 * Resolves a Grupos de Vida structure responsable role to its Spanish label.
 * `rol` arrives as a plain `string` (see estructura-arbol.ts's
 * `ResponsableNodo`), so this stays defensive like `rolLabel()`: an
 * unrecognized key falls back to capitalizing just its first letter rather
 * than rendering the raw key.
 */
export function rolResponsableGdvLabel(rol: string): string {
  const conocido = (ROL_RESPONSABLE_GDV_LABELS as Readonly<Record<string, string>>)[rol]
  return conocido ?? rolLabel(rol)
}

/**
 * Badge copy marking a servidor row as sourced from Grupos de Vida rather
 * than a Dream Team servicio — shown next to the role on both listing
 * screens so it reads as read-only at a glance.
 */
export const ORIGEN_GRUPOS_VIDA_LABEL = 'Grupos de Vida'
