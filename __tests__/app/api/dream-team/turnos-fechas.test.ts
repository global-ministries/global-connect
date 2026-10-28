/**
 * @jest-environment node
 *
 * Dream Team — the routes of the "Calendario" of a dated shift (T2 of
 * odd/tasks/tlr-calendario-servicios.md, S4, A1, A2):
 *   GET    /api/dream-team/turnos/calendario?equipoId=
 *   POST   /api/dream-team/turnos/[id]/fechas
 *   PATCH  /api/dream-team/turnos/[id]/fechas/[fechaId]
 *   DELETE /api/dream-team/turnos/[id]/fechas/[fechaId]
 *   PUT    /api/dream-team/turnos/[id]/fechas/[fechaId]/servidores
 * The database functions are the authority (42501 → 403).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { GET as getCalendario } from '@/app/api/dream-team/turnos/calendario/route'
import { POST as postFecha } from '@/app/api/dream-team/turnos/[id]/fechas/route'
import { DELETE as deleteFecha, PATCH as patchFecha } from '@/app/api/dream-team/turnos/[id]/fechas/[fechaId]/route'
import { PUT as putServidores } from '@/app/api/dream-team/turnos/[id]/fechas/[fechaId]/servidores/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const EQUIPO = '00000000-0000-4000-8000-0000000000e1'
const T9 = '00000000-0000-4000-8000-000000000009'
const TLR = '00000000-0000-4000-8000-000000000010'
const TOTRO = '00000000-0000-4000-8000-000000000012'
const F1 = '00000000-0000-4000-8000-0000000000f1'
const S1 = '00000000-0000-4000-8000-0000000000a1'

type Respuesta = { data: unknown; error: unknown }

let rpc: jest.Mock

function setup(rpcs: Record<string, Respuesta> = {}, user: object | null = { id: 'auth-1' }) {
  const tablas: Record<string, Respuesta> = {
    dream_team_turnos: {
      data: [
        { id: T9, campus_id: 'bqt', nombre: 'Domingo 9:00', dia_semana: 0, hora: '09:00:00', orden: 1, activo: true, tipo: 'semanal' },
        { id: TLR, campus_id: 'bqt', nombre: 'The Living Room', dia_semana: 0, hora: '10:00:00', orden: 3, activo: true, tipo: 'fechas' },
        { id: TOTRO, campus_id: 'bqt', nombre: 'Otro por fechas', dia_semana: 0, hora: '18:00:00', orden: 4, activo: true, tipo: 'fechas' },
      ],
      error: null,
    },
    dream_team_turno_fechas: { data: [{ id: F1, turno_id: TLR, fecha: '2026-11-08', hora: null, nota: null }], error: null },
    dream_team_turno_fecha_servidores: { data: [{ turno_fecha_id: F1, servicio_id: S1 }], error: null },
  }
  const builder = (tabla: string) => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'in', 'eq', 'order']) b[op] = () => b
    b.then = (resolver: (r: Respuesta) => unknown) => resolver(tablas[tabla] ?? { data: [], error: null })
    return b
  }
  rpc = jest.fn((fn: string) => Promise.resolve(rpcs[fn] ?? { data: null, error: null }))
  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: jest.fn(builder),
    rpc,
  })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] } : null)
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })
const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(`http://localhost${path}`), init)

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/turnos/calendario', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await getCalendario(req(`/api/dream-team/turnos/calendario?equipoId=${EQUIPO}`))).status).toBe(401)
  })

  it('answers no shift for a node that is not a Dream Team equipo, without asking the database', async () => {
    setup()
    const res = await getCalendario(req('/api/dream-team/turnos/calendario?equipoId=gdv:segmento'))
    expect(await res.json()).toEqual({ turnos: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns the dated shifts the node serves, with their dates and whether the caller may plan them', async () => {
    setup({
      dream_team_turnos_del_equipo: { data: [T9, TLR], error: null },
      dream_team_puede_gestionar_turno: { data: true, error: null },
    })
    const res = await getCalendario(req(`/api/dream-team/turnos/calendario?equipoId=${EQUIPO}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      turnos: [
        {
          id: TLR,
          nombre: 'The Living Room',
          hora: '10:00',
          puedeGestionar: true,
          fechas: [{ id: F1, turnoId: TLR, fecha: '2026-11-08', hora: null, nota: null, servidores: [S1] }],
        },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('dream_team_turnos_del_equipo', { p_equipo_id: EQUIPO, p_campus_id: 'bqt' })
    expect(rpc).toHaveBeenCalledWith('dream_team_puede_gestionar_turno', { p_turno_id: TLR })
  })
})

describe('POST /api/dream-team/turnos/[id]/fechas', () => {
  const ctx = { params: Promise.resolve({ id: TLR }) }

  it('400 for a bad date, nothing sent to the database', async () => {
    setup()
    const res = await postFecha(req(`/api/dream-team/turnos/${TLR}/fechas`, json({ fecha: 'mañana' })), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Elige una fecha válida.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('plans a date through dream_team_turno_fecha_guardar', async () => {
    setup({ dream_team_turno_fecha_guardar: { data: F1, error: null } })
    const res = await postFecha(req(`/api/dream-team/turnos/${TLR}/fechas`, json({ fecha: '2026-11-08', hora: '', nota: 'Cena' })), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: F1 })
    expect(rpc).toHaveBeenCalledWith('dream_team_turno_fecha_guardar', {
      p_turno_id: TLR,
      p_fecha: '2026-11-08',
      p_hora: undefined,
      p_nota: 'Cena',
      p_turno_fecha_id: undefined,
    })
  })

  it('403 with a Spanish message when the caller may not plan the shift', async () => {
    setup({ dream_team_turno_fecha_guardar: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    const res = await postFecha(req(`/api/dream-team/turnos/${TLR}/fechas`, json({ fecha: '2026-11-08' })), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'No tienes permiso para planificar las fechas de este turno.' })
  })
})

describe('PATCH and DELETE /api/dream-team/turnos/[id]/fechas/[fechaId]', () => {
  const ctx = { params: Promise.resolve({ id: TLR, fechaId: F1 }) }

  it('moves a date', async () => {
    setup({ dream_team_turno_fecha_guardar: { data: F1, error: null } })
    const res = await patchFecha(
      req(`/api/dream-team/turnos/${TLR}/fechas/${F1}`, { method: 'PATCH', body: JSON.stringify({ fecha: '2026-11-15', hora: '11:00' }) }),
      ctx,
    )
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_turno_fecha_guardar', {
      p_turno_id: TLR,
      p_fecha: '2026-11-15',
      p_hora: '11:00',
      p_nota: undefined,
      p_turno_fecha_id: F1,
    })
  })

  it('409 when moving onto an already planned date', async () => {
    setup({ dream_team_turno_fecha_guardar: { data: null, error: { code: '23505', message: 'fecha_duplicada' } } })
    const res = await patchFecha(
      req(`/api/dream-team/turnos/${TLR}/fechas/${F1}`, { method: 'PATCH', body: JSON.stringify({ fecha: '2026-11-15' }) }),
      ctx,
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Ese turno ya tiene esa fecha planificada.' })
  })

  it('deletes a date', async () => {
    setup({ dream_team_turno_fecha_borrar: { data: true, error: null } })
    const res = await deleteFecha(req(`/api/dream-team/turnos/${TLR}/fechas/${F1}`, { method: 'DELETE' }), ctx)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_turno_fecha_borrar', { p_turno_fecha_id: F1 })
  })

  it('400 for a malformed id', async () => {
    setup()
    const res = await deleteFecha(req('/x', { method: 'DELETE' }), { params: Promise.resolve({ id: TLR, fechaId: 'nope' }) })
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('PUT /api/dream-team/turnos/[id]/fechas/[fechaId]/servidores', () => {
  const ctx = { params: Promise.resolve({ id: TLR, fechaId: F1 }) }
  const put = (body: unknown) =>
    putServidores(req(`/api/dream-team/turnos/${TLR}/fechas/${F1}/servidores`, { method: 'PUT', body: JSON.stringify(body) }), ctx)

  it('sets who serves on the date', async () => {
    setup({ dream_team_turno_fecha_servidores_fijar: { data: 1, error: null } })
    const res = await put({ servicioIds: [S1, S1] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sirven: 1 })
    expect(rpc).toHaveBeenCalledWith('dream_team_turno_fecha_servidores_fijar', { p_turno_fecha_id: F1, p_servicio_ids: [S1] })
  })

  it('400 for a malformed list and 422 for a volunteer not assigned to the shift', async () => {
    setup({ dream_team_turno_fecha_servidores_fijar: { data: null, error: { code: '22023', message: 'servicio_invalido' } } })
    expect((await put({ servicioIds: 'todos' })).status).toBe(400)
    const res = await put({ servicioIds: [S1] })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'Alguna persona ya no tiene asignado este turno. Recarga la página.' })
  })
})
