/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, PUT } from '@/app/api/dream-team/servicios/[id]/turnos/route'
import { createInMemoryDreamTeamRepository } from '@/lib/platform/dream-team/repository-fake'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({ createSupabaseDreamTeamRepository: jest.fn() }))
jest.mock('@/lib/platform/dream-team/turnos', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/turnos'),
  fetchTurnos: jest.fn(),
  fetchTurnosDisponibles: jest.fn(),
  fetchTurnosDeServicios: jest.fn(),
  fetchFrecuenciasDeServicios: jest.fn(),
  guardarTurnosDeServicio: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const createRepo = jest.requireMock('@/lib/platform/dream-team/repository-supabase').createSupabaseDreamTeamRepository as jest.Mock
const turnosMock = jest.requireMock('@/lib/platform/dream-team/turnos') as Record<string, jest.Mock>

const T1 = '00000000-0000-4000-8000-000000000001'
const T2 = '00000000-0000-4000-8000-000000000002'
const T3 = '00000000-0000-4000-8000-000000000003'
const readCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const servicio = {
  id: 'srv-1',
  personaId: personaId('33333333-3333-3333-3333-333333333333'),
  equipoId: 'equipo-sala',
  rolId: 'rol-vol',
  estado: 'activo' as const,
  fechaInicio: new Date().toISOString(),
  motivoActual: 'admin_asignacion' as const,
  version: 1,
}
const turno = (id: string, nombre: string, orden: number) => ({
  id, campusId: 'bqt', nombre, diaSemana: 0, hora: '09:00', orden, activo: true,
})

function request(init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL('http://localhost/api/dream-team/servicios/srv-1/turnos'), init)
}
const ctx = (id = 'srv-1') => ({ params: { id } })

function auth(caps: Record<string, unknown>[] | null) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: caps ? { id: 'a' } : null }, error: null }) } })
  resolveSession.mockResolvedValue(
    caps ? { personaId: personaId('22222222-2222-2222-2222-222222222222'), subjectAuthId: 'a', globalRoles: [], contexts: [], capabilities: caps } : null,
  )
  createRepo.mockReturnValue(createInMemoryDreamTeamRepository({ seed: { servicios: [servicio] } }))
}

function put(body: unknown) {
  return PUT(request({ method: 'PUT', body: JSON.stringify(body) }), ctx())
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
  turnosMock.fetchTurnos.mockResolvedValue([turno(T1, 'Domingo 9:00', 1), turno(T2, 'Domingo 11:00', 2), turno(T3, 'Sábado', 3)])
  turnosMock.fetchTurnosDisponibles.mockResolvedValue([T1, T2])
  turnosMock.fetchTurnosDeServicios.mockResolvedValue(new Map([['srv-1', [T3]]]))
  turnosMock.fetchFrecuenciasDeServicios.mockResolvedValue(
    new Map([['srv-1', { [T3]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' } }]]),
  )
  turnosMock.guardarTurnosDeServicio.mockResolvedValue(undefined)
})

describe('GET /api/dream-team/servicios/[id]/turnos', () => {
  it('401 without a session', async () => {
    auth(null)
    expect((await GET(request(), ctx())).status).toBe(401)
  })

  it('404 for an unknown servicio', async () => {
    auth([readCap])
    expect((await GET(request(), ctx('nope'))).status).toBe(404)
  })

  it('offers the shifts the node serves plus the ones already assigned', async () => {
    auth([readCap])
    const cuerpo = await (await GET(request(), ctx())).json()
    expect(cuerpo.asignados).toEqual([T3])
    expect(cuerpo.frecuencias).toEqual({ [T3]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' } })
    expect(cuerpo.turnos.map((t: { id: string }) => t.id)).toEqual([T1, T2, T3])
    expect(turnosMock.fetchTurnosDisponibles).toHaveBeenCalledWith(expect.anything(), 'equipo-sala', expect.any(Array))
  })
})

describe('PUT /api/dream-team/servicios/[id]/turnos', () => {
  it('403 for a read-only session', async () => {
    auth([readCap])
    expect((await put({ turnoIds: [T1] })).status).toBe(403)
  })

  it('400 for a malformed body', async () => {
    auth([directorCap])
    expect((await put({ turnoIds: ['x'] })).status).toBe(400)
    expect(turnosMock.guardarTurnosDeServicio).not.toHaveBeenCalled()
  })

  it('saves the shifts', async () => {
    auth([directorCap])
    const respuesta = await put({ turnoIds: [T1, T2] })
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ asignados: [T1, T2] })
    expect(turnosMock.guardarTurnosDeServicio).toHaveBeenCalledWith(expect.anything(), 'srv-1', [T1, T2], undefined)
  })

  it('saves a biweekly frequency with its anchor Sunday', async () => {
    auth([directorCap])
    const frecuencias = { [T1]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' } }
    expect((await put({ turnoIds: [T1], frecuencias })).status).toBe(200)
    expect(turnosMock.guardarTurnosDeServicio).toHaveBeenCalledWith(expect.anything(), 'srv-1', [T1], frecuencias)
  })

  it('400 for a biweekly frequency whose anchor is not a Sunday', async () => {
    auth([directorCap])
    const frecuencias = { [T1]: { frecuencia: 'quincenal', fechaAncla: '2026-10-05' } }
    expect((await put({ turnoIds: [T1], frecuencias })).status).toBe(400)
    expect(turnosMock.guardarTurnosDeServicio).not.toHaveBeenCalled()
  })

  it('422 when the database rejects a shift for this servicio', async () => {
    auth([directorCap])
    turnosMock.guardarTurnosDeServicio.mockRejectedValue(Object.assign(new Error('x'), { code: '23514' }))
    const respuesta = await put({ turnoIds: [T3] })
    expect(respuesta.status).toBe(422)
    expect((await respuesta.json()).error).toMatch(/turno/i)
  })

  it('403 when RLS refuses the write', async () => {
    auth([directorCap])
    turnosMock.guardarTurnosDeServicio.mockRejectedValue(Object.assign(new Error('x'), { code: '42501' }))
    expect((await put({ turnoIds: [T1] })).status).toBe(403)
  })
})
