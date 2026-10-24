/**
 * @jest-environment node
 *
 * G5 — POST /api/ninos/familia/[id]/invitar: the invitation of the new adult
 * registered at the table goes through ninos_familia_invitar (as the caller),
 * bound to the ficha of the URL.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/ninos/familia/[id]/invitar/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let rpc: jest.Mock
let adminRpc: jest.Mock

function setup(user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: { id: 'inv1', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: null }, error: null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  adminRpc = jest.fn().mockResolvedValue({ data: null, error: null })
  createAdmin.mockReturnValue({
    rpc: adminRpc,
    auth: {
      admin: {
        generateLink: jest.fn().mockResolvedValue({ data: { user: { id: 'au-n' }, properties: { hashed_token: 'h' } }, error: null }),
        getUserById: jest.fn(),
        deleteUser: jest.fn(),
      },
    },
  })
  sendEmail.mockResolvedValue({ success: true })
}

const post = (body: unknown, id = ID) =>
  POST(new NextRequest(`http://localhost/api/ninos/familia/${id}/invitar`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => jest.clearAllMocks())

describe('POST /api/ninos/familia/[id]/invitar', () => {
  it('401 without a session; 400 for a bad id', async () => {
    setup(null)
    expect((await post({ email: 'ana@example.test' })).status).toBe(401)
    setup()
    expect((await post({ email: 'ana@example.test' }, 'x')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('invites through the table-bound RPC for exactly the ficha of the URL', async () => {
    setup()
    const res = await post({ email: 'ana@example.test' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'ana@example.test' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('ninos_familia_invitar', { p_padre_id: ID, p_email: 'ana@example.test' })
    expect(adminRpc).toHaveBeenCalledWith('invitacion_cuenta_registrar_envio', { p_id: 'inv1', p_auth_user_id: 'au-n' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test', subject: 'Te invitamos a GlobalConnect' }))
  })

  it('a refusal of the database comes back with its status', async () => {
    setup()
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    const res = await post({ email: 'ana@example.test' })
    expect(res.status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
