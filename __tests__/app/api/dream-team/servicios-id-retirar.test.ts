/**
 * @jest-environment node
 *
 * PATCH /api/dream-team/servicios/[id] to `retirado` — «Cambiar etapa» →
 * Retirado (S7, T8b of odd/tasks/dream-team-estructura-correcciones.md).
 * Until 2027-01-01 00:00 Caracas the servicio is retired as always (version
 * check, history row, grants revocation) and then deleted with the admin
 * client through dream_team_servicio_borrar_si_sin_historial, so no retirado
 * row nor history remains; if that function keeps it (attendance records),
 * the answer is today's. From that date on it only retires.
 */

import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/dream-team/servicios/[id]/route'
import { createInMemoryDreamTeamRepository } from '@/lib/platform/dream-team/repository-fake'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: jest.fn(),
  borrarServicioRetirado: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const repoMock = jest.requireMock('@/lib/platform/dream-team/repository-supabase')
const createRepo = repoMock.createSupabaseDreamTeamRepository as jest.Mock
const borrar = repoMock.borrarServicioRetirado as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = personaId('22222222-2222-2222-2222-222222222222')
const voluntarioPersonaId = personaId('33333333-3333-3333-3333-333333333333')
const readCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const equipoDPS = { id: 'equipo-dps', experiencia: 'dps' as const, label: 'DPS Producción', activo: true }
const rolCámara = { id: 'rol-cam', equipoId: 'equipo-dps', label: 'Cámara', nivel: 'voluntario' as const, activo: true }
const servicioActivo = { id: 'srv-activo', personaId: voluntarioPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam', estado: 'activo' as const, fechaInicio: '2026-10-01T12:00:00.000Z', motivoActual: 'admin_promocion' as const, version: 1 }
const historialInicial = { id: 'hist-1', servicioId: 'srv-activo', estadoAnterior: 'en_orientacion' as const, estadoNuevo: 'activo' as const, motivo: 'admin_promocion' as const, actorPersonaId, fecha: '2026-10-01T12:00:00.000Z' }
const adminClient = { cliente: 'admin' }

// Every grant any nivel could have minted for this equipo (S6.7 of uno-a-uno), as the retire revokes.
const revocados = [
  { capabilityKey: 'dream_team.serve', experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dream_team.direct', experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dps.team.director', experience: 'dps', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dream_team.coordinate', experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dps.team.lead', experience: 'dps', scopeType: 'equipo', scopeId: 'equipo-dps' },
  { capabilityKey: 'dream_team.lead', experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-dps' },
]

const ANTES = '2026-12-31T23:59:00-04:00'
const DESDE = '2027-01-01T00:00:00-04:00'

// Only Date is faked: the request body and the route's promises run on real timers.
function fijarFecha(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
  })
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo() {
  const fake = createInMemoryDreamTeamRepository({ seed: { equipos: [equipoDPS], roles: [rolCámara], servicios: [servicioActivo], historial: [historialInicial] } })
  createRepo.mockReturnValue(fake)
  return fake
}

function cambiarEtapa(body: unknown) {
  return PATCH(
    new NextRequest(new URL('http://localhost/api/dream-team/servicios/srv-activo'), { method: 'PATCH', body: JSON.stringify(body) }),
    { params: { id: 'srv-activo' } },
  )
}

const retirar = (expectedVersion = 1) => cambiarEtapa({ estado: 'retirado', motivo: 'admin_retiro', expectedVersion })

async function sinCambios(fake: ReturnType<typeof repo>) {
  expect(await fake.getServicioById('srv-activo')).toEqual(servicioActivo)
  expect(await fake.listHistorial('srv-activo')).toEqual([historialInicial])
  expect(fake.getAppliedServicioGrantsCalls()).toHaveLength(0)
  expect(borrar).not.toHaveBeenCalled()
  expect(createAdmin).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
  createAdmin.mockReturnValue(adminClient)
  borrar.mockResolvedValue(true)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('PATCH → retirado — until 2027-01-01 (Caracas): no trace', () => {
  beforeEach(() => fijarFecha(ANTES))

  it('retires, revokes the grants, then deletes the row with the admin client and returns no history', async () => {
    auth([directorCap])
    const fake = repo()
    let estadoAlBorrar: string | undefined
    let grantsAlBorrar = 0
    borrar.mockImplementation(async () => {
      estadoAlBorrar = (await fake.getServicioById('srv-activo'))?.estado
      grantsAlBorrar = fake.getAppliedServicioGrantsCalls().length
      return true
    })

    const res = await retirar()

    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.borrado).toBe(true)
    expect(b.historial).toEqual([])
    expect(b.servicio).toEqual(expect.objectContaining({ id: 'srv-activo', estado: 'retirado', version: 2 }))
    // Retired first by the user's client (RLS decides) and its grants revoked before the row goes.
    expect(estadoAlBorrar).toBe('retirado')
    expect(grantsAlBorrar).toBe(1)
    const calls = fake.getAppliedServicioGrantsCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].personaId).toBe(voluntarioPersonaId)
    expect(calls[0].accion).toBe('revoke')
    expect(calls[0].grants).toEqual(revocados)
    expect(createAdmin).toHaveBeenCalledTimes(1)
    expect(borrar).toHaveBeenCalledTimes(1)
    expect(borrar).toHaveBeenCalledWith(adminClient, 'srv-activo')
  })

  it('answers as today (retired, with its history) when the function keeps the row', async () => {
    auth([directorCap])
    repo()
    borrar.mockResolvedValue(false)

    const res = await retirar()

    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.borrado).toBeUndefined()
    expect(b.servicio.estado).toBe('retirado')
    expect(b.historial).toHaveLength(2)
    expect(b.historial[1]).toEqual(expect.objectContaining({ estadoAnterior: 'activo', estadoNuevo: 'retirado', motivo: 'admin_retiro', actorPersonaId }))
  })

  it('keeps the row retired and says so when the delete fails', async () => {
    auth([directorCap])
    const fake = repo()
    borrar.mockRejectedValue(new Error('boom'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await retirar()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Se retiró, pero no se pudo borrar sin rastro: quedó como retirado.' })
    expect((await fake.getServicioById('srv-activo'))?.estado).toBe('retirado')
    expect(fake.getAppliedServicioGrantsCalls()[0].accion).toBe('revoke')
  })

  it('does not delete when revoking the grants fails', async () => {
    auth([directorCap])
    const fake = repo()
    jest.spyOn(fake, 'applyServicioGrants').mockRejectedValue(new Error('rpc'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await retirar()

    expect(res.status).toBe(500)
    expect(borrar).not.toHaveBeenCalled()
    expect(createAdmin).not.toHaveBeenCalled()
    expect((await fake.getServicioById('srv-activo'))?.estado).toBe('retirado')
  })

  it('another stage change (en_pausa) deletes nothing', async () => {
    auth([directorCap])
    const fake = repo()

    const res = await cambiarEtapa({ estado: 'en_pausa', motivo: 'admin_pausa', expectedVersion: 1 })

    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.servicio.estado).toBe('en_pausa')
    expect(b.historial).toHaveLength(2)
    expect(b.borrado).toBeUndefined()
    expect(borrar).not.toHaveBeenCalled()
    expect(createAdmin).not.toHaveBeenCalled()
    expect((await fake.getServicioById('srv-activo'))?.estado).toBe('en_pausa')
  })

  it('409 when expectedVersion mismatches: nothing retired, revoked or deleted', async () => {
    auth([directorCap])
    const fake = repo()
    const res = await retirar(99)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Conflicto de versión' })
    await sinCambios(fake)
  })

  it('403 without write permission: nothing retired, revoked or deleted', async () => {
    auth([readCap])
    const fake = repo()
    const res = await retirar()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Permiso denegado' })
    await sinCambios(fake)
  })
})

describe('PATCH → retirado — from 2027-01-01 (Caracas): retire, history kept', () => {
  beforeEach(() => fijarFecha(DESDE))

  it('retires, revokes the grants and deletes nothing', async () => {
    auth([directorCap])
    const fake = repo()

    const res = await retirar()

    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b.borrado).toBeUndefined()
    expect(b.servicio.estado).toBe('retirado')
    expect(b.servicio.version).toBe(2)
    expect(b.historial).toHaveLength(2)
    expect(b.historial[1]).toEqual(expect.objectContaining({ estadoAnterior: 'activo', estadoNuevo: 'retirado', motivo: 'admin_retiro', actorPersonaId }))
    const calls = fake.getAppliedServicioGrantsCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].accion).toBe('revoke')
    expect(calls[0].grants).toEqual(revocados)
    expect(borrar).not.toHaveBeenCalled()
    expect(createAdmin).not.toHaveBeenCalled()
  })
})
