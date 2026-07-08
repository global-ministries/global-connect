/**
 * @jest-environment node
 *
 * End-to-end integration test for the "Ana" scenario against the real
 * `supabase_global_staging` database. Tagged `[integration:supabase]` and
 * skipped unless `RUN_INTEGRATION=1` is present in the environment.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { personaId } from '@/lib/platform/dream-team/types'
import type {
  DreamTeamEquipo,
  DreamTeamEstadoHistorial,
  DreamTeamParticipationEvent,
  DreamTeamRol,
  DreamTeamServicio,
  PersonaId,
} from '@/lib/platform/dream-team/types'
import type { DreamTeamRepository, DreamTeamParticipationEventWriter } from '@/lib/platform/dream-team/repository'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { createDreamTeamParticipationSupabaseWriter } from '@/lib/platform/adapters/participation-adapter'
import { transitionWithGrants } from '@/lib/platform/dream-team/servicios'
import { createPlatformGrantAudit } from '@/lib/platform/grants'
import { getDreamTeamMetrics } from '@/lib/platform/dream-team/metrics'

const RUN_INTEGRATION = Boolean(process.env.RUN_INTEGRATION)
const STAGING_URL = process.env.SUPABASE_STAGING_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const describeIntegration =
  RUN_INTEGRATION && STAGING_URL && SERVICE_ROLE_KEY ? describe : describe.skip

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

async function seedEquipoRol(
  client: SupabaseClient,
  experiencia: DreamTeamEquipo['experiencia'],
  label: string,
  rolLabel: string,
) {
  const equipo = makeEquipo({ experiencia, label })
  const rol = makeRol(equipo.id, { label: rolLabel })

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

async function truncateDreamTeamTables(client: SupabaseClient) {
  const tables = [
    'dream_team_requisitos_verificacion',
    'dream_team_estados_historial',
    'dream_team_participation_eventos',
    'dream_team_requisitos',
    'dream_team_servicios',
    'dream_team_roles',
    'dream_team_equipos',
  ]
  for (const table of tables) {
    const { error } = await client.from(table).delete().not('id', 'is', null)
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`Could not truncate ${table}: ${error.message}`)
    }
  }
}

describeIntegration('[integration:supabase] Caso Ana — DPS + Estudiantes end-to-end', () => {
  let client: SupabaseClient
  let repo: DreamTeamRepository
  let writer: DreamTeamParticipationEventWriter
  const createdServicioIds: string[] = []

  beforeAll(async () => {
    client = makeAdminClient()
    repo = createSupabaseDreamTeamRepository(client)
    writer = createDreamTeamParticipationSupabaseWriter(client)
  })

  afterEach(async () => {
    await cleanupAll(client, createdServicioIds)
    createdServicioIds.length = 0
  })

  afterAll(async () => {
    await truncateDreamTeamTables(client)
  })

  it('recorre el caso Ana completo: asignación, activación, pausa, aislamiento, reactivación y métricas', async () => {
    const ana = makePersonaId('ana')
    const now = new Date().toISOString()

    // ── Setup ─────────────────────────────────────────────────────────
    const { equipo: equipoDps, rol: rolVoluntario } = await seedEquipoRol(
      client,
      'dps',
      'DPS Producción Técnica',
      'Voluntario',
    )
    const { equipo: equipoEst, rol: rolLider } = await seedEquipoRol(
      client,
      'estudiantes',
      'Estudiantes Transit',
      'Líder de grupo',
    )

    // ── Asignar servicio 1: Ana como Voluntario en DPS (postulado) ───
    const dpsInput = makeServicioInput(equipoDps.id, rolVoluntario.id, {
      personaId: ana,
      estado: 'postulado',
      motivoActual: 'admin_asignacion',
    })
    const dpsServicio = await repo.createServicio(dpsInput)
    createdServicioIds.push(dpsServicio.id)

    // Promoción 1: postulado → en_orientacion (sin grants)
    const dpsToOrientacion = await transitionWithGrants({
      servicio: dpsServicio,
      estadoNuevo: 'en_orientacion',
      motivo: 'admin_promocion',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
    })
    expect(dpsToOrientacion.ok).toBe(true)
    if (dpsToOrientacion.ok) {
      expect(dpsToOrientacion.grantsDecision.action).toBe('noop')
    } else {
      throw new Error('expected dps orientacion transition to succeed')
    }

    const dpsEnOrientacion = await repo.updateServicio(dpsServicio.id, {
      estado: 'en_orientacion',
      motivoActual: 'admin_promocion',
      expectedVersion: dpsServicio.version,
    })

    // Promoción 2: en_orientacion → activo (grants emitidos)
    const dpsActivation = await transitionWithGrants({
      servicio: dpsEnOrientacion,
      estadoNuevo: 'activo',
      motivo: 'admin_promocion',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
      equipo: equipoDps,
      rol: rolVoluntario,
      participationWriter: writer,
    })
    expect(dpsActivation.ok).toBe(true)
    if (!dpsActivation.ok) throw new Error('expected dps activation to succeed')
    expect(dpsActivation.grantsDecision.action).toBe('grant')
    if (dpsActivation.grantsDecision.action !== 'grant') throw new Error('expected grant')
    const dpsGrantKeys = dpsActivation.grantsDecision.grants
      .map((g) => g.capabilityKey)
      .sort((a, b) => a.localeCompare(b))
    expect(dpsGrantKeys.length).toBe(2)
    expect(dpsGrantKeys).toContain('dream_team.serve')
    expect(dpsGrantKeys).toContain('dps.team.serve')

    const dpsActivo = await repo.updateServicio(dpsServicio.id, {
      estado: 'activo',
      motivoActual: 'admin_promocion',
      expectedVersion: dpsEnOrientacion.version,
    })
    expect(dpsActivo.estado).toBe('activo')

    // ── Asignar servicio 2: Ana como Líder de grupo en Estudiantes ────
    const estInput = makeServicioInput(equipoEst.id, rolLider.id, {
      personaId: ana,
      estado: 'postulado',
      motivoActual: 'admin_asignacion',
    })
    const estServicio = await repo.createServicio(estInput)
    createdServicioIds.push(estServicio.id)

    const estToOrientacion = await transitionWithGrants({
      servicio: estServicio,
      estadoNuevo: 'en_orientacion',
      motivo: 'admin_promocion',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
    })
    expect(estToOrientacion.ok).toBe(true)
    if (estToOrientacion.ok) {
      expect(estToOrientacion.grantsDecision.action).toBe('noop')
    } else {
      throw new Error('expected est orientacion transition to succeed')
    }

    const estEnOrientacion = await repo.updateServicio(estServicio.id, {
      estado: 'en_orientacion',
      motivoActual: 'admin_promocion',
      expectedVersion: estServicio.version,
    })

    const estActivation = await transitionWithGrants({
      servicio: estEnOrientacion,
      estadoNuevo: 'activo',
      motivo: 'admin_promocion',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
      equipo: equipoEst,
      rol: rolLider,
      participationWriter: writer,
    })
    expect(estActivation.ok).toBe(true)
    if (!estActivation.ok) throw new Error('expected est activation to succeed')
    expect(estActivation.grantsDecision.action).toBe('grant')
    if (estActivation.grantsDecision.action !== 'grant') throw new Error('expected grant')
    const estGrantKeys = estActivation.grantsDecision.grants
      .map((g) => g.capabilityKey)
      .sort((a, b) => a.localeCompare(b))
    expect(estGrantKeys.length).toBe(4)
    expect(estGrantKeys).toContain('dream_team.gdv.lead')
    expect(estGrantKeys).toContain('dream_team.lead')
    expect(estGrantKeys).toContain('dream_team.serve')
    expect(estGrantKeys).toContain('estudiantes.team.lead')

    const estActivo = await repo.updateServicio(estServicio.id, {
      estado: 'activo',
      motivoActual: 'admin_promocion',
      expectedVersion: estEnOrientacion.version,
    })
    expect(estActivo.estado).toBe('activo')

    // ── Verificar historial de activaciones ───────────────────────────
    const dpsHistorial = await repo.listHistorial(dpsServicio.id)
    const estHistorial = await repo.listHistorial(estServicio.id)
    expect(dpsHistorial.length).toBeGreaterThanOrEqual(1)
    expect(estHistorial.length).toBeGreaterThanOrEqual(1)
    expect(dpsHistorial.some((h) => h.estadoNuevo === 'en_orientacion')).toBe(true)
    expect(dpsHistorial.some((h) => h.estadoNuevo === 'activo')).toBe(true)
    expect(estHistorial.some((h) => h.estadoNuevo === 'en_orientacion')).toBe(true)
    expect(estHistorial.some((h) => h.estadoNuevo === 'activo')).toBe(true)

    // ── Verificar participation events post-activaciones ──────────────
    const anaEventsAfterActivations = await writer.listByPersona(ana)
    expect(anaEventsAfterActivations.length).toBeGreaterThanOrEqual(2)
    expect(
      anaEventsAfterActivations.map((e) => e.tipoEvento),
    ).toContain('service_state_changed')

    // ── Pausar servicio 2 (Estudiantes Líder) ─────────────────────────
    const estPause = await transitionWithGrants({
      servicio: estActivo,
      estadoNuevo: 'en_pausa',
      motivo: 'gdv_liderazgo_removed',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
      equipo: equipoEst,
      rol: rolLider,
      participationWriter: writer,
    })
    expect(estPause.ok).toBe(true)
    if (!estPause.ok) throw new Error('expected est pause to succeed')
    expect(estPause.grantsDecision.action).toBe('revoke')
    expect(estPause.pausedGrantsSnapshot).toBeDefined()
    expect(estPause.pausedGrantsSnapshot?.grants).toHaveLength(4)

    const estPausado = await repo.updateServicio(estActivo.id, {
      estado: 'en_pausa',
      motivoActual: 'gdv_liderazgo_removed',
      expectedVersion: estActivo.version,
    })
    expect(estPausado.estado).toBe('en_pausa')

    // Persistir el snapshot en el historial (el repository no lo hace)
    const estHistorialAfterPause = await repo.listHistorial(estServicio.id)
    const pauseEntry = estHistorialAfterPause.find((h) => h.estadoNuevo === 'en_pausa')
    expect(pauseEntry).toBeDefined()

    const snapshot = estPause.pausedGrantsSnapshot
    const { error: snapshotError } = await client
      .from('dream_team_estados_historial')
      .update({ paused_grants_snapshot: snapshot as DreamTeamEstadoHistorial['pausedGrantsSnapshot'] })
      .eq('id', pauseEntry!.id)
    expect(snapshotError).toBeNull()

    // ── Verificar aislamiento: DPS sigue activo ───────────────────────
    const dpsAfterPause = await repo.getServicioById(dpsServicio.id)
    expect(dpsAfterPause?.estado).toBe('activo')

    // ── Reactivar servicio 2 con snapshot ─────────────────────────────
    const estReactivation = await transitionWithGrants({
      servicio: estPausado,
      estadoNuevo: 'activo',
      motivo: 'admin_reactivacion',
      actorPersonaId: ana,
      fecha: now,
      audit: createPlatformGrantAudit(),
      previousSnapshot: estPause.pausedGrantsSnapshot,
      participationWriter: writer,
    })
    expect(estReactivation.ok).toBe(true)
    if (!estReactivation.ok) throw new Error('expected est reactivation to succeed')
    expect(estReactivation.grantsDecision.action).toBe('restore')
    if (estReactivation.grantsDecision.action !== 'restore') throw new Error('expected restore')
    const restoredKeys = estReactivation.grantsDecision.grants
      .map((g) => g.capabilityKey)
      .sort((a, b) => a.localeCompare(b))
    const pauseKeys = estPause.pausedGrantsSnapshot
      ? estPause.pausedGrantsSnapshot.grants.map((g) => g.capabilityKey).sort((a, b) => a.localeCompare(b))
      : []
    expect(restoredKeys).toEqual(pauseKeys)

    const estReactivado = await repo.updateServicio(estPausado.id, {
      estado: 'activo',
      motivoActual: 'admin_reactivacion',
      expectedVersion: estPausado.version,
    })
    expect(estReactivado.estado).toBe('activo')

    const anaEventsFinal = await writer.listByPersona(ana)
    expect(anaEventsFinal.map((e) => e.tipoEvento)).toContain('service_reactivated')

    // ── Métricas ──────────────────────────────────────────────────────
    const metrics = await getDreamTeamMetrics(repo)
    const anaActivosFila = metrics.servicios_por_experiencia_equipo.find(
      (row) => row.equipoId === equipoDps.id,
    )
    const anaActivosEstFila = metrics.servicios_por_experiencia_equipo.find(
      (row) => row.equipoId === equipoEst.id,
    )

    // `metrics` agrega globalmente — verificamos que cada uno de los
    // equipos de Ana reporta al menos 1 servicio activo tras la
    // reactivación.
    expect(anaActivosFila?.count ?? 0).toBeGreaterThanOrEqual(1)
    expect(anaActivosEstFila?.count ?? 0).toBeGreaterThanOrEqual(1)

    // Y el agregado global de `servicios_por_estado` debe contener un
    // segmento `activo` consistente (no vacío) gracias a Ana.
    const activos = metrics.servicios_por_estado.find((s) => s.estado === 'activo')
    expect(activos?.count ?? 0).toBeGreaterThanOrEqual(2)
  }, 60000)
})
