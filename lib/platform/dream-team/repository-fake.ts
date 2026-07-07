import { randomUUID } from 'node:crypto'
import type {
  DreamTeamEquipo,
  DreamTeamEstado,
  DreamTeamEstadoHistorial,
  DreamTeamHistorialAppend,
  DreamTeamParticipationEvent,
  DreamTeamRequisito,
  DreamTeamRequisitoVerificacion,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from './types'
import type { DreamTeamRepository, DreamTeamServicioFiltros, DreamTeamServicioUpdate } from './repository'

export class ConcurrencyConflictError extends Error {
  readonly code = 'CONCURRENCY_CONFLICT' as const

  constructor(
    message: string,
    readonly context?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'ConcurrencyConflictError'
  }
}

export interface InMemoryDreamTeamRepositoryOptions {
  readonly seed?: {
    readonly equipos?: readonly DreamTeamEquipo[]
    readonly roles?: readonly DreamTeamRol[]
    readonly servicios?: readonly DreamTeamServicio[]
    readonly requisitos?: readonly DreamTeamRequisito[]
    readonly requisitoVerificaciones?: readonly DreamTeamRequisitoVerificacion[]
    readonly historial?: readonly DreamTeamEstadoHistorial[]
    readonly participationEvents?: readonly DreamTeamParticipationEvent[]
  }
}

export function createInMemoryDreamTeamRepository(
  options: InMemoryDreamTeamRepositoryOptions = {},
): DreamTeamRepository {
  const equipos: DreamTeamEquipo[] = [...(options.seed?.equipos ?? [])]
  const roles: DreamTeamRol[] = [...(options.seed?.roles ?? [])]
  const servicios: DreamTeamServicio[] = [...(options.seed?.servicios ?? [])]
  const requisitos: DreamTeamRequisito[] = [...(options.seed?.requisitos ?? [])]
  const requisitoVerificaciones: DreamTeamRequisitoVerificacion[] = [
    ...(options.seed?.requisitoVerificaciones ?? []),
  ]
  const historial: DreamTeamEstadoHistorial[] = [...(options.seed?.historial ?? [])]
  const participationEvents: DreamTeamParticipationEvent[] = [
    ...(options.seed?.participationEvents ?? []),
  ]

  function requireServicio(id: string): DreamTeamServicio {
    const found = servicios.find((s) => s.id === id)
    if (!found) {
      throw new Error(`Servicio ${id} not found`)
    }
    return found
  }

  function isEstadoArray(value: unknown): value is ReadonlyArray<DreamTeamEstado> {
    return Array.isArray(value)
  }

  function normalizeEstados(
    estado?: DreamTeamEstado | ReadonlyArray<DreamTeamEstado>,
  ): ReadonlyArray<DreamTeamEstado> | undefined {
    if (estado === undefined) return undefined
    if (isEstadoArray(estado)) return estado
    return [estado]
  }

  async function appendHistorial(input: DreamTeamHistorialAppend): Promise<DreamTeamEstadoHistorial> {
    const entry: DreamTeamEstadoHistorial = {
      ...input,
      id: randomUUID(),
    }
    historial.push(entry)
    return entry
  }

  return {
    async createServicio(input) {
      if (!input.personaId) throw new Error('personaId is required')
      if (!input.equipoId) throw new Error('equipoId is required')
      if (!input.rolId) throw new Error('rolId is required')
      if (!input.estado) throw new Error('estado is required')
      if (!input.fechaInicio) throw new Error('fechaInicio is required')
      if (!input.motivoActual) throw new Error('motivoActual is required')

      const created: DreamTeamServicio = {
        ...input,
        id: randomUUID(),
        version: 1,
      }
      servicios.push(created)
      return created
    },

    async getServicioById(id) {
      return servicios.find((s) => s.id === id) ?? null
    },

    async listServicios(filtros: DreamTeamServicioFiltros) {
      const estados = normalizeEstados(filtros.estado)
      return servicios.filter((s) => {
        if (filtros.personaId !== undefined && s.personaId !== filtros.personaId) return false
        if (filtros.equipoId !== undefined && s.equipoId !== filtros.equipoId) return false
        if (filtros.rolId !== undefined && s.rolId !== filtros.rolId) return false
        if (estados !== undefined && !estados.includes(s.estado)) return false
        return true
      })
    },

    async updateServicio(id, update: DreamTeamServicioUpdate) {
      const current = requireServicio(id)
      if (update.expectedVersion !== current.version) {
        throw new ConcurrencyConflictError(
          `expectedVersion ${update.expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion: update.expectedVersion, currentVersion: current.version },
        )
      }

      const estadoNuevo = update.estado ?? current.estado
      const updated: DreamTeamServicio = {
        ...current,
        estado: estadoNuevo,
        motivoActual: update.motivoActual ?? current.motivoActual,
        fechaFin:
          update.fechaFin ??
          (estadoNuevo === 'retirado' ? new Date().toISOString() : current.fechaFin),
        version: current.version + 1,
      }

      const index = servicios.findIndex((s) => s.id === id)
      servicios[index] = updated

      if (update.estado !== undefined && update.estado !== current.estado) {
        await appendHistorial({
          servicioId: id,
          estadoAnterior: current.estado,
          estadoNuevo: update.estado,
          motivo: update.motivoActual ?? current.motivoActual,
          detalleMotivo: update.detalleMotivo,
          actorPersonaId: current.personaId,
          fecha: new Date().toISOString(),
        })
      }

      return updated
    },

    async listEquipos() {
      return equipos
    },

    async listRolesPorEquipo(equipoId) {
      return roles.filter((r) => r.equipoId === equipoId)
    },

    async listRequisitosPorRol(rolId) {
      return requisitos.filter((r) => r.rolId === rolId)
    },

    async upsertRequisito(requisito) {
      const index = requisitos.findIndex((r) => r.id === requisito.id)
      if (index >= 0) {
        requisitos[index] = requisito
      } else {
        requisitos.push(requisito)
      }
      return requisito
    },

    async listRequisitoVerificaciones(servicioId) {
      return requisitoVerificaciones.filter((v) => v.servicioId === servicioId)
    },

    async upsertRequisitoVerificacion(verificacion) {
      const index = requisitoVerificaciones.findIndex((v) => v.id === verificacion.id)
      if (index >= 0) {
        requisitoVerificaciones[index] = verificacion
      } else {
        requisitoVerificaciones.push(verificacion)
      }
      return verificacion
    },

    appendHistorial,

    async listHistorial(servicioId) {
      return historial.filter((h) => h.servicioId === servicioId)
    },

    async countServiciosByEstado(estado) {
      return servicios.filter((s) => s.estado === estado).length
    },

    async appendParticipationEvent(event) {
      const created: DreamTeamParticipationEvent = {
        ...event,
        id: randomUUID(),
      }
      participationEvents.push(created)
      return created
    },

    async listParticipationEvents(servicioId) {
      return participationEvents.filter((e) => e.servicioId === servicioId)
    },

    async listParticipationEventsByPersona(personaId) {
      return participationEvents.filter((e) => e.personaId === personaId)
    },
  }
}
