/**
 * @jest-environment node
 *
 * T3a (odd/tasks/ninos-checkin-pco.md, S10) — /api/ninos/impresion/agente: the print
 * agent authenticates with its station token (Bearer), hashed and looked up
 * with the service client; GET claims jobs, POST reports one.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))

import { GET, POST } from '@/app/api/ninos/impresion/agente/route'
import { hashToken } from '@/lib/platform/ninos/impresion'

const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock

const TOKEN = '0123456789abcdef'.repeat(4)
const E1 = '11111111-1111-4111-8111-111111111111'
const J1 = '55555555-5555-4555-8555-555555555555'
const estacion = { id: E1, campus_id: 'c1', nombre: 'Mesa', ancho_mm: 50, alto_mm: 30, dpi: 203, activa: true, token_hash: hashToken(TOKEN) }
const trabajo = {
  id: J1, tipo: 'nino', intentos: 1, created_at: '2026-11-08T13:00:00Z',
  payload: { nombre: 'Sofía', apellido: 'Pérez', codigo: '4821', salon: 'Preescolar', area: 'waumba', alergias: true, fecha: '2026-11-08', servicio: '9 AM', hora: '09:00' },
}
let rpc: jest.Mock

function setup(respuestas: Record<string, { data?: unknown; error?: unknown }>) {
  rpc = jest.fn((nombre: string) => Promise.resolve({ data: respuestas[nombre]?.data ?? null, error: respuestas[nombre]?.error ?? null }))
  createAdmin.mockReturnValue({ rpc })
}

const conToken = (token: string | null): Record<string, string> => (token === null ? {} : { authorization: `Bearer ${token}` })
const get = (token: string | null, query = '') =>
  new NextRequest(`http://localhost/api/ninos/impresion/agente${query}`, { headers: conToken(token) })
const post = (token: string | null, body: unknown) =>
  new NextRequest('http://localhost/api/ninos/impresion/agente', {
    method: 'POST', headers: conToken(token), body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => jest.clearAllMocks())

describe('GET /api/ninos/impresion/agente', () => {
  it('401 without a token or with a malformed one, nothing looked up', async () => {
    setup({})
    expect((await GET(get(null))).status).toBe(401)
    expect((await GET(get('nope'))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('401 for an unknown or inactive station (the lookup returns null)', async () => {
    setup({ ninos_impresion_agente_estacion: { data: null } })
    const res = await GET(get(TOKEN))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: '401' } })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_agente_estacion', { p_token_hash: hashToken(TOKEN) })
    expect(rpc).not.toHaveBeenCalledWith('ninos_impresion_agente_reclamar', expect.anything())
  })

  it('401 when the stored hash does not match (constant-time check)', async () => {
    setup({ ninos_impresion_agente_estacion: { data: { ...estacion, token_hash: 'f'.repeat(64) } } })
    expect((await GET(get(TOKEN))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalledWith('ninos_impresion_agente_reclamar', expect.anything())
  })

  it('the token never travels to the database, only its hash', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reclamar: { data: [] } })
    await GET(get(TOKEN))
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(TOKEN)
  })

  it('claims the jobs of its station and sends the label size, never the hash', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reclamar: { data: [trabajo] } })
    const res = await GET(get(TOKEN, '?max=5'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toEqual({ estacion: { id: E1, nombre: 'Mesa', ancho_mm: 50, alto_mm: 30, dpi: 203 }, trabajos: [trabajo] })
    expect(JSON.stringify(body)).not.toContain(estacion.token_hash)
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_agente_reclamar', { p_estacion_id: E1, p_max: 5 })
  })

  it('max defaults to 10', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reclamar: { data: [] } })
    expect(await (await GET(get(TOKEN))).json()).toEqual(expect.objectContaining({ trabajos: [] }))
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_agente_reclamar', { p_estacion_id: E1, p_max: 10 })
  })

  it('a database error is a 500 and nothing personal or secret is logged', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reclamar: { error: { code: 'XX000', message: 'Sofía' } } })
    expect((await GET(get(TOKEN))).status).toBe(500)
    createAdmin.mockImplementation(() => { throw new Error(`boom ${TOKEN}`) })
    expect((await GET(get(TOKEN))).status).toBe(500)
    const logs = JSON.stringify(log.mock.calls)
    expect(logs).not.toContain(TOKEN)
    expect(logs).not.toContain(estacion.token_hash)
    expect(logs).not.toContain('Sofía')
    log.mockRestore()
  })
})

describe('POST /api/ninos/impresion/agente', () => {
  it('401 without a valid token, nothing reported', async () => {
    setup({ ninos_impresion_agente_estacion: { data: null } })
    expect((await POST(post(null, { id: J1, estado: 'impresa' }))).status).toBe(401)
    expect((await POST(post(TOKEN, { id: J1, estado: 'impresa' }))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalledWith('ninos_impresion_agente_reportar', expect.anything())
  })

  it('400 for a malformed body', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion } })
    expect((await POST(post(TOKEN, '{x'))).status).toBe(400)
    expect((await POST(post(TOKEN, { id: J1, estado: 'pendiente' }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('ninos_impresion_agente_reportar', expect.anything())
  })

  it('reports a printed job for its own station', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reportar: { data: { id: J1, estado: 'impresa' } } })
    const res = await POST(post(TOKEN, { id: J1, estado: 'impresa' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: J1, estado: 'impresa' })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_agente_reportar', { p_estacion_id: E1, p_impresion_id: J1, p_estado: 'impresa', p_error: null })
  })

  it('reports an error with its text', async () => {
    setup({ ninos_impresion_agente_estacion: { data: estacion }, ninos_impresion_agente_reportar: { data: { id: J1, estado: 'error' } } })
    await POST(post(TOKEN, { id: J1, estado: 'error', error: ' sin papel ' }))
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_agente_reportar', { p_estacion_id: E1, p_impresion_id: J1, p_estado: 'error', p_error: 'sin papel' })
  })

  it('a job of another station comes back as its fixed code', async () => {
    setup({
      ninos_impresion_agente_estacion: { data: estacion },
      ninos_impresion_agente_reportar: { error: { code: '22023', message: 'trabajo_no_encontrado' } },
    })
    const res = await POST(post(TOKEN, { id: J1, estado: 'impresa' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: '22023', message: 'trabajo_no_encontrado' } })
  })
})
