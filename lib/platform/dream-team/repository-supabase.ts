import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DreamTeamEquipo,
  DreamTeamEstado,
  DreamTeamEstadoHistorial,
  DreamTeamHistorialAppend,
  DreamTeamMotivo,
  DreamTeamParticipationEvent,
  DreamTeamRequisito,
  DreamTeamRequisitoVerificacion,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from './types'
import type {
  DreamTeamRepository,
  DreamTeamServicioFiltros,
  DreamTeamServicioUpdate,
} from './repository'

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

// The new dream_team_* tables are not yet in the generated Database types.
// We cast the injected client to any internally and cast row shapes explicitly.
type DbClient = SupabaseClient

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asDb(client: DbClient): any {
  return client
}

// ── Row shapes (snake_case) ───────────────────────────────────────

interface DbEquipo {
  id: string
  experiencia: string
  parent_equipo_id: string | null
  label: string
  activo: boolean
}

interface DbRol {
  id: string
  equipo_id: string
  label: string
  parent_rol_id: string | null
  activo: boolean
}

interface DbServicio {
  id: string
  persona_id: string
  equipo_id: string
  rol_id: string
  estado: DreamTeamEstado
  fecha_inicio: string
  fecha_fin: string | null
  motivo_actual: DreamTeamMotivo
  version: number
}

interface DbRequisito {
  id: string
  equipo_id: string
  rol_id: string
  codigo: string
  label: string
  tipo: DreamTeamRequisito['tipo']
  obligatoriedad: DreamTeamRequisito['obligatoriedad']
}

interface DbRequisitoVerificacion {
  id: string
  servicio_id: string
  requisito_id: string
  estado: DreamTeamRequisitoVerificacion['estado']
  fecha_verificacion: string | null
  verificado_por: string | null
  fecha_vencimiento: string | null
}

interface DbEstadoHistorial {
  id: string
  servicio_id: string
  estado_anterior: DreamTeamEstado
  estado_nuevo: DreamTeamEstado
  motivo: DreamTeamMotivo
  detalle_motivo: string | null
  actor_persona_id: string
  fecha: string
  paused_grants_snapshot: unknown
}

interface DbParticipationEvent {
  id: string
  persona_id: string
  servicio_id: string
  tipo_evento: DreamTeamParticipationEvent['tipoEvento']
  payload: unknown
  fecha: string
}

// ── Mappers ───────────────────────────────────────────────────────

function mapEquipo(row: DbEquipo): DreamTeamEquipo {
  return {
    id: row.id,
    experiencia: row.experiencia as DreamTeamEquipo['experiencia'],
    parentEquipoId: row.parent_equipo_id ?? undefined,
    label: row.label,
    activo: row.activo,
  }
}

function mapRol(row: DbRol): DreamTeamRol {
  return {
    id: row.id,
    equipoId: row.equipo_id,
    label: row.label,
    parentRolId: row.parent_rol_id ?? undefined,
    activo: row.activo,
  }
}

function mapServicio(row: DbServicio): DreamTeamServicio {
  return {
    id: row.id,
    personaId: row.persona_id as PersonaId,
    equipoId: row.equipo_id,
    rolId: row.rol_id,
    estado: row.estado,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin ?? undefined,
    motivoActual: row.motivo_actual,
    version: row.version,
  }
}

function mapRequisito(row: DbRequisito): DreamTeamRequisito {
  return {
    id: row.id,
    equipoId: row.equipo_id,
    rolId: row.rol_id,
    codigo: row.codigo,
    label: row.label,
    tipo: row.tipo,
    obligatoriedad: row.obligatoriedad,
  }
}

function mapRequisitoVerificacion(row: DbRequisitoVerificacion): DreamTeamRequisitoVerificacion {
  return {
    id: row.id,
    servicioId: row.servicio_id,
    requisitoId: row.requisito_id,
    estado: row.estado,
    fechaVerificacion: row.fecha_verificacion ?? undefined,
    verificadoPor: row.verificado_por ? (row.verificado_por as PersonaId) : undefined,
    fechaVencimiento: row.fecha_vencimiento ?? undefined,
  }
}

function mapEstadoHistorial(row: DbEstadoHistorial): DreamTeamEstadoHistorial {
  return {
    id: row.id,
    servicioId: row.servicio_id,
    estadoAnterior: row.estado_anterior,
    estadoNuevo: row.estado_nuevo,
    motivo: row.motivo,
    detalleMotivo: row.detalle_motivo ?? undefined,
    actorPersonaId: row.actor_persona_id as PersonaId,
    fecha: row.fecha,
    pausedGrantsSnapshot: parsePausedGrantsSnapshot(row.paused_grants_snapshot),
  }
}

