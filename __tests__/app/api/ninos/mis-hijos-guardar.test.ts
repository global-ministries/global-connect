/**
 * @jest-environment node
 *
 * POST /api/ninos/mis-hijos/[id] (M6c): the parent's save runs as the user;
 * a pickup-list change emails the other linked parents after the response,
 * with recipients read server-side (service role). The sender is mocked.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))
const tareasAfter: Array<() => unknown> = []
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (tarea: () => unknown) => {
    tareasAfter.push(tarea)
  },
}))

import { POST } from '@/app/api/ninos/mis-hijos/[id]/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const aviso = {
  cambio_id: 'c1',
  nino_nombre: 'Sofía',
  actor_nombre: 'Rita Gómez',
  autorizados: [{ nombre: 'Tía Ana', relacion: 'Tía' }, { nombre: 'Vecino', relacion: null }],
  destinatarios: [{ id: 'p2', nombre: 'Olga', email: 'olga@example.test' }],
}
let rpc: jest.Mock
let adminRpc: jest.Mock

function setup({ user = { id: 'auth-5' } as object | null, campos = ['autorizados'], error = null as object | null } = {}) {
  rpc = jest.fn().mockResolvedValue(error ? { data: null, error } : { data: { campos }, error: null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  adminRpc = jest.fn().mockResolvedValue({ data: aviso, error: null })
  createAdmin.mockReturnValue({ rpc: adminRpc })
  sendEmail.mockResolvedValue({ success: true })
}

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/ninos/mis-hijos/${ID}`, { method: 'POST', body: JSON.stringify(body) })
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  tareasAfter.length = 0
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ninos/mis-hijos/[id]', () => {
  it('saves as the user and emails the other parents after the response', async () => {
    setup()
    const payload = { autorizados: [{ nombre: 'Tía Ana', telefono: '04120000001', relacion: 'Tía' }] }
    const res = await POST(req({ payload }), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ campos: ['autorizados'] })
    expect(JSON.stringify(body)).not.toContain('@')
    expect(rpc).toHaveBeenCalledWith('ninos_mis_hijos_guardar', { p_nino_id: ID, p: payload })
    // Nothing is read with the service role or sent before the response.
    expect(createAdmin).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()

    await Promise.all(tareasAfter.map((t) => t()))
    expect(adminRpc).toHaveBeenCalledWith('ninos_aviso_autorizados', { p_nino_id: ID, p_auth_id: 'auth-5' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'olga@example.test',
        subject: 'Cambió la lista de quién puede retirar a Sofía',
        idempotencyKey: 'ninos-autorizados-c1-p2',
      }),
    )
  })

  it('sends nothing when the pickup list did not change', async () => {
    setup({ campos: ['alergias'] })
    const res = await POST(req({ payload: { alergias: 'Maní' } }), ctx())
    expect(res.status).toBe(200)
    expect(tareasAfter).toHaveLength(0)
  })

  it('maps an RPC refusal to its status with the snake_case code', async () => {
    setup({ error: { code: '22023', message: 'nino_no_encontrado' } })
    const res = await POST(req({ payload: { alergias: 'x' } }), ctx())
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: '22023', message: 'nino_no_encontrado' } })
    expect(tareasAfter).toHaveLength(0)
  })

  it('refuses without a session, a bad id or a body without payload', async () => {
    setup({ user: null })
    expect((await POST(req({ payload: {} }), ctx())).status).toBe(401)
    setup()
    expect((await POST(req({ payload: {} }), ctx('no-uuid'))).status).toBe(400)
    expect((await POST(req({ algo: 1 }), ctx())).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('an email failure never fails the save', async () => {
    setup()
    sendEmail.mockRejectedValue(new Error('down'))
    const res = await POST(req({ payload: { autorizados: [] } }), ctx())
    expect(res.status).toBe(200)
    await expect(Promise.all(tareasAfter.map((t) => t()))).resolves.toBeDefined()
  })
})
