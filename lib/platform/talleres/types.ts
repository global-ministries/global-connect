/**
 * PR1 — DT-002 — Talleres types.
 * Sibling to lib/platform/pastoral/types.ts pattern.
 */

export type TallerTipo = 'individual' | 'pareja'

export type TallerLinkType = 'matrimonio' | 'novios'

export type TallerModalidadInscripcion = 'periodo_general' | 'permanente_custom'

export type TallerEstado =
  | 'borrador'
  | 'abierto'
  | 'en_curso'
  | 'cerrado'
  | 'cancelado'

export type TallerGrupoEstado = 'activo' | 'completado' | 'cancelado'

export type TallerSesionEstado = 'programada' | 'en_curso' | 'cerrada' | 'cancelada'

export type TallerAsistenciaEstado = 'presente' | 'ausente' | 'no_aplica'

export type TallerInscripcionEstado = 'pendiente' | 'aprobado' | 'no_aprobado'

export type TallerUnidadEstado =
  | 'completado'
  | 'no_completado'
  | 'abandono'

export type TallerReporteEstado = 'borrador' | 'enviado' | 'reabierto' | 'cerrado'

export type TallerGrupoAsignacionRol = 'lider' | 'voluntario'

export type TallerSolicitudRetiroTipo =
  | 'participante_retiro'
  | 'equipo_retiro_definitivo'

export type TallerSolicitudRetiroEstado = 'pendiente' | 'aprobada' | 'rechazada'

export interface TallerMetadata {
  taller_id: string
  operating_core_event_id: string
  tipo: TallerTipo
  link_type: TallerLinkType | null
  modalidad_inscripcion: TallerModalidadInscripcion
  estado: TallerEstado
  nombre_snapshot: string
  sesiones_snapshot: number
  duracion_estimada_minutos_snapshot: number
  modalidad_inscripcion_snapshot: TallerModalidadInscripcion
  firmantes: TallerFirmante[]
  version: number
}

export interface TallerFirmante {
  persona_id: string
  rol_etiqueta: string
  orden: number
}

export interface TallerCohorte {
  id: string
  taller_id: string
  dream_team_equipo_id: string
  edicion: string
  started_at: string | null
  ended_at: string | null
  version: number
}

export interface TallerInscripcion {
  id: string
  taller_id: string
  cohorte_id: string
  persona_principal_id: string
  companero_id: string | null
  link_type: TallerLinkType | null
  estado: TallerInscripcionEstado
  motivo_no_aprobado: string | null
  ocurrencia_objetivo: string | null
  unit_estado: TallerUnidadEstado | null
  unit_estado_report_id: string | null
  version: number
}

export interface TallerGrupo {
  id: string
  cohorte_id: string
  nombre: string
  estado: TallerGrupoEstado
  capacidad: number
  completed_at: string | null
  version: number
}

export interface TallerGrupoAsignacion {
  id: string
  grupo_id: string
  persona_id: string
  rol: TallerGrupoAsignacionRol
  activo: boolean
  started_at: string | null
  ended_at: string | null
  motivo_retiro: string | null
  approved_by_director_id: string | null
}

export interface TallerSesion {
  id: string
  grupo_id: string
  numero: number
  fecha_programada: string
  fecha_realizada: string | null
  meeting_time_override: string | null
  meeting_time_applies_to: 'this_session' | 'this_and_subsequent' | null
  estado: TallerSesionEstado
  version: number
}

export interface TallerAsistencia {
  id: string
  sesion_id: string
  inscripcion_id: string
  persona_id: string
  estado: TallerAsistenciaEstado
  correccion_de_asistencia_id: string | null
  version: number
}

export interface TallerReporte {
  id: string
  grupo_id: string
  estado: TallerReporteEstado
  observaciones_generales: string
  firma_lider_persona_id: string | null
  firma_lider_fecha: string | null
  reabierto_por_persona_id: string | null
  reabierto_motivo: string | null
  version: number
}

export interface TallerReporteCorreccion {
  id: string
  reporte_id: string
  autor_persona_id: string
  contenido_anterior: Record<string, unknown>
  contenido_nuevo: Record<string, unknown>
  motivo: string
}

export interface TallerEvento {
  id: string
  taller_id: string
  cohorte_id: string | null
  grupo_id: string | null
  persona_id: string | null
  actor_persona_id: string
  schema_version: string
  payload: Record<string, unknown>
  occurred_at: string
  emitted_to_outbox: boolean
}

export interface TallerCertificado {
  id: string
  inscripcion_id: string
  codigo_verificacion: string
  taller_id: string
  nombre_taller_snapshot: string
  nombre_participante_snapshot: string
  fecha_completitud: string
  firmantes_snapshot: TallerFirmante[]
  pdf_storage_path: string | null
  revocado_at: string | null
}

export interface TallerPeriodoGeneral {
  id: string
  fecha_apertura_automatica: string | null
  fecha_cierre_automatico: string | null
  fecha_apertura_manual: string | null
  fecha_cierre_manual: string | null
  fecha_cierre_real: string | null
  motivo_cierre: string | null
}

export interface TallerSolicitudRetiro {
  id: string
  inscripcion_id: string | null
  grupo_asignacion_id: string | null
  solicitante_persona_id: string
  tipo: TallerSolicitudRetiroTipo
  motivo: string
  estado: TallerSolicitudRetiroEstado
}
