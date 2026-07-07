import type { DreamTeamError } from './errors'

export const DREAM_TEAM_ESTADOS = ['postulado', 'en_orientacion', 'activo', 'en_pausa', 'inactivo', 'retirado'] as const
export type DreamTeamEstado = (typeof DREAM_TEAM_ESTADOS)[number]

export const DREAM_TEAM_MOTIVOS = [
  'admin_asignacion', 'admin_promocion', 'admin_pausa', 'admin_reactivacion', 'admin_retiro',
  'reasignacion', 'requisito_vencido', 'gdv_liderazgo_removed', 'auto_pausa', 'otro',
] as const
export type DreamTeamMotivo = (typeof DREAM_TEAM_MOTIVOS)[number]

export type PersonaId = string & { readonly __brand: 'PersonaId' }
export const personaId = (v: string): PersonaId => v as PersonaId

export interface DreamTeamEquipo {
  readonly id: string
  readonly experiencia: 'grupos_vida' | 'dps' | 'ninos' | 'estudiantes' | 'the_living_room' | 'talleres_crecimiento'
  readonly parentEquipoId?: string
  readonly label: string
  readonly activo: boolean
}

export interface DreamTeamRol {
  readonly id: string
  readonly equipoId: string
  readonly label: string
  readonly parentRolId?: string
  readonly activo: boolean
}

export interface DreamTeamServicio {
  readonly id: string
  readonly personaId: PersonaId
  readonly equipoId: string
  readonly rolId: string
  readonly estado: DreamTeamEstado
  readonly fechaInicio: string
  readonly fechaFin?: string
  readonly motivoActual: DreamTeamMotivo
  readonly version: number
}

export interface DreamTeamTransicionInput {
  readonly servicio: DreamTeamServicio
  readonly estadoNuevo: DreamTeamEstado
  readonly motivo: DreamTeamMotivo
  readonly detalleMotivo?: string
  readonly fecha: string
}

export type DreamTeamTransicionResult =
  | { readonly ok: true; readonly servicioNuevo: DreamTeamServicio }
  | { readonly ok: false; readonly error: DreamTeamError }
