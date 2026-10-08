/**
 * @jest-environment node
 *
 * Dream Team — GET/PATCH /api/dream-team/personas/[id]/ficha (T11).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { GET, PATCH } from '@/app/api/dream-team/personas/[id]/ficha/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FILA = {
  id: ID, nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '1990-05-17', cedula: null,
  genero: 'Femenino', estado_civil: 'Casado', telefono: null, redes_sociales: null,
}
let rpc: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] } : null)
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const url = new URL(`http://localhost/api/dream-team/personas/${ID}/ficha`)
const get = (id?: string) => GET(new NextRequest(url), ctx(id))
const patch = (body: unknown, id?: string) =>
  PATCH(new NextRequest(url, { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/personas/[id]/ficha', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'; setup()
    expect((await get()).status).toBe(404)
  })
  it('401 without a session', async () => { setup({}, null); expect((await get()).status).toBe(401) })
  it('400 for a malformed id', async () => { setup(); expect((await get('nope')).status).toBe(400) })
  it('returns the ficha; the database decides who may read it', async () => {
    setup({ data: FILA })
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).ficha).toMatchObject({ id: ID, fechaNacimiento: '1990-05-17', estadoCivil: 'Casado' })
    expect(rpc).toHaveBeenCalledWith('dream_team_ficha_persona', { p_persona_id: ID })
  })
  it('403 when the RPC refuses', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    expect((await get()).status).toBe(403)
  })
})

describe('PATCH /api/dream-team/personas/[id]/ficha', () => {
  it('401 without a session', async () => { setup({}, null); expect((await patch({ genero: 'Femenino' })).status).toBe(401) })
  it('400 for an invalid body, without calling the RPC', async () => {
    setup()
    expect((await patch('{')).status).toBe(400)
    const res = await patch({ fechaNacimiento: '2999-01-01' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('La fecha de nacimiento no puede ser futura')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('sends only the keys present and returns the updated ficha', async () => {
    setup({ data: FILA })
    const res = await patch({ fechaNacimiento: '1990-05-17', cedula: 'V-20.111.222' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', {
      p_persona_id: ID,
      p_datos: { fecha_nacimiento: '1990-05-17', cedula: '20111222' },
    })
    expect((await res.json()).ficha.apellido).toBe('Pérez')
  })
  it('409 for a cedula another person holds', async () => {
    setup({ error: { code: '23505', message: 'cedula_duplicada' } })
    const res = await patch({ cedula: '12345678' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Esa cédula ya pertenece a otra persona')
  })
  it('403 out of scope', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    expect((await patch({ genero: 'Femenino' })).status).toBe(403)
  })
})
