/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/dream-team/servicios/route'
import { createInMemoryDreamTeamRepository } from '@/lib/platform/dream-team/repository-fake'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({ createSupabaseDreamTeamRepository: jest.fn() }))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const createRepo = jest.requireMock('@/lib/platform/dream-team/repository-supabase').createSupabaseDreamTeamRepository as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = personaId('22222222-2222-2222-2222-222222222222')
const otherPersonaId = personaId('33333333-3333-3333-3333-333333333333')
const readCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const equipoDPS = { id: 'equipo-dps', experiencia: 'dps' as const, label: 'DPS Producción', activo: true }
const rolCámara = { id: 'rol-cam', equipoId: 'equipo-dps', label: 'Cámara', activo: true }
const reqCámara = { id: 'req-cam', equipoId: 'equipo-dps', rolId: 'rol-cam', codigo: 'capacitacion-dps', label: 'Capacitación DPS', tipo: 'capacitacion' as const, obligatoriedad: 'requerido' as const }
const servicioActivo = { id: 'srv-activo', personaId: actorPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam', estado: 'activo' as const, fechaInicio: new Date().toISOString(), motivoActual: 'admin_promocion' as const, version: 1 }
const servicioPostulado = { id: 'srv-postulado', personaId: otherPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam', estado: 'postulado' as const, fechaInicio: new Date().toISOString(), motivoActual: 'admin_asignacion' as const, version: 1 }

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo(seed?: NonNullable<Parameters<typeof createInMemoryDreamTeamRepository>[0]>['seed']) {
  createRepo.mockReturnValue(createInMemoryDreamTeamRepository(seed ? { seed } : {}))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/servicios', () => {
  it('401 unauthenticated', async () => { auth([], null); repo(); expect((await GET(request('/api/dream-team/servicios'))).status).toBe(401) })
  it('403 without read capability', async () => { auth([]); repo(); expect((await GET(request('/api/dream-team/servicios'))).status).toBe(403) })
  it('404 when flag off', async () => { process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'; auth([readCap]); repo(); expect((await GET(request('/api/dream-team/servicios'))).status).toBe(404) })
  it('returns all services without filters', async () => { auth([readCap]); repo({ servicios: [servicioActivo, servicioPostulado] }); expect((await (await GET(request('/api/dream-team/servicios'))).json()).servicios).toHaveLength(2) })
  it('filters by personaId', async () => { auth([readCap]); repo({ servicios: [servicioActivo, servicioPostulado] }); const b = await (await GET(request(`/api/dream-team/servicios?personaId=${actorPersonaId}`))).json(); expect(b.servicios).toHaveLength(1); expect(b.servicios[0].id).toBe('srv-activo') })
  it('filters by single estado', async () => { auth([readCap]); repo({ servicios: [servicioActivo, servicioPostulado] }); const b = await (await GET(request('/api/dream-team/servicios?estado=activo'))).json(); expect(b.servicios).toHaveLength(1); expect(b.servicios[0].id).toBe('srv-activo') })
  it('filters by multiple estados', async () => { auth([readCap]); repo({ servicios: [servicioActivo, servicioPostulado] }); const b = await (await GET(request('/api/dream-team/servicios?estado=activo&estado=en_pausa'))).json(); expect(b.servicios).toHaveLength(1); expect(b.servicios[0].id).toBe('srv-activo') })
  it('combines personaId and estado', async () => { auth([readCap]); repo({ servicios: [servicioActivo, servicioPostulado] }); const b = await (await GET(request(`/api/dream-team/servicios?personaId=${actorPersonaId}&estado=postulado`))).json(); expect(b.servicios).toHaveLength(0) })
})

describe('POST /api/dream-team/servicios', () => {
  it('401 unauthenticated', async () => { auth([], null); repo(); expect((await POST(request('/api/dream-team/servicios', { method: 'POST', body: JSON.stringify({ personaId: actorPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam' }) }))).status).toBe(401) })
  it('403 without write capability', async () => { auth([readCap]); repo(); expect((await POST(request('/api/dream-team/servicios', { method: 'POST', body: JSON.stringify({ personaId: actorPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam' }) }))).status).toBe(403) })
  it('400 when personaId missing', async () => { auth([directorCap]); repo(); expect((await POST(request('/api/dream-team/servicios', { method: 'POST', body: JSON.stringify({ equipoId: 'equipo-dps', rolId: 'rol-cam' }) }))).status).toBe(400) })
  it('201 creates postulado service with pending verifications and history', async () => {
    auth([directorCap]); repo({ equipos: [equipoDPS], roles: [rolCámara], requisitos: [reqCámara] })
    const b = await (await POST(request('/api/dream-team/servicios', { method: 'POST', body: JSON.stringify({ personaId: actorPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam' }) }))).json()
    expect(b.servicio.estado).toBe('postulado')
    expect(b.servicio.personaId).toBe(actorPersonaId)
    expect(b.verificaciones).toHaveLength(1)
    expect(b.verificaciones[0].estado).toBe('pendiente')
    expect(b.historial).toHaveLength(1)
    expect(b.historial[0].estadoNuevo).toBe('postulado')
  })
})
