/**
 * @jest-environment node
 *
 * Integration tests for `createSupabaseDreamTeamRepository` against the real
 * `supabase_global_staging` database. These are tagged `[integration:supabase]`
 * and are skipped unless `RUN_INTEGRATION=1` is present in the environment.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { personaId } from '@/lib/platform/dream-team/types'
import type {
  DreamTeamEquipo,
  DreamTeamEstadoHistorial,
  DreamTeamParticipationEvent,
  DreamTeamRequisito,
  DreamTeamRequisitoVerificacion,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from '@/lib/platform/dream-team/types'
import type { DreamTeamRepository } from '@/lib/platform/dream-team/repository'

const RUN_INTEGRATION = Boolean(process.env.RUN_INTEGRATION)
const STAGING_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const describeIntegration =
  RUN_INTEGRATION && STAGING_URL && SERVICE_ROLE_KEY ? describe : describe.skip

type ConcurrencyConflictErrorClass = {
  new (message: string, context?: Readonly<Record<string, unknown>>): Error
  readonly prototype: Error
}

type RepositoryModule = {
  createSupabaseDreamTeamRepository(client: SupabaseClient): DreamTeamRepository
  ConcurrencyConflictError: ConcurrencyConflictErrorClass
}

async function loadRepository(): Promise<RepositoryModule> {
  const imported = (await import('@/lib/platform/dream-team/repository-supabase')) as RepositoryModule
  return {
    createSupabaseDreamTeamRepository: imported.createSupabaseDreamTeamRepository,
    ConcurrencyConflictError: imported.ConcurrencyConflictError,
  }
}

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

function makeTestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
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

function makeRequisito(rolId: string, equipoId: string): DreamTeamRequisito {
  return {
    id: makeTestId('requisito'),
    equipoId,
    rolId,
    codigo: 'req-test',
    label: 'Requisito de prueba',
    tipo: 'documento',
    obligatoriedad: 'requerido',
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

async function seedServicio(
  client: SupabaseClient,
  repo: DreamTeamRepository,
  overrides: Partial<Omit<DreamTeamServicio, 'id' | 'version'>> = {},
) {
  const { equipo, rol } = await seedEquipoRol(client)
  const input = makeServicioInput(equipo.id, rol.id, overrides)
  const servicio = await repo.createServicio(input)
  return { equipo, rol, servicio }
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

describeIntegration('[integration:supabase] createSupabaseDreamTeamRepository', () => {
  let client: SupabaseClient
  let repo: import('@/lib/platform/dream-team/repository').DreamTeamRepository
  let ConcurrencyConflictError: ConcurrencyConflictErrorClass
  const createdServicioIds: string[] = []

  beforeAll(async () => {
    client = makeAdminClient()
    const mod = await loadRepository()
    repo = mod.createSupabaseDreamTeamRepository(client)
    ConcurrencyConflictError = mod.ConcurrencyConflictError
  })

  afterEach(async () => {
    await cleanupAll(client, createdServicioIds)
    createdServicioIds.length = 0
  })

  describe('createServicio + getServicioById', () => {
    it('inserts a service and retrieves it by id', async () => {
      const { servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const found = await repo.getServicioById(servicio.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(servicio.id)
      expect(found!.personaId).toBe(servicio.personaId)
      expect(found!.equipoId).toBe(servicio.equipoId)
      expect(found!.rolId).toBe(servicio.rolId)
      expect(found!.estado).toBe(servicio.estado)
      expect(found!.version).toBe(1)
    })

    it('returns null for an unknown service id', async () => {
      const found = await repo.getServicioById(makeTestId('missing'))
      expect(found).toBeNull()
    })
  })

  describe('listServicios filters', () => {
    it('lists all services when no filters are provided', async () => {
      const { servicio: a } = await seedServicio(client, repo)
      const { servicio: b } = await seedServicio(client, repo)
      createdServicioIds.push(a.id, b.id)

      const all = await repo.listServicios({})

      const ids = all.map((s) => s.id)
      expect(ids).toContain(a.id)
      expect(ids).toContain(b.id)
    })

    it('filters by personaId', async () => {
      const ana = makePersonaId('ana')
      const luis = makePersonaId('luis')
      const { servicio: a } = await seedServicio(client, repo, { personaId: ana })
      const { servicio: b } = await seedServicio(client, repo, { personaId: luis })
      createdServicioIds.push(a.id, b.id)

      const result = await repo.listServicios({ personaId: ana })

      expect(result).toHaveLength(1)
      expect(result[0].personaId).toBe(ana)
    })

    it('filters by equipoId', async () => {
      const { equipo, rol, servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const result = await repo.listServicios({ equipoId: equipo.id })

      expect(result).toHaveLength(1)
      expect(result[0].equipoId).toBe(equipo.id)
    })

    it('filters by rolId', async () => {
      const { equipo, rol, servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const result = await repo.listServicios({ rolId: rol.id })

      expect(result).toHaveLength(1)
      expect(result[0].rolId).toBe(rol.id)
    })

    it('filters by a single estado', async () => {
      const { servicio: active } = await seedServicio(client, repo, { estado: 'activo' })
      const { servicio: paused } = await seedServicio(client, repo, { estado: 'en_pausa' })
      createdServicioIds.push(active.id, paused.id)

      const result = await repo.listServicios({ estado: 'activo' })

      expect(result).toHaveLength(1)
      expect(result[0].estado).toBe('activo')
    })

    it('filters by an array of estados', async () => {
      const { servicio: active } = await seedServicio(client, repo, { estado: 'activo' })
      const { servicio: paused } = await seedServicio(client, repo, { estado: 'en_pausa' })
      const { servicio: retired } = await seedServicio(client, repo, { estado: 'retirado' })
      createdServicioIds.push(active.id, paused.id, retired.id)

      const result = await repo.listServicios({ estado: ['activo', 'en_pausa'] })

      expect(result).toHaveLength(2)
      expect(result.map((s) => s.estado).sort()).toEqual(['activo', 'en_pausa'])
    })
  })

  describe('updateServicio versioning', () => {
    it('increments version on successful update', async () => {
      const { servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const updated = await repo.updateServicio(servicio.id, {
        estado: 'en_pausa',
        motivoActual: 'admin_pausa',
        expectedVersion: servicio.version,
      })

      expect(updated.version).toBe(servicio.version + 1)
      expect(updated.estado).toBe('en_pausa')
      expect(updated.motivoActual).toBe('admin_pausa')

      const found = await repo.getServicioById(servicio.id)
      expect(found).toEqual(updated)
    })

    it('throws ConcurrencyConflictError when expectedVersion mismatches and leaves row intact', async () => {
      const { servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      await expect(
        repo.updateServicio(servicio.id, {
          estado: 'en_pausa',
          motivoActual: 'admin_pausa',
          expectedVersion: servicio.version + 99,
        }),
      ).rejects.toThrow(ConcurrencyConflictError)

      const found = await repo.getServicioById(servicio.id)
      expect(found).toEqual(servicio)
    })

    it('sets fechaFin when transitioning to retirado', async () => {
      const { servicio } = await seedServicio(client, repo, { estado: 'activo' })
      createdServicioIds.push(servicio.id)

      const updated = await repo.updateServicio(servicio.id, {
        estado: 'retirado',
        motivoActual: 'admin_retiro',
        expectedVersion: servicio.version,
      })

      expect(updated.estado).toBe('retirado')
      expect(updated.fechaFin).toBeDefined()
      expect(typeof updated.fechaFin).toBe('string')

      const found = await repo.getServicioById(servicio.id)
      expect(found!.fechaFin).toBe(updated.fechaFin)
    })
  })

  describe('historial', () => {
    it('appends a history entry on estado change', async () => {
      const { servicio } = await seedServicio(client, repo, { estado: 'activo' })
      createdServicioIds.push(servicio.id)

      await repo.updateServicio(servicio.id, {
        estado: 'en_pausa',
        motivoActual: 'admin_pausa',
        detalleMotivo: 'pausa administrativa',
        expectedVersion: servicio.version,
      })

      const historial = await repo.listHistorial(servicio.id)

      expect(historial).toHaveLength(1)
      expect(historial[0].estadoAnterior).toBe('activo')
      expect(historial[0].estadoNuevo).toBe('en_pausa')
      expect(historial[0].motivo).toBe('admin_pausa')
      expect(historial[0].detalleMotivo).toBe('pausa administrativa')
      expect(historial[0].actorPersonaId).toBe(servicio.personaId)
    })

    it('does not append historial when estado is unchanged', async () => {
      const { servicio } = await seedServicio(client, repo, { estado: 'activo' })
      createdServicioIds.push(servicio.id)

      await repo.updateServicio(servicio.id, {
        motivoActual: 'admin_promocion',
        expectedVersion: servicio.version,
      })

      const historial = await repo.listHistorial(servicio.id)
      expect(historial).toHaveLength(0)
    })

    it('returns history entries ordered by fecha', async () => {
      const { servicio } = await seedServicio(client, repo, { estado: 'postulado' })
      createdServicioIds.push(servicio.id)

      const v1 = await repo.updateServicio(servicio.id, {
        estado: 'en_orientacion',
        motivoActual: 'admin_promocion',
        expectedVersion: servicio.version,
      })
      const v2 = await repo.updateServicio(servicio.id, {
        estado: 'activo',
        motivoActual: 'admin_promocion',
        expectedVersion: v1.version,
      })

      const historial = await repo.listHistorial(servicio.id)

      expect(historial).toHaveLength(2)
      expect(historial[0].estadoNuevo).toBe('en_orientacion')
      expect(historial[1].estadoNuevo).toBe('activo')
    })
  })

  describe('requisitos', () => {
    it('upserts a requisito and lists it by rol', async () => {
      const { equipo, rol, servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const requisito = makeRequisito(rol.id, equipo.id)
      const saved = await repo.upsertRequisito(requisito)
      const list = await repo.listRequisitosPorRol(rol.id)

      expect(saved).toEqual(requisito)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(requisito)
    })

    it('updates an existing requisito on upsert', async () => {
      const { equipo, rol, servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const original = makeRequisito(rol.id, equipo.id)
      await repo.upsertRequisito(original)
      const updated = { ...original, label: 'Updated label' }
      const saved = await repo.upsertRequisito(updated)
      const list = await repo.listRequisitosPorRol(rol.id)

      expect(saved.label).toBe('Updated label')
      expect(list).toHaveLength(1)
      expect(list[0].label).toBe('Updated label')
    })
  })

  describe('verificacion de requisitos', () => {
    it('upserts a verificacion and lists it by servicio', async () => {
      const { servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const verificacion: DreamTeamRequisitoVerificacion = {
        id: makeTestId('verificacion'),
        servicioId: servicio.id,
        requisitoId: makeTestId('requisito'),
        estado: 'pendiente',
      }
      const saved = await repo.upsertRequisitoVerificacion(verificacion)
      const list = await repo.listRequisitoVerificaciones(servicio.id)

      expect(saved).toEqual(verificacion)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(verificacion)
    })
  })

  describe('participation events', () => {
    it('appends and lists events by servicio and persona', async () => {
      const { servicio } = await seedServicio(client, repo)
      createdServicioIds.push(servicio.id)

      const event: Omit<DreamTeamParticipationEvent, 'id'> = {
        personaId: servicio.personaId,
        servicioId: servicio.id,
        tipoEvento: 'service_state_changed',
        payload: { foo: 'bar' },
        fecha: '2026-07-07T00:00:00.000Z',
      }
      const saved = await repo.appendParticipationEvent(event)
      const byServicio = await repo.listParticipationEvents(servicio.id)
      const byPersona = await repo.listParticipationEventsByPersona(servicio.personaId)

      expect(saved.id).toMatch(/^[0-9a-fA-F-]{36}$/)
      expect(byServicio).toHaveLength(1)
      expect(byServicio[0].tipoEvento).toBe('service_state_changed')
      expect(byPersona).toHaveLength(1)
      expect(byPersona[0].personaId).toBe(servicio.personaId)
    })
  })

  describe('countServiciosByEstado', () => {
    it('counts services by estado', async () => {
      const { servicio: a } = await seedServicio(client, repo, { estado: 'activo' })
      const { servicio: b } = await seedServicio(client, repo, { estado: 'activo' })
      const { servicio: c } = await seedServicio(client, repo, { estado: 'en_pausa' })
      createdServicioIds.push(a.id, b.id, c.id)

      expect(await repo.countServiciosByEstado('activo')).toBe(2)
      expect(await repo.countServiciosByEstado('en_pausa')).toBe(1)
      expect(await repo.countServiciosByEstado('retirado')).toBe(0)
    })
  })

  describe('Caso Ana', () => {
    it('keeps two services isolated when one is paused with pausedGrantsSnapshot', async () => {
      const ana = makePersonaId('ana')
      const { equipo: equipoDps, rol: rolDps } = await seedEquipoRol(client)
      const { equipo: equipoEst, rol: rolEst } = await seedEquipoRol(client)

      const dpsInput = makeServicioInput(equipoDps.id, rolDps.id, {
        personaId: ana,
        estado: 'activo',
        motivoActual: 'admin_promocion',
      })
      const estInput = makeServicioInput(equipoEst.id, rolEst.id, {
        personaId: ana,
        estado: 'activo',
        motivoActual: 'admin_promocion',
      })

      const dps = await repo.createServicio(dpsInput)
      const est = await repo.createServicio(estInput)
      createdServicioIds.push(dps.id, est.id)

      const anaServices = await repo.listServicios({ personaId: ana })
      expect(anaServices).toHaveLength(2)

      const anaActive = await repo.listServicios({ personaId: ana, estado: 'activo' })
      expect(anaActive).toHaveLength(2)

      const snapshot: DreamTeamEstadoHistorial['pausedGrantsSnapshot'] = [
        { key: 'dream_team.serve', scope: { experience: 'dps' } },
      ]

      await repo.updateServicio(dps.id, {
        estado: 'en_pausa',
        motivoActual: 'gdv_liderazgo_removed',
        expectedVersion: dps.version,
      })

      // Manually update the history entry with the snapshot, since the repository
      // layer intentionally does not know how to build grant snapshots.
      const historial = await repo.listHistorial(dps.id)
      expect(historial).toHaveLength(1)
      expect(historial[0].estadoNuevo).toBe('en_pausa')
      expect(historial[0].motivo).toBe('gdv_liderazgo_removed')

      const { error: snapshotError } = await client
        .from('dream_team_estados_historial')
        .update({ paused_grants_snapshot: snapshot })
        .eq('id', historial[0].id)
      expect(snapshotError).toBeNull()

      const historialAfter = await repo.listHistorial(dps.id)
      expect(historialAfter[0].pausedGrantsSnapshot).toEqual(snapshot)

      const estAfter = await repo.getServicioById(est.id)
      expect(estAfter).toMatchObject(est)
      expect(await repo.listHistorial(est.id)).toHaveLength(0)
    })
  })
})
