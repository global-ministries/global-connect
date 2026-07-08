/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/dream-team/metrics/route'
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
const metricsCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }

const equipoDPS = { id: 'equipo-dps-camara', experiencia: 'dps' as const, label: 'DPS Producción Técnica', activo: true }
const equipoEstudiantes = { id: 'equipo-estudiantes-transit', experiencia: 'estudiantes' as const, label: 'Estudiantes Transit', activo: true }
const rolVoluntario = { id: 'rol-voluntario', equipoId: 'equipo-dps-camara', label: 'Voluntario', activo: true }
const rolLider = { id: 'rol-lider', equipoId: 'equipo-estudiantes-transit', label: 'Líder de grupo', activo: true }

function request(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
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

describe('GET /api/dream-team/metrics', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await GET(request('/api/dream-team/metrics'))).status).toBe(401)
  })

  it('403 without metrics capability', async () => {
    auth([directorCap])
    repo()
    expect((await GET(request('/api/dream-team/metrics'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'
    auth([metricsCap])
    repo()
    expect((await GET(request('/api/dream-team/metrics'))).status).toBe(404)
  })

  it('200 with metrics capability returning four aggregates', async () => {
    auth([metricsCap])
    repo({
      equipos: [equipoDPS, equipoEstudiantes],
      roles: [rolVoluntario, rolLider],
      servicios: [
        { id: 'srv-dps', personaId: actorPersonaId, equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo', fechaInicio: '2026-01-01', motivoActual: 'admin_promocion', version: 1 },
        { id: 'srv-est', personaId: actorPersonaId, equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo', fechaInicio: '2026-02-01', motivoActual: 'admin_promocion', version: 1 },
      ],
    })

    const res = await GET(request('/api/dream-team/metrics'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.metrics).toBeDefined()
    expect(body.metrics.servicios_por_experiencia_equipo).toHaveLength(2)
    expect(body.metrics.servicios_por_estado).toHaveLength(6)
    expect(body.metrics.distribucion_roles).toHaveLength(2)
    expect(body.metrics.requisitos_vencidos).toEqual([])
  })

  it('returns controlled metrics when repository has expired requirements', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'))
    auth([metricsCap])
    repo({
      equipos: [equipoEstudiantes],
      roles: [rolLider],
      servicios: [
        { id: 'srv-ana', personaId: actorPersonaId, equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo', fechaInicio: '2026-02-01', motivoActual: 'admin_promocion', version: 1 },
      ],
      requisitoVerificaciones: [
        { id: 'ver-vencida', servicioId: 'srv-ana', requisitoId: 'req-cap', estado: 'vencido', fechaVencimiento: '2026-08-01' },
      ],
    })

    const res = await GET(request('/api/dream-team/metrics'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.metrics.requisitos_vencidos).toHaveLength(1)
    expect(body.metrics.requisitos_vencidos[0]).toMatchObject({
      verificacionId: 'ver-vencida',
      servicioId: 'srv-ana',
      requisitoId: 'req-cap',
      fechaVencimiento: '2026-08-01',
    })

    jest.useRealTimers()
  })
})
