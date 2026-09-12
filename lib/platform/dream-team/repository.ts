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
import type { DreamTeamServiceGrant } from './grants'

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

// Un nodo del árbol organizativo se desactiva con `activo = false`, nunca se
// borra: no hay (ni debe haber) un método de borrado en este repositorio.
export interface DreamTeamEquipoUpdate {
  readonly label?: string
  readonly activo?: boolean
  readonly parentEquipoId?: string | null
}

export interface DreamTeamRolUpdate {
  readonly label?: string
  readonly activo?: boolean
  readonly parentRolId?: string | null
}

export interface DreamTeamRepository {
  // Servicios
  createServicio(input: Omit<DreamTeamServicio, 'id' | 'version'>): Promise<DreamTeamServicio>
  getServicioById(id: string): Promise<DreamTeamServicio | null>
  listServicios(filtros: DreamTeamServicioFiltros): Promise<readonly DreamTeamServicio[]>
  updateServicio(id: string, update: DreamTeamServicioUpdate): Promise<DreamTeamServicio>

  // Equipos
  listEquipos(): Promise<readonly DreamTeamEquipo[]>
  createEquipo(input: Omit<DreamTeamEquipo, 'id'>): Promise<DreamTeamEquipo>
  updateEquipo(id: string, patch: DreamTeamEquipoUpdate): Promise<DreamTeamEquipo>

  // Roles
  listRolesPorEquipo(equipoId: string): Promise<readonly DreamTeamRol[]>
  createRol(input: Omit<DreamTeamRol, 'id'>): Promise<DreamTeamRol>
  updateRol(id: string, patch: DreamTeamRolUpdate): Promise<DreamTeamRol>

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

  // Grants (capacidades de plataforma derivadas del ciclo del servicio — Fase 4.1)
  applyServicioGrants(
    personaId: string,
    accion: 'grant' | 'revoke',
    grants: readonly DreamTeamServiceGrant[],
  ): Promise<number>
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
