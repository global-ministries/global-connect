/**
 * Dream Team — shared Spanish copy + badge color mapping for `DreamTeamEstado`
 * and `DreamTeamMotivo`. Used by both the /admin/dream-team/servidores pool
 * and the /dream-team/mi-equipo director view, plus the shared
 * `<AvanceEtapaControl>`, so the labels and colors stay identical everywhere
 * a servicio's estado is shown.
 */
import type { DreamTeamEstado, DreamTeamMotivo } from '@/lib/platform/dream-team/types'

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
