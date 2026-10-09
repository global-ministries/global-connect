/**
 * @jest-environment node
 *
 * POST /api/ninos/preregistro (N8): public, no session, service-role RPC.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))

import { POST } from '@/app/api/ninos/preregistro/route'

const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const CAMPUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let rpc: jest.Mock

const valido = {
  campusId: CAMPUS,
  padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', email: '', cedula: '' },
  hijos: [{ nombre: 'Sofía', apellido: 'Pérez', fechaNacimiento: '2021-03-04', genero: 'Femenino', grado: '' }],
  autorizados: [],
  sitioWeb: '',
}

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new NextRequest('http://localhost/api/ninos/preregistro', { method: 'POST', body, headers }))

beforeEach(() => {
  rpc = jest.fn().mockResolvedValue({ data: 'ok', error: null })
  createAdmin.mockReturnValue({ rpc })
})

describe('POST /api/ninos/preregistro', () => {
  it('stores a valid form and answers only ok', async () => {
    const res = await post(JSON.stringify(valido), { 'x-forwarded-for': '1.2.3.4' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('ninos_preregistro_crear', expect.objectContaining({ p_campus_id: CAMPUS }))
    expect(rpc.mock.calls[0][1].p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('413 for an oversized body before touching the database', async () => {
    const res = await post(JSON.stringify({ ...valido, relleno: 'x'.repeat(40_000) }))
    expect(res.status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 for invalid JSON', async () => {
    expect((await post('{nope')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 for an invalid form', async () => {
    expect((await post(JSON.stringify({ ...valido, hijos: [] }))).status).toBe(400)
  })

  it('honeypot: ok without storing', async () => {
    const res = await post(JSON.stringify({ ...valido, sitioWeb: 'spam' }))
    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('429 when rate limited', async () => {
    rpc.mockResolvedValue({ data: 'limite', error: null })
    expect((await post(JSON.stringify(valido))).status).toBe(429)
  })
})