function parsePausedGrantsSnapshot(value: unknown): DreamTeamEstadoHistorial['pausedGrantsSnapshot'] {
  if (!value) return undefined
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    if (!item || typeof item !== 'object') return { key: String(item), scope: item }
    const { key, scope } = item as Record<string, unknown>
    return { key: String(key), scope }
  })
}

function mapParticipationEvent(row: DbParticipationEvent): DreamTeamParticipationEvent {
  return {
    id: row.id,
    personaId: row.persona_id as PersonaId,
    servicioId: row.servicio_id,
    tipoEvento: row.tipo_evento,
    payload: typeof row.payload === 'object' && row.payload !== null ? (row.payload as Record<string, unknown>) : {},
    fecha: row.fecha,
  }
}

// ── Repository implementation ─────────────────────────────────────

export function createSupabaseDreamTeamRepository(client: DbClient): DreamTeamRepository {
  const db = asDb(client)

  async function createServicio(input: Omit<DreamTeamServicio, 'id' | 'version'>): Promise<DreamTeamServicio> {
    const { data, error } = await db
      .from('dream_team_servicios')
      .insert({
        persona_id: input.personaId,
        equipo_id: input.equipoId,
        rol_id: input.rolId,
        estado: input.estado,
        fecha_inicio: input.fechaInicio,
        motivo_actual: input.motivoActual,
      })
      .select()
      .single()

    if (error) throw error
    return mapServicio(data as DbServicio)
  }

  async function getServicioById(id: string): Promise<DreamTeamServicio | null> {
    const { data, error } = await client
      .from('dream_team_servicios')
      .select()
      .eq('id', id)
      .single()

    if (error || !data) return null
    return mapServicio(data as DbServicio)
  }

  async function listServicios(filtros: DreamTeamServicioFiltros): Promise<readonly DreamTeamServicio[]> {
    let query = db.from('dream_team_servicios').select()

    if (filtros.personaId !== undefined) {
      query = query.eq('persona_id', filtros.personaId)
    }
    if (filtros.equipoId !== undefined) {
      query = query.eq('equipo_id', filtros.equipoId)
    }
    if (filtros.rolId !== undefined) {
      query = query.eq('rol_id', filtros.rolId)
    }
    if (filtros.estado !== undefined) {
      const estados = Array.isArray(filtros.estado) ? filtros.estado : [filtros.estado]
      query = query.in('estado', estados)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapServicio(row as DbServicio))
  }

  async function updateServicio(id: string, update: DreamTeamServicioUpdate): Promise<DreamTeamServicio> {
    const current = await getServicioById(id)
    if (!current) {
      throw new Error(`Servicio ${id} not found`)
    }

    if (update.expectedVersion !== current.version) {
      throw new ConcurrencyConflictError(
        `expectedVersion ${update.expectedVersion} does not match current version ${current.version}`,
        { id, expectedVersion: update.expectedVersion, currentVersion: current.version },
      )
    }

    const estadoNuevo = update.estado ?? current.estado
    const updates: Record<string, unknown> = {
      estado: estadoNuevo,
      motivo_actual: update.motivoActual ?? current.motivoActual,
      version: current.version + 1,
    }

    if (update.estado === 'retirado') {
      updates.fecha_fin = new Date().toISOString()
    } else if (update.fechaFin !== undefined) {
      updates.fecha_fin = update.fechaFin
    }

    const { data, error } = await client
      .from('dream_team_servicios')
      .update(updates)
      .eq('id', id)
      .eq('version', update.expectedVersion)
      .select()
      .single()

    if (error) {
      if (error.message?.toLowerCase().includes('version') || error.code === 'PGRST116') {
        throw new ConcurrencyConflictError(
          `expectedVersion ${update.expectedVersion} does not match current version`,
          { id, expectedVersion: update.expectedVersion },
        )
      }
      throw error
    }

    if (!data) {
      throw new ConcurrencyConflictError(
        `expectedVersion ${update.expectedVersion} does not match current version`,
        { id, expectedVersion: update.expectedVersion },
      )
    }

    const updated = mapServicio(data as DbServicio)

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
  }

  async function listEquipos(): Promise<readonly DreamTeamEquipo[]> {
    const { data, error } = await db.from('dream_team_equipos').select()
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapEquipo(row as DbEquipo))
  }

  async function listRolesPorEquipo(equipoId: string): Promise<readonly DreamTeamRol[]> {
    const { data, error } = await db.from('dream_team_roles').select().eq('equipo_id', equipoId)
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapRol(row as DbRol))
  }

  async function listRequisitosPorRol(rolId: string): Promise<readonly DreamTeamRequisito[]> {
    const { data, error } = await db.from('dream_team_requisitos').select().eq('rol_id', rolId)
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapRequisito(row as DbRequisito))
  }

  async function upsertRequisito(requisito: DreamTeamRequisito): Promise<DreamTeamRequisito> {
    const { data, error } = await client
      .from('dream_team_requisitos')
      .upsert({
        id: requisito.id,
        equipo_id: requisito.equipoId,
        rol_id: requisito.rolId,
        codigo: requisito.codigo,
        label: requisito.label,
        tipo: requisito.tipo,
        obligatoriedad: requisito.obligatoriedad,
      })
      .select()
      .single()

    if (error) throw error
    return mapRequisito(data as DbRequisito)
  }

  async function listRequisitoVerificaciones(servicioId: string): Promise<readonly DreamTeamRequisitoVerificacion[]> {
    const { data, error } = await client
      .from('dream_team_requisitos_verificacion')
      .select()
      .eq('servicio_id', servicioId)
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapRequisitoVerificacion(row as DbRequisitoVerificacion))
  }

  async function upsertRequisitoVerificacion(
    verificacion: DreamTeamRequisitoVerificacion,
  ): Promise<DreamTeamRequisitoVerificacion> {
    const { data, error } = await client
      .from('dream_team_requisitos_verificacion')
      .upsert({
        id: verificacion.id,
        servicio_id: verificacion.servicioId,
        requisito_id: verificacion.requisitoId,
        estado: verificacion.estado,
        fecha_verificacion: verificacion.fechaVerificacion,
        verificado_por: verificacion.verificadoPor,
        fecha_vencimiento: verificacion.fechaVencimiento,
      })
      .select()
      .single()

    if (error) throw error
    return mapRequisitoVerificacion(data as DbRequisitoVerificacion)
  }

  async function appendHistorial(input: DreamTeamHistorialAppend): Promise<DreamTeamEstadoHistorial> {
    const { data, error } = await client
      .from('dream_team_estados_historial')
      .insert({
        servicio_id: input.servicioId,
        estado_anterior: input.estadoAnterior,
        estado_nuevo: input.estadoNuevo,
        motivo: input.motivo,
        detalle_motivo: input.detalleMotivo,
        actor_persona_id: input.actorPersonaId,
        fecha: input.fecha,
        paused_grants_snapshot: input.pausedGrantsSnapshot as unknown[],
      })
      .select()
      .single()

    if (error) throw error
    return mapEstadoHistorial(data as DbEstadoHistorial)
  }

  async function listHistorial(servicioId: string): Promise<readonly DreamTeamEstadoHistorial[]> {
    const { data, error } = await client
      .from('dream_team_estados_historial')
      .select()
      .eq('servicio_id', servicioId)
      .order('fecha', { ascending: true })
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapEstadoHistorial(row as DbEstadoHistorial))
  }

  async function countServiciosByEstado(estado: DreamTeamEstado): Promise<number> {
    const { count, error } = await client
      .from('dream_team_servicios')
      .select('*', { count: 'exact', head: true })
      .eq('estado', estado)
    if (error) throw error
    return count ?? 0
  }

  async function appendParticipationEvent(
    event: Omit<DreamTeamParticipationEvent, 'id'>,
  ): Promise<DreamTeamParticipationEvent> {
    const { data, error } = await client
      .from('dream_team_participation_eventos')
      .insert({
        persona_id: event.personaId,
        servicio_id: event.servicioId,
        tipo_evento: event.tipoEvento,
        payload: event.payload,
        fecha: event.fecha,
      })
      .select()
      .single()

    if (error) throw error
    return mapParticipationEvent(data as DbParticipationEvent)
  }

  async function listParticipationEvents(servicioId: string): Promise<readonly DreamTeamParticipationEvent[]> {
    const { data, error } = await client
      .from('dream_team_participation_eventos')
      .select()
      .eq('servicio_id', servicioId)
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapParticipationEvent(row as DbParticipationEvent))
  }

  async function listParticipationEventsByPersona(personaId: PersonaId): Promise<readonly DreamTeamParticipationEvent[]> {
    const { data, error } = await client
      .from('dream_team_participation_eventos')
      .select()
      .eq('persona_id', personaId)
    if (error) throw error
    return (data ?? []).map((row: unknown) => mapParticipationEvent(row as DbParticipationEvent))
  }

  return {
    createServicio,
    getServicioById,
    listServicios,
    updateServicio,
    listEquipos,
    listRolesPorEquipo,
    listRequisitosPorRol,
    upsertRequisito,
    listRequisitoVerificaciones,
    upsertRequisitoVerificacion,
    appendHistorial,
    listHistorial,
    countServiciosByEstado,
    appendParticipationEvent,
    listParticipationEvents,
    listParticipationEventsByPersona,
  }
}
