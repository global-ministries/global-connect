/**
 * @jest-environment node
 *
 * Dream Team — "Cambiar de área" (odd/tasks/dream-team-cambiar-area.md, T2):
 * GET/POST /api/dream-team/servicios/[id]/cambiar-area,
 * POST /api/dream-team/solicitudes-cambio-area/[id]. The database decides;
 * its Spanish messages reach the UI.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
const getServicioById = jest.fn()
const listRolesPorEquipo = jest.fn()
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({ getServicioById, listRolesPorEquipo }),
}))

import { GET, POST } from '@/app/api/dream-team/servicios/[id]/cambiar-area/route'
import { POST as RESOLVER } from '@/app/api/dream-team/solicitudes-cambio-area/[id]/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const SERVICIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EQUIPO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SOLICITUD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
let rpc: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] } : null)
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const urlServicio = new URL(`http://localhost/api/dream-team/servicios/${SERVICIO}/cambiar-area`)
const get = (id = SERVICIO) => GET(new NextRequest(urlServicio), ctx(id))
const post = (body: unknown, id = SERVICIO) =>
  POST(new NextRequest(urlServicio, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id))
const resolver = (body: unknown, id = SOLICITUD) =>
  RESOLVER(
    new NextRequest(new URL(`http://localhost/api/dream-team/solicitudes-cambio-area/${id}`), {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx(id),
  )

const CUERPO = { modo: 'directo', equipoId: EQUIPO, rolId: ROL, motivo: 'correccion', nota: '  Estaba mal cargado ' }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
  getServicioById.mockResolvedValue({ id: SERVICIO, equipoId: 'eq-cam', rolId: 'rol-lider' })
  listRolesPorEquipo.mockResolvedValue([
    { id: 'rol-vol', equipoId: 'eq-cam', label: 'Voluntario', nivel: 'voluntario', activo: true },
    { id: 'rol-lider', equipoId: 'eq-cam', label: 'Líder', nivel: 'lider', activo: true },
  ])
})

describe('GET /api/dream-team/servicios/[id]/cambiar-area', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'
    setup()
    expect((await get()).status).toBe(404)
  })
  it('401 without a session', async () => {
    setup({}, null)
    expect((await get()).status).toBe(401)
  })
  it('400 for a malformed id, without calling the RPC', async () => {
    setup()
    expect((await get('nope')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('returns the destinations and the nivel of the current rol', async () => {
    setup({
      data: [
        {
          equipo_id: EQUIPO,
          ruta: 'DPS › Producción Técnica › Audio',
          experiencia: 'dps',
          dirige: true,
          roles: [{ id: ROL, label: 'Líder', nivel: 'lider' }],
        },
      ],
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_cambiar_area_destinos', { p_servicio: SERVICIO })
    expect(await res.json()).toEqual({
      destinos: [
        {
          equipoId: EQUIPO,
          ruta: ['DPS', 'Producción Técnica', 'Audio'],
          experiencia: 'dps',
          dirige: true,
          roles: [{ id: ROL, label: 'Líder', nivel: 'lider' }],
        },
      ],
      nivelActual: 'lider',
    })
  })
  it('403 with the Spanish message when the caller does not direct the current área', async () => {
    setup({ error: { code: '42501', message: 'No tienes autoridad de director sobre el área actual de este servicio.' } })
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tienes autoridad de director sobre el área actual de este servicio.')
  })
})

describe('POST /api/dream-team/servicios/[id]/cambiar-area', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await post(CUERPO)).status).toBe(401)
  })
  it('400 for an invalid body, without calling the RPC', async () => {
    setup()
    expect((await post('{')).status).toBe(400)
    const sinMotivo = await post({ ...CUERPO, motivo: '' })
    expect(sinMotivo.status).toBe(400)
    expect((await sinMotivo.json()).error).toBe('Elige el motivo: Corrección o Traslado.')
    expect((await post({ ...CUERPO, rolId: '' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('moves directly with dream_team_cambiar_area (nota trimmed)', async () => {
    setup({ data: 'nuevo-servicio' })
    const res = await post(CUERPO)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_cambiar_area', {
      p_servicio: SERVICIO,
      p_equipo_destino: EQUIPO,
      p_rol_destino: ROL,
      p_motivo: 'correccion',
      p_nota: 'Estaba mal cargado',
    })
    expect(await res.json()).toEqual({ modo: 'directo', id: 'nuevo-servicio' })
  })
  it('sends a request with dream_team_solicitar_cambio_area (no nota is null)', async () => {
    setup({ data: SOLICITUD })
    const res = await post({ ...CUERPO, modo: 'solicitud', motivo: 'traslado', nota: undefined })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_solicitar_cambio_area', {
      p_servicio: SERVICIO,
      p_equipo_destino: EQUIPO,
      p_rol_destino: ROL,
      p_motivo: 'traslado',
      p_nota: null,
    })
    expect(await res.json()).toEqual({ modo: 'solicitud', id: SOLICITUD })
  })
  it('422 with the Spanish message of a refused move', async () => {
    setup({ error: { code: '22023', message: 'Este servicio ya tiene una solicitud de cambio de área pendiente.' } })
    const res = await post({ ...CUERPO, modo: 'solicitud' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('Este servicio ya tiene una solicitud de cambio de área pendiente.')
  })
  it('500 without the detail of an unexpected error', async () => {
    setup({ error: { code: 'XX000', message: 'boom' } })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post(CUERPO)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Error interno')
  })
})

describe('POST /api/dream-team/solicitudes-cambio-area/[id]', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await resolver({ aprobar: true })).status).toBe(401)
  })
  it('400 without a decision or with a malformed id, without calling the RPC', async () => {
    setup()
    expect((await resolver({})).status).toBe(400)
    expect((await resolver({ aprobar: true }, 'nope')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('approves with the answer', async () => {
    setup({ data: 'nuevo-servicio' })
    const res = await resolver({ aprobar: true, respuesta: ' De acuerdo ' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_resolver_solicitud_cambio_area', {
      p_solicitud: SOLICITUD,
      p_aprobar: true,
      p_respuesta: 'De acuerdo',
    })
  })
  it('rejects without an answer', async () => {
    setup({ data: null })
    expect((await resolver({ aprobar: false })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_resolver_solicitud_cambio_area', {
      p_solicitud: SOLICITUD,
      p_aprobar: false,
      p_respuesta: null,
    })
  })
  it('422 with the Spanish message when the servicio changed', async () => {
    const mensaje = 'El servicio cambió desde que se envió la solicitud (fue retirado o ya no está en esa área); no se puede aprobar.'
    setup({ error: { code: '22023', message: mensaje } })
    const res = await resolver({ aprobar: true })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe(mensaje)
  })
})
