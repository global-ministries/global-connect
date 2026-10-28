/**
 * @jest-environment node
 */

/**
 * PUT /api/dream-team/servicios/[id]/turnos — a dated shift takes no biweekly
 * frequency (T2 of odd/tasks/tlr-calendario-servicios.md, S3). The database
 * refuses it too (dream_team_servicio_turnos_validar_tipo).
 */
import { NextRequest } from 'next/server'
import { PUT } from '@/app/api/dream-team/servicios/[id]/turnos/route'
import { createInMemoryDreamTeamRepository } from '@/lib/platform/dream-team/repository-fake'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({ createSupabaseDreamTeamRepository: jest.fn() }))
jest.mock('@/lib/platform/dream-team/turnos', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/turnos'),
  fetchTurnos: jest.fn(),
  guardarTurnosDeServicio: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const createRepo = jest.requireMock('@/lib/platform/dream-team/repository-supabase').createSupabaseDreamTeamRepository as jest.Mock
const turnosMock = jest.requireMock('@/lib/platform/dream-team/turnos') as Record<string, jest.Mock>

const T9 = '00000000-0000-4000-8000-000000000009'
const TLR = '00000000-0000-4000-8000-000000000010'
const directorCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'a' } }, error: null }) },
    rpc: jest.fn(),
  })
  resolveSession.mockResolvedValue({
    personaId: personaId('22222222-2222-2222-2222-222222222222'),
    subjectAuthId: 'a',
    globalRoles: [],
    contexts: [],
    capabilities: [directorCap],
  })
  createRepo.mockReturnValue(
    createInMemoryDreamTeamRepository({
      seed: {
        servicios: [
          {
            id: 'srv-1',
            personaId: personaId('33333333-3333-3333-3333-333333333333'),
            equipoId: 'equipo-tlr',
            rolId: 'rol-vol',
            estado: 'activo' as const,
            fechaInicio: new Date().toISOString(),
            motivoActual: 'admin_asignacion' as const,
            version: 1,
          },
        ],
      },
    }),
  )
  turnosMock.fetchTurnos.mockResolvedValue([
    { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true, tipo: 'semanal' },
    { id: TLR, campusId: 'bqt', nombre: 'The Living Room', diaSemana: 0, hora: '10:00', orden: 2, activo: true, tipo: 'fechas' },
  ])
  turnosMock.guardarTurnosDeServicio.mockResolvedValue(undefined)
})

function put(body: unknown) {
  const req = new NextRequest(new URL('http://localhost/api/dream-team/servicios/srv-1/turnos'), {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return PUT(req, { params: { id: 'srv-1' } })
}

it('400 for a biweekly frequency on a dated shift, nothing saved', async () => {
  const respuesta = await put({ turnoIds: [TLR], frecuencias: { [TLR]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' } } })
  expect(respuesta.status).toBe(400)
  expect(await respuesta.json()).toEqual({ error: 'Un turno por fechas no admite frecuencia quincenal.' })
  expect(turnosMock.guardarTurnosDeServicio).not.toHaveBeenCalled()
})

it('saves a dated shift weekly and still allows a biweekly weekly shift', async () => {
  const frecuencias = {
    [TLR]: { frecuencia: 'semanal', fechaAncla: null },
    [T9]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' },
  }
  const respuesta = await put({ turnoIds: [T9, TLR], frecuencias })
  expect(respuesta.status).toBe(200)
  expect(turnosMock.guardarTurnosDeServicio).toHaveBeenCalledWith(expect.anything(), 'srv-1', [T9, TLR], {
    [TLR]: { frecuencia: 'semanal', fechaAncla: null },
    [T9]: { frecuencia: 'quincenal', fechaAncla: '2026-10-04' },
  })
})
