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
import type {
  DreamTeamEquipoUpdate,
  DreamTeamRepository,
  DreamTeamRolUpdate,
  DreamTeamServicioFiltros,
  DreamTeamServicioUpdate,
} from './repository'
import type { DreamTeamServiceGrant } from './grants'

// Records one call to `applyServicioGrants` verbatim, so tests can assert
// exactly what was requested (persona, accion, and the grants themselves).
export interface AppliedServicioGrantsCall {
  readonly personaId: string
  readonly accion: 'grant' | 'revoke'
  readonly grants: readonly DreamTeamServiceGrant[]
}

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
): DreamTeamRepository & {
  getAppliedServicioGrantsCalls(): readonly AppliedServicioGrantsCall[]
} {
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
  const appliedServicioGrantsCalls: AppliedServicioGrantsCall[] = []

  function requireServicio(id: string): DreamTeamServicio {
    const found = servicios.find((s) => s.id === id)
    if (!found) {
      throw new Error(`Servicio ${id} not found`)
    }
    return found
  }

  function requireEquipo(id: string): DreamTeamEquipo {
    const found = equipos.find((e) => e.id === id)
    if (!found) {
      throw new Error(`Equipo ${id} not found`)
    }
    return found
  }

  function requireRol(id: string): DreamTeamRol {
    const found = roles.find((r) => r.id === id)
    if (!found) {
      throw new Error(`Rol ${id} not found`)
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

    async createEquipo(input) {
      if (!input.experiencia) throw new Error('experiencia is required')
      if (!input.label) throw new Error('label is required')

      const created: DreamTeamEquipo = {
        ...input,
        id: randomUUID(),
      }
      equipos.push(created)
      return created
    },

    async updateEquipo(id: string, patch: DreamTeamEquipoUpdate) {
      const current = requireEquipo(id)
      const updated: DreamTeamEquipo = {
        ...current,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.activo !== undefined ? { activo: patch.activo } : {}),
        ...(patch.parentEquipoId !== undefined ? { parentEquipoId: patch.parentEquipoId ?? undefined } : {}),
      }

      const index = equipos.findIndex((e) => e.id === id)
      equipos[index] = updated
      return updated
    },

    async listRolesPorEquipo(equipoId) {
      return roles.filter((r) => r.equipoId === equipoId)
    },

    async createRol(input) {
      if (!input.equipoId) throw new Error('equipoId is required')
      if (!input.label) throw new Error('label is required')

      const created: DreamTeamRol = {
        ...input,
        id: randomUUID(),
      }
      roles.push(created)
      return created
    },

    async updateRol(id: string, patch: DreamTeamRolUpdate) {
      const current = requireRol(id)
      const updated: DreamTeamRol = {
        ...current,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.activo !== undefined ? { activo: patch.activo } : {}),
        ...(patch.parentRolId !== undefined ? { parentRolId: patch.parentRolId ?? undefined } : {}),
      }

      const index = roles.findIndex((r) => r.id === id)
      roles[index] = updated
      return updated
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

    async applyServicioGrants(personaId, accion, grants) {
      appliedServicioGrantsCalls.push({ personaId, accion, grants })
      return grants.length
    },

    getAppliedServicioGrantsCalls() {
      return appliedServicioGrantsCalls.slice()
    },
  }
}
