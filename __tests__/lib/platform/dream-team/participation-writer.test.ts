/**
 * @jest-environment node
 *
 * Tests for Dream Team participation event writer and its integration with
 * state transitions. Integration tests tagged `[integration:supabase]` are
 * skipped unless `RUN_INTEGRATION=1` is set.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { personaId } from '@/lib/platform/dream-team/types'
import type {
  DreamTeamEquipo,
  DreamTeamParticipationEvent,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from '@/lib/platform/dream-team/types'
import type { DreamTeamParticipationEventWriter } from '@/lib/platform/dream-team/repository'
import { createDreamTeamParticipationSupabaseWriter } from '@/lib/platform/adapters/participation-adapter'
import { transitionWithGrants } from '@/lib/platform/dream-team/servicios'
import { createPlatformGrantAudit } from '@/lib/platform/grants'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'

const RUN_INTEGRATION = Boolean(process.env.RUN_INTEGRATION)
const STAGING_URL = process.env.SUPABASE_STAGING_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const describeIntegration =
  RUN_INTEGRATION && STAGING_URL && SERVICE_ROLE_KEY ? describe : describe.skip

function createFakeParticipationWriter(): DreamTeamParticipationEventWriter {
  let nextId = 1
  const events: DreamTeamParticipationEvent[] = []

  return {
    async append(event: Omit<DreamTeamParticipationEvent, 'id'>) {
      const saved: DreamTeamParticipationEvent = { ...event, id: `evt-${nextId++}` }
      events.push(saved)
      return saved
    },
    async list(servicioId: string) {
      return events
        .filter((event) => event.servicioId === servicioId)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
    },
    async listByPersona(personaId: PersonaId) {
      return events
        .filter((event) => event.personaId === personaId)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    },
  }
}

function makeServicio(estado: DreamTeamServicio['estado']): DreamTeamServicio {
  return {
    id: 'servicio-1',
    personaId: personaId('persona-ana'),
    equipoId: 'equipo-dps-camara',
    rolId: 'rol-voluntario',
    estado,
    fechaInicio: '2026-01-01',
    motivoActual: 'admin_asignacion',
    version: 1,
  }
}

const equipoDps = { id: 'equipo-dps-camara', experiencia: 'dps' as const }
const equipoEstudiantes = { id: 'equipo-estudiantes-transit', experiencia: 'estudiantes' as const }
const rolVoluntario = { id: 'rol-voluntario', label: 'Voluntario' }
const rolLider = { id: 'rol-lider', label: 'Líder' }

function makeAdminClient(): SupabaseClient {
  if (!STAGING_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase staging credentials')
  }
  return createClient(STAGING_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function makeTestId(_prefix: string): string {
  return crypto.randomUUID()
}

function makePersonaId(name: string): PersonaId {
  return personaId(makeTestId(name))
}

function makeEquipo(overrides: Partial<DreamTeamEquipo> = {}): DreamTeamEquipo {
  return {
    id: makeTestId('equipo'),
    experiencia: 'dps',
    label: 'Equipo de prueba',
    activo: true,
    ...overrides,
  }
}

function makeRol(equipoId: string, overrides: Partial<DreamTeamRol> = {}): DreamTeamRol {
  return {
    id: makeTestId('rol'),
    equipoId,
    label: 'Rol de prueba',
    activo: true,
    ...overrides,
  }
}

function makeServicioInput(
  equipoId: string,
  rolId: string,
  overrides: Partial<Omit<DreamTeamServicio, 'id' | 'version'>> = {},
): Omit<DreamTeamServicio, 'id' | 'version'> {
  return {
    personaId: makePersonaId('persona'),
    equipoId,
    rolId,
    estado: 'postulado',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    ...overrides,
  }
}

async function seedEquipoRol(client: SupabaseClient) {
  const equipo = makeEquipo()
  const rol = makeRol(equipo.id)

  const { error: equipoError } = await client.from('dream_team_equipos').insert({
    id: equipo.id,
    experiencia: equipo.experiencia,
    label: equipo.label,
    activo: equipo.activo,
  })
  if (equipoError) throw equipoError

  const { error: rolError } = await client.from('dream_team_roles').insert({
    id: rol.id,
    equipo_id: rol.equipoId,
    label: rol.label,
    activo: rol.activo,
  })
  if (rolError) throw rolError

  return { equipo, rol }
}

async function cleanupAll(client: SupabaseClient, servicioIds: string[]) {
  for (const servicioId of servicioIds) {
    await client.from('dream_team_estados_historial').delete().eq('servicio_id', servicioId)
    await client.from('dream_team_requisitos_verificacion').delete().eq('servicio_id', servicioId)
    await client.from('dream_team_participation_eventos').delete().eq('servicio_id', servicioId)
  }

  const { data: servicios } = await client
    .from('dream_team_servicios')
    .select('id, equipo_id, rol_id')
    .in('id', servicioIds)

  await client.from('dream_team_servicios').delete().in('id', servicioIds)

  if (servicios && servicios.length > 0) {
    const equipoIds = [...new Set(servicios.map((s) => s.equipo_id))]
    const rolIds = [...new Set(servicios.map((s) => s.rol_id))]
    await client.from('dream_team_requisitos').delete().in('rol_id', rolIds)
    await client.from('dream_team_roles').delete().in('id', rolIds)
    await client.from('dream_team_equipos').delete().in('id', equipoIds)
  }
}

describe('DreamTeamParticipationEventWriter (fake)', () => {
  it('appends a valid event and returns it with an autogenerated id', async () => {
    const writer = createFakeParticipationWriter()

    const saved = await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-1',
      tipoEvento: 'service_state_changed',
      payload: { from: 'postulado', to: 'activo', motivo: 'admin_promocion' },
      fecha: '2026-07-07T00:00:00.000Z',
    })

    expect(saved.id).toBe('evt-1')
    expect(saved.personaId).toBe('persona-ana')
    expect(saved.servicioId).toBe('servicio-1')
    expect(saved.tipoEvento).toBe('service_state_changed')
    expect(saved.payload).toEqual({ from: 'postulado', to: 'activo', motivo: 'admin_promocion' })
  })

  it('lists events by servicio in ascending fecha order', async () => {
    const writer = createFakeParticipationWriter()

    await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-a',
      tipoEvento: 'service_state_changed',
      payload: { step: 2 },
      fecha: '2026-07-08T00:00:00.000Z',
    })
    await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-a',
      tipoEvento: 'service_state_changed',
      payload: { step: 1 },
      fecha: '2026-07-07T00:00:00.000Z',
    })
    await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-b',
      tipoEvento: 'service_state_changed',
      payload: { step: 3 },
      fecha: '2026-07-06T00:00:00.000Z',
    })

    const events = await writer.list('servicio-a')

    expect(events).toHaveLength(2)
    expect(events[0].fecha).toBe('2026-07-07T00:00:00.000Z')
    expect(events[1].fecha).toBe('2026-07-08T00:00:00.000Z')
  })

  it('lists events by persona in descending fecha order', async () => {
    const writer = createFakeParticipationWriter()

    await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-a',
      tipoEvento: 'service_state_changed',
      payload: { step: 1 },
      fecha: '2026-07-07T00:00:00.000Z',
    })
    await writer.append({
      personaId: personaId('persona-ana'),
      servicioId: 'servicio-b',
      tipoEvento: 'service_reactivated',
      payload: { step: 2 },
      fecha: '2026-07-09T00:00:00.000Z',
    })
    await writer.append({
      personaId: personaId('persona-luis'),
      servicioId: 'servicio-c',
      tipoEvento: 'service_state_changed',
      payload: { step: 3 },
      fecha: '2026-07-08T00:00:00.000Z',
    })

    const events = await writer.listByPersona(personaId('persona-ana'))

    expect(events).toHaveLength(2)
    expect(events[0].fecha).toBe('2026-07-09T00:00:00.000Z')
    expect(events[1].fecha).toBe('2026-07-07T00:00:00.000Z')
  })
})

describeIntegration('[integration:supabase] DreamTeamParticipationSupabaseWriter', () => {
  let client: SupabaseClient
  let writer: DreamTeamParticipationEventWriter
  const createdServicioIds: string[] = []

  beforeAll(async () => {
    client = makeAdminClient()
    writer = createDreamTeamParticipationSupabaseWriter(client)
  })

  afterEach(async () => {
    await cleanupAll(client, createdServicioIds)
    createdServicioIds.length = 0
  })

  async function seedServicio(overrides: Partial<Omit<DreamTeamServicio, 'id' | 'version'>> = {}) {
    const { equipo, rol } = await seedEquipoRol(client)
    const repo = createSupabaseDreamTeamRepository(client)
    const input = makeServicioInput(equipo.id, rol.id, overrides)
    const servicio = await repo.createServicio(input)
    createdServicioIds.push(servicio.id)
    return { equipo, rol, servicio }
  }

  it('appends an event to staging and returns it with an id', async () => {
    const { servicio } = await seedServicio()

    const saved = await writer.append({
      personaId: servicio.personaId,
      servicioId: servicio.id,
      tipoEvento: 'service_state_changed',
      payload: { from: 'postulado', to: 'activo', motivo: 'admin_promocion' },
      fecha: '2026-07-07T00:00:00.000Z',
    })

    expect(saved.id).toMatch(/^[0-9a-fA-F-]{36}$/)
    expect(saved.servicioId).toBe(servicio.id)
    expect(saved.tipoEvento).toBe('service_state_changed')
  })

  it('lists the appended event by servicio', async () => {
    const { servicio } = await seedServicio()

    await writer.append({
      personaId: servicio.personaId,
      servicioId: servicio.id,
      tipoEvento: 'service_state_changed',
      payload: { from: 'postulado', to: 'activo' },
      fecha: '2026-07-07T00:00:00.000Z',
    })

    const events = await writer.list(servicio.id)

    expect(events).toHaveLength(1)
    expect(events[0].servicioId).toBe(servicio.id)
    expect(events[0].tipoEvento).toBe('service_state_changed')
  })

  it('lists events by persona in descending order', async () => {
    const { servicio: a } = await seedServicio()
    const { servicio: b } = await seedServicio({ personaId: a.personaId })

    await writer.append({
      personaId: a.personaId,
      servicioId: a.id,
      tipoEvento: 'service_state_changed',
      payload: { step: 1 },
      fecha: '2026-07-07T00:00:00.000Z',
    })
    await writer.append({
      personaId: a.personaId,
      servicioId: b.id,
      tipoEvento: 'service_reactivated',
      payload: { step: 2 },
      fecha: '2026-07-09T00:00:00.000Z',
    })

    const events = await writer.listByPersona(a.personaId)

    expect(events).toHaveLength(2)
    expect(new Date(events[0].fecha).toISOString()).toBe('2026-07-09T00:00:00.000Z')
    expect(new Date(events[1].fecha).toISOString()).toBe('2026-07-07T00:00:00.000Z')
  })
})

describe('transitionWithGrants participation events', () => {
  it('emits service_state_changed when activating a service', async () => {
    const audit = createPlatformGrantAudit()
    const writer = createFakeParticipationWriter()

    const result = await transitionWithGrants({
      servicio: makeServicio('en_orientacion'),
      estadoNuevo: 'activo',
      motivo: 'admin_promocion',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
      participationWriter: writer,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.participationEvents).toHaveLength(1)
    expect(result.participationEvents?.[0]).toEqual({
      tipo: 'service_state_changed',
      payload: { from: 'en_orientacion', to: 'activo', motivo: 'admin_promocion' },
    })

    const stored = await writer.list('servicio-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].tipoEvento).toBe('service_state_changed')
  })

  it('emits service_state_changed with snapshot_id when pausing a service', async () => {
    const audit = createPlatformGrantAudit()
    const writer = createFakeParticipationWriter()

    const result = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
      participationWriter: writer,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.participationEvents).toHaveLength(1)
    expect(result.participationEvents?.[0].tipo).toBe('service_state_changed')
    expect(result.participationEvents?.[0].payload).toMatchObject({
      from: 'activo',
      to: 'en_pausa',
      motivo: 'admin_pausa',
      snapshot_id: '2026-07-07T00:00:00.000Z',
    })
  })

  it('emits service_reactivated when restoring from pause', async () => {
    const auditPause = createPlatformGrantAudit()
    const paused = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit: auditPause,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(paused.ok).toBe(true)
    if (!paused.ok) throw new Error('expected ok')

    const writer = createFakeParticipationWriter()
    const auditRestore = createPlatformGrantAudit()
    const restored = await transitionWithGrants({
      servicio: paused.servicioNuevo,
      estadoNuevo: 'activo',
      motivo: 'admin_reactivacion',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-14T00:00:00.000Z',
      audit: auditRestore,
      previousSnapshot: paused.pausedGrantsSnapshot,
      participationWriter: writer,
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('expected ok')
    expect(restored.participationEvents).toHaveLength(1)
    expect(restored.participationEvents?.[0]).toEqual({
      tipo: 'service_reactivated',
      payload: { from: 'en_pausa', to: 'activo', motivo: 'admin_reactivacion' },
    })

    const stored = await writer.list(paused.servicioNuevo.id)
    expect(stored).toHaveLength(1)
    expect(stored[0].tipoEvento).toBe('service_reactivated')
  })

  it('emits service_retired when retiring a service', async () => {
    const audit = createPlatformGrantAudit()
    const writer = createFakeParticipationWriter()

    const result = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'retirado',
      motivo: 'admin_retiro',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
      participationWriter: writer,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.participationEvents).toHaveLength(1)
    expect(result.participationEvents?.[0]).toEqual({
      tipo: 'service_retired',
      payload: { from: 'activo', to: 'retirado', motivo: 'admin_retiro' },
    })
  })

  it('returns participationEvents without appending when no writer is provided', async () => {
    const audit = createPlatformGrantAudit()

    const result = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'retirado',
      motivo: 'admin_retiro',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.participationEvents).toHaveLength(1)
    expect(result.participationEvents?.[0].tipo).toBe('service_retired')
  })
})

describe('Caso Ana: mixed services and participation events', () => {
  it('only emits events for the service that transitions', async () => {
    const ana = personaId('persona-ana')
    const audit = createPlatformGrantAudit()
    const writer = createFakeParticipationWriter()

    const servicioDps: DreamTeamServicio = {
      ...makeServicio('activo'),
      id: 'servicio-dps',
      personaId: ana,
      equipoId: equipoDps.id,
      rolId: rolVoluntario.id,
    }
    const servicioEstudiantes: DreamTeamServicio = {
      ...makeServicio('activo'),
      id: 'servicio-estudiantes',
      personaId: ana,
      equipoId: equipoEstudiantes.id,
      rolId: rolLider.id,
    }

    const pauseResult = await transitionWithGrants({
      servicio: servicioEstudiantes,
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00.000Z',
      audit,
      equipo: equipoEstudiantes,
      rol: rolLider,
      participationWriter: writer,
    })

    expect(pauseResult.ok).toBe(true)
    if (!pauseResult.ok) throw new Error('expected ok')
    expect(pauseResult.participationEvents?.[0].tipo).toBe('service_state_changed')
    expect(pauseResult.participationEvents?.[0].payload).toMatchObject({
      from: 'activo',
      to: 'en_pausa',
    })

    const restoreResult = await transitionWithGrants({
      servicio: pauseResult.servicioNuevo,
      estadoNuevo: 'activo',
      motivo: 'admin_reactivacion',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-14T00:00:00.000Z',
      audit: createPlatformGrantAudit(),
      previousSnapshot: pauseResult.pausedGrantsSnapshot,
      participationWriter: writer,
    })

    expect(restoreResult.ok).toBe(true)
    if (!restoreResult.ok) throw new Error('expected ok')
    expect(restoreResult.participationEvents?.[0].tipo).toBe('service_reactivated')

    const dpsEvents = await writer.list('servicio-dps')
    expect(dpsEvents).toHaveLength(0)

    const anaEvents = await writer.listByPersona(ana)
    expect(anaEvents).toHaveLength(2)
    expect(anaEvents.every((event) => event.personaId === ana)).toBe(true)
    expect(anaEvents[0].tipoEvento).toBe('service_reactivated')
    expect(anaEvents[1].tipoEvento).toBe('service_state_changed')
  })
})
