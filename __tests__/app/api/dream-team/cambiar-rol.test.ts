/**
 * @jest-environment node
 *
 * Dream Team — «Cambiar rol» (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3):
 * GET/POST /api/dream-team/servicios/[id]/cambiar-rol. The database decides
 * (dream_team_servicio_roles_cambiables, dream_team_servicio_cambiar_rol); its
 * codes reach the UI in plain Spanish.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { GET, POST } from '@/app/api/dream-team/servicios/[id]/cambiar-rol/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const SERVICIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ROL_VIEJO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let rpc: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] } : null)
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const url = new URL(`http://localhost/api/dream-team/servicios/${SERVICIO}/cambiar-rol`)
const get = (id = SERVICIO) => GET(new NextRequest(url), ctx(id))
const post = (body: unknown, id = SERVICIO) =>
  POST(new NextRequest(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/servicios/[id]/cambiar-rol', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'
    setup()
    expect((await get()).status).toBe(404)
  })
  it('401 without a session, without calling the RPC', async () => {
    setup({}, null)
    expect((await get()).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('400 for a malformed id, without calling the RPC', async () => {
    setup()
    const res = await get('nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Servicio inválido')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('returns the roles of the equipo with the current one marked', async () => {
    setup({
      data: [
        { id: ROL, label: 'Líder', nivel: 'lider', actual: false, asignable: true },
        { id: ROL_VIEJO, label: 'Voluntario', nivel: 'voluntario', actual: true, asignable: false },
      ],
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_servicio_roles_cambiables', { p_servicio: SERVICIO })
    expect(await res.json()).toEqual({
      roles: [
        { id: ROL, label: 'Líder', nivel: 'lider', actual: false, asignable: true },
        { id: ROL_VIEJO, label: 'Voluntario', nivel: 'voluntario', actual: true, asignable: false },
      ],
    })
  })
  it('403 in plain Spanish when the caller may not change roles there', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tienes permiso para cambiar roles en esta área.')
  })
  it('403 in plain Spanish for one’s own servicio without director authority', async () => {
    setup({ error: { code: '42501', message: 'propio_servicio' } })
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No puedes cambiar tu propio rol. Pídeselo a la dirección del área.')
  })
})

describe('POST /api/dream-team/servicios/[id]/cambiar-rol', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'
    setup()
    expect((await post({ rolId: ROL })).status).toBe(404)
  })
  it('401 without a session, without calling the RPC', async () => {
    setup({}, null)
    expect((await post({ rolId: ROL })).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('400 for a malformed id or body, without calling the RPC', async () => {
    setup()
    expect((await post({ rolId: ROL }, 'nope')).status).toBe(400)
    const roto = await post('{')
    expect(roto.status).toBe(400)
    expect((await roto.json()).error).toBe('Body inválido')
    const sinRol = await post({ nota: 'x' })
    expect(sinRol.status).toBe(400)
    expect((await sinRol.json()).error).toBe('Elige el rol nuevo.')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('changes the rol with dream_team_servicio_cambiar_rol (nota trimmed)', async () => {
    setup({ data: { servicio_id: SERVICIO, rol_anterior_id: ROL_VIEJO, rol_id: ROL, rol_label: 'Líder' } })
    const res = await post({ rolId: ROL, nota: '  Ya lidera el turno ' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dream_team_servicio_cambiar_rol', { p_servicio: SERVICIO, p_rol: ROL, p_nota: 'Ya lidera el turno' })
    expect(await res.json()).toEqual({ servicioId: SERVICIO, rolAnteriorId: ROL_VIEJO, rolId: ROL, rolLabel: 'Líder' })
  })
  it('sends a null nota when there is none', async () => {
    setup({ data: { servicio_id: SERVICIO, rol_anterior_id: ROL_VIEJO, rol_id: ROL, rol_label: 'Líder' } })
    expect((await post({ rolId: ROL })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_servicio_cambiar_rol', { p_servicio: SERVICIO, p_rol: ROL, p_nota: null })
  })
  it.each([
    ['42501', 'rol_direccion', 403, 'Solo la dirección del área puede asignar un rol de dirección.'],
    ['42501', 'sin_autoridad', 403, 'No tienes permiso para cambiar roles en esta área.'],
    ['22023', 'mismo_rol', 422, 'Ese ya es su rol. Elige otro.'],
    ['22023', 'rol_invalido', 422, 'Elige un rol activo de esta misma área.'],
    ['22023', 'servicio_retirado', 422, 'Este servicio está retirado; no se le puede cambiar el rol.'],
  ])('%s %s → %i in plain Spanish', async (code, message, status, error) => {
    setup({ error: { code, message } })
    const res = await post({ rolId: ROL })
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error })
  })
  it('500 without the detail of an unexpected error', async () => {
    setup({ error: { code: 'XX000', message: 'boom' } })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ rolId: ROL })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Error interno')
  })
})
