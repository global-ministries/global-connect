import type {
  DreamTeamEquipo,
  DreamTeamEstado,
  DreamTeamEstadoHistorial,
  DreamTeamHistorialAppend,
  DreamTeamMotivo,
  DreamTeamParticipationEvent,
  DreamTeamParticipationEventType,
  DreamTeamRequisito,
  DreamTeamRequisitoVerificacion,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from './types'

// ──────────────────────────────────────────────
// Repository principal (read + write)
// ──────────────────────────────────────────────

export interface DreamTeamServicioFiltros {
  readonly personaId?: PersonaId
  readonly equipoId?: string
  readonly rolId?: string
  readonly estado?: DreamTeamEstado | readonly DreamTeamEstado[]
  readonly includeHistorial?: boolean
}

export interface DreamTeamServicioUpdate {
  readonly estado?: DreamTeamEstado
  readonly motivoActual?: DreamTeamMotivo
  readonly detalleMotivo?: string
  readonly fechaFin?: string
  readonly expectedVersion: number
}

export interface DreamTeamRepository {
  // Servicios
  createServicio(input: Omit<DreamTeamServicio, 'id' | 'version'>): Promise<DreamTeamServicio>
  getServicioById(id: string): Promise<DreamTeamServicio | null>
  listServicios(filtros: DreamTeamServicioFiltros): Promise<readonly DreamTeamServicio[]>
  updateServicio(id: string, update: DreamTeamServicioUpdate): Promise<DreamTeamServicio>

  // Equipos
  listEquipos(): Promise<readonly DreamTeamEquipo[]>

  // Roles
  listRolesPorEquipo(equipoId: string): Promise<readonly DreamTeamRol[]>

  // Requisitos (config)
  listRequisitosPorRol(rolId: string): Promise<readonly DreamTeamRequisito[]>
  upsertRequisito(requisito: DreamTeamRequisito): Promise<DreamTeamRequisito>

  // Verificación de requisitos
  listRequisitoVerificaciones(servicioId: string): Promise<readonly DreamTeamRequisitoVerificacion[]>
  upsertRequisitoVerificacion(verificacion: DreamTeamRequisitoVerificacion): Promise<DreamTeamRequisitoVerificacion>

  // Historial de transiciones
  appendHistorial(input: DreamTeamHistorialAppend): Promise<DreamTeamEstadoHistorial>
  listHistorial(servicioId: string): Promise<readonly DreamTeamEstadoHistorial[]>

  // Métricas (count básico — agregación real es S8)
  countServiciosByEstado(estado: DreamTeamEstado): Promise<number>

  // Eventos de participación
  appendParticipationEvent(event: Omit<DreamTeamParticipationEvent, 'id'>): Promise<DreamTeamParticipationEvent>
  listParticipationEvents(servicioId: string): Promise<readonly DreamTeamParticipationEvent[]>
  listParticipationEventsByPersona(personaId: PersonaId): Promise<readonly DreamTeamParticipationEvent[]>
}

// ──────────────────────────────────────────────
// Adapter de Grupos de Vida (read-only)
// ──────────────────────────────────────────────

export interface DreamTeamGdvMember {
  readonly personaId: PersonaId
  readonly grupoId: string
  readonly tipoLider: 'director_etapa' | 'lider_grupo' | 'coordinador_grupo' | 'miembro'
  readonly activo: boolean
  readonly fechaInicio: string
  readonly fechaFin?: string
}

export interface DreamTeamGdvMembershipReader {
  listActiveLideres(): Promise<readonly DreamTeamGdvMember[]>
  getMember(personaId: PersonaId, grupoId: string): Promise<DreamTeamGdvMember | null>
  /** Detecta cambio de liderazgo (e.g. ya no es líder). Lo usa el adapter para emitir eventos. */
  diffMembership(previous: readonly DreamTeamGdvMember[]): Promise<
    readonly {
      readonly kind: 'added' | 'removed' | 'unchanged'
      readonly member: DreamTeamGdvMember
    }[]
  >
}

// ──────────────────────────────────────────────
// Writer de eventos de participación
// ──────────────────────────────────────────────

export type { DreamTeamParticipationEventType }

export interface DreamTeamParticipationEventWriter {
  append(event: Omit<DreamTeamParticipationEvent, 'id'>): Promise<DreamTeamParticipationEvent>
  list(servicioId: string): Promise<readonly DreamTeamParticipationEvent[]>
  listByPersona(personaId: PersonaId): Promise<readonly DreamTeamParticipationEvent[]>
}
