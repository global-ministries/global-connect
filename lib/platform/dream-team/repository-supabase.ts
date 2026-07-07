import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
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

// Tipado estricto: el cliente conoce las tablas de Database.
type DbClient = SupabaseClient<Database, 'public'>

// ── Row shapes (snake_case) derivadas de los tipos generados ─────────

type DbEquipo = Database['public']['Tables']['dream_team_equipos']['Row']
type DbRol = Database['public']['Tables']['dream_team_roles']['Row']
type DbServicio = Database['public']['Tables']['dream_team_servicios']['Row']
type DbRequisito = Database['public']['Tables']['dream_team_requisitos']['Row']
type DbRequisitoVerificacion =
  Database['public']['Tables']['dream_team_requisitos_verificacion']['Row']
type DbEstadoHistorial =
  Database['public']['Tables']['dream_team_estados_historial']['Row']
type DbParticipationEvent =
  Database['public']['Tables']['dream_team_participation_eventos']['Row']

type DbServicioUpdate = Database['public']['Tables']['dream_team_servicios']['Update']
type DbEstadoHistorialInsert =
  Database['public']['Tables']['dream_team_estados_historial']['Insert']

// ── Mappers ─────────────────────────────────────────────────────────

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
    estado: row.estado as DreamTeamEstado,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin ?? undefined,
    motivoActual: row.motivo_actual as DreamTeamMotivo,
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
    tipo: row.tipo as DreamTeamRequisito['tipo'],
    obligatoriedad: row.obligatoriedad as DreamTeamRequisito['obligatoriedad'],
  }
}

function mapRequisitoVerificacion(row: DbRequisitoVerificacion): DreamTeamRequisitoVerificacion {
  return {
    id: row.id,
    servicioId: row.servicio_id,
    requisitoId: row.requisito_id,
    estado: row.estado as DreamTeamRequisitoVerificacion['estado'],
    fechaVerificacion: row.fecha_verificacion ?? undefined,
    verificadoPor: row.verificado_por ? (row.verificado_por as PersonaId) : undefined,
    fechaVencimiento: row.fecha_vencimiento ?? undefined,
  }
}

function mapEstadoHistorial(row: DbEstadoHistorial): DreamTeamEstadoHistorial {
  return {
    id: row.id,
    servicioId: row.servicio_id,
    estadoAnterior: row.estado_anterior as DreamTeamEstado,
    estadoNuevo: row.estado_nuevo as DreamTeamEstado,
    motivo: row.motivo as DreamTeamMotivo,
    detalleMotivo: row.detalle_motivo ?? undefined,
    actorPersonaId: row.actor_persona_id as PersonaId,
    fecha: row.fecha,
    pausedGrantsSnapshot: parsePausedGrantsSnapshot(row.paused_grants_snapshot),
  }
}

function parsePausedGrantsSnapshot(
  value: DbEstadoHistorial['paused_grants_snapshot'],
): DreamTeamEstadoHistorial['pausedGrantsSnapshot'] {
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
    tipoEvento: row.tipo_evento as DreamTeamParticipationEvent['tipoEvento'],
    payload: typeof row.payload === 'object' && row.payload !== null ? (row.payload as Record<string, unknown>) : {},
    fecha: row.fecha,
  }
}

// ── Repository implementation ───────────────────────────────────────

export function createSupabaseDreamTeamRepository(client: DbClient): DreamTeamRepository {
  async function createServicio(input: Omit<DreamTeamServicio, 'id' | 'version'>): Promise<DreamTeamServicio> {
    const { data, error } = await client
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
    return mapServicio(data)
  }

  async function getServicioById(id: string): Promise<DreamTeamServicio | null> {
    const { data, error } = await client
      .from('dream_team_servicios')
      .select()
      .eq('id', id)
      .single()

    if (error || !data) return null
    return mapServicio(data)
  }

  async function listServicios(filtros: DreamTeamServicioFiltros): Promise<readonly DreamTeamServicio[]> {
    let query = client.from('dream_team_servicios').select()

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
    return (data ?? []).map(mapServicio)
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
    const updates: DbServicioUpdate = {
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

    const updated = mapServicio(data)

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
    const { data, error } = await client.from('dream_team_equipos').select()
    if (error) throw error
    return (data ?? []).map(mapEquipo)
  }

  async function listRolesPorEquipo(equipoId: string): Promise<readonly DreamTeamRol[]> {
    const { data, error } = await client.from('dream_team_roles').select().eq('equipo_id', equipoId)
    if (error) throw error
    return (data ?? []).map(mapRol)
  }

  async function listRequisitosPorRol(rolId: string): Promise<readonly DreamTeamRequisito[]> {
    const { data, error } = await client.from('dream_team_requisitos').select().eq('rol_id', rolId)
    if (error) throw error
    return (data ?? []).map(mapRequisito)
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
    return mapRequisito(data)
  }

  async function listRequisitoVerificaciones(servicioId: string): Promise<readonly DreamTeamRequisitoVerificacion[]> {
    const { data, error } = await client
      .from('dream_team_requisitos_verificacion')
      .select()
      .eq('servicio_id', servicioId)
    if (error) throw error
    return (data ?? []).map(mapRequisitoVerificacion)
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
    return mapRequisitoVerificacion(data)
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
        paused_grants_snapshot: input.pausedGrantsSnapshot as DbEstadoHistorialInsert['paused_grants_snapshot'],
      })
      .select()
      .single()

    if (error) throw error
    return mapEstadoHistorial(data)
  }

  async function listHistorial(servicioId: string): Promise<readonly DreamTeamEstadoHistorial[]> {
    const { data, error } = await client
      .from('dream_team_estados_historial')
      .select()
      .eq('servicio_id', servicioId)
      .order('fecha', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapEstadoHistorial)
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
        payload: event.payload as DbParticipationEvent['payload'],
        fecha: event.fecha,
      })
      .select()
      .single()

    if (error) throw error
    return mapParticipationEvent(data)
  }

  async function listParticipationEvents(servicioId: string): Promise<readonly DreamTeamParticipationEvent[]> {
    const { data, error } = await client
      .from('dream_team_participation_eventos')
      .select()
      .eq('servicio_id', servicioId)
    if (error) throw error
    return (data ?? []).map(mapParticipationEvent)
  }

  async function listParticipationEventsByPersona(personaId: PersonaId): Promise<readonly DreamTeamParticipationEvent[]> {
    const { data, error } = await client
      .from('dream_team_participation_eventos')
      .select()
      .eq('persona_id', personaId)
    if (error) throw error
    return (data ?? []).map(mapParticipationEvent)
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
