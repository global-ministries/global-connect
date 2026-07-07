/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, PATCH } from '@/app/api/dream-team/servicios/[id]/route'
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
const readCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const manageCap = { key: 'dream_team.requirements.manage', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const equipoDPS = { id: 'equipo-dps', experiencia: 'dps' as const, label: 'DPS Producción', activo: true }
const rolCámara = { id: 'rol-cam', equipoId: 'equipo-dps', label: 'Cámara', activo: true }
const reqCámara = { id: 'req-cam', equipoId: 'equipo-dps', rolId: 'rol-cam', codigo: 'capacitacion-dps', label: 'Capacitación DPS', tipo: 'capacitacion' as const, obligatoriedad: 'requerido' as const }
const servicioPostulado = { id: 'srv-postulado', personaId: actorPersonaId, equipoId: 'equipo-dps', rolId: 'rol-cam', estado: 'postulado' as const, fechaInicio: new Date().toISOString(), motivoActual: 'admin_asignacion' as const, version: 1 }
const historialInicial = { id: 'hist-1', servicioId: 'srv-postulado', estadoAnterior: 'postulado' as const, estadoNuevo: 'postulado' as const, motivo: 'admin_asignacion' as const, actorPersonaId, fecha: new Date().toISOString() }
const verificacionInicial = { id: 'ver-1', servicioId: 'srv-postulado', requisitoId: 'req-cam', estado: 'pendiente' as const }

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo() {
  createRepo.mockReturnValue(createInMemoryDreamTeamRepository({ seed: { equipos: [equipoDPS], roles: [rolCámara], requisitos: [reqCámara], servicios: [servicioPostulado], historial: [historialInicial], requisitoVerificaciones: [verificacionInicial] } }))
}

function ctx(id: string) {
  return { params: { id } }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/servicios/[id]', () => {
  it('401 unauthenticated', async () => { auth([], null); repo(); expect((await GET(request('/api/dream-team/servicios/srv-postulado'), ctx('srv-postulado'))).status).toBe(401) })
  it('404 when service missing', async () => { auth([readCap]); repo(); expect((await GET(request('/api/dream-team/servicios/srv-missing'), ctx('srv-missing'))).status).toBe(404) })
  it('returns service with history and verifications', async () => {
    auth([readCap]); repo()
    const b = await (await GET(request('/api/dream-team/servicios/srv-postulado'), ctx('srv-postulado'))).json()
    expect(b.servicio.id).toBe('srv-postulado')
    expect(b.historial).toHaveLength(1)
    expect(b.verificaciones).toHaveLength(1)
    expect(b.verificaciones[0].estado).toBe('pendiente')
  })
})

describe('PATCH /api/dream-team/servicios/[id]', () => {
  it('401 unauthenticated', async () => { auth([], null); repo(); expect((await PATCH(request('/api/dream-team/servicios/srv-postulado', { method: 'PATCH', body: JSON.stringify({ motivo: 'admin_promocion', expectedVersion: 1 }) }), ctx('srv-postulado'))).status).toBe(401) })
  it('400 when motivo missing', async () => { auth([manageCap]); repo(); expect((await PATCH(request('/api/dream-team/servicios/srv-postulado', { method: 'PATCH', body: JSON.stringify({ expectedVersion: 1 }) }), ctx('srv-postulado'))).status).toBe(400) })
  it('400 for invalid transition', async () => { auth([manageCap]); repo(); expect((await PATCH(request('/api/dream-team/servicios/srv-postulado', { method: 'PATCH', body: JSON.stringify({ estado: 'activo', motivo: 'admin_promocion', expectedVersion: 1 }) }), ctx('srv-postulado'))).status).toBe(400) })
  it('409 when expectedVersion mismatches', async () => { auth([manageCap]); repo(); expect((await PATCH(request('/api/dream-team/servicios/srv-postulado', { method: 'PATCH', body: JSON.stringify({ estado: 'en_orientacion', motivo: 'admin_promocion', expectedVersion: 99 }) }), ctx('srv-postulado'))).status).toBe(409) })
  it('applies valid transition and appends history', async () => {
    auth([directorCap]); repo()
    const b = await (await PATCH(request('/api/dream-team/servicios/srv-postulado', { method: 'PATCH', body: JSON.stringify({ estado: 'en_orientacion', motivo: 'admin_promocion', expectedVersion: 1 }) }), ctx('srv-postulado'))).json()
    expect(b.servicio.estado).toBe('en_orientacion')
    expect(b.servicio.version).toBe(2)
    expect(b.historial).toHaveLength(2)
    expect(b.historial[b.historial.length - 1].estadoNuevo).toBe('en_orientacion')
  })
})
