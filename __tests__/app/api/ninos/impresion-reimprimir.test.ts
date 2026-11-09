/**
 * @jest-environment node
 *
 * T3a (odd/tasks/ninos-checkin-pco.md, S10, S6) — POST
 * /api/ninos/impresion/reimprimir: the desk re-queues the labels of an open
 * visit with a reason, as the user (the authority stays in SQL).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))

import { POST } from '@/app/api/ninos/impresion/reimprimir/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

const E1 = '11111111-1111-4111-8111-111111111111'
const T1 = '33333333-3333-4333-8333-333333333333'
const N1 = '44444444-4444-4444-8444-444444444444'
const cuerpo = { estacionId: E1, turnoId: T1, fecha: '2026-11-08', codigo: '4821', tipo: 'nino', ninoId: N1, motivo: 'se_trabo' }
let rpc: jest.Mock

function setup(respuesta: { data?: unknown; error?: unknown }, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn(() => Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null }))
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
}

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/ninos/impresion/reimprimir', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => jest.clearAllMocks())

describe('POST /api/ninos/impresion/reimprimir', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await POST(req(cuerpo))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 for a malformed body, nothing called', async () => {
    setup({})
    expect((await POST(req({ ...cuerpo, ninoId: undefined }))).status).toBe(400)
    expect((await POST(req({ ...cuerpo, codigo: 'x' }))).status).toBe(400)
    expect((await POST(req({ ...cuerpo, motivo: undefined }))).status).toBe(400)
    expect((await POST(req({ ...cuerpo, motivo: 'otro' }))).status).toBe(400)
    expect((await POST(req('{x'))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls ninos_impresion_reimprimir as the user and returns the counts', async () => {
    setup({ data: { ninos: 1, representantes: 0 } })
    const res = await POST(req(cuerpo))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ninos: 1, representantes: 0 })
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimprimir', {
      p_estacion_id: E1, p_turno_id: T1, p_fecha: '2026-11-08', p_codigo: '4821', p_tipo: 'nino', p_nino_id: N1,
      p_motivo: 'se_trabo', p_nota: null,
    })
  })

  it('a whole visit travels without a child', async () => {
    setup({ data: { ninos: 2, representantes: 1 } })
    await POST(req({ ...cuerpo, tipo: 'todas', ninoId: null }))
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimprimir', expect.objectContaining({ p_tipo: 'todas', p_nino_id: null }))
  })

  it('S10: the reason and the trimmed note travel to the RPC', async () => {
    setup({ data: { ninos: 2, representantes: 1 } })
    await POST(req({ ...cuerpo, tipo: 'todas', ninoId: null, motivo: 'otro', nota: '  Se mojó el papel ' }))
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimprimir', expect.objectContaining({ p_motivo: 'otro', p_nota: 'Se mojó el papel' }))
  })

  it('fixed RPC codes pass through, any other message does not', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    let res = await POST(req(cuerpo))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: { code: '42501', message: 'sin_autoridad' } })
    setup({ error: { code: '22023', message: 'estacion_inactiva' } })
    res = await POST(req(cuerpo))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: '22023', message: 'estacion_inactiva' } })
    setup({ error: { code: '22023', message: 'room of Sofía' } })
    expect(await (await POST(req(cuerpo))).json()).toEqual({ error: { code: '22023' } })
  })
})
