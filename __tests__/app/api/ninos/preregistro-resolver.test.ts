/**
 * @jest-environment node
 *
 * POST /api/ninos/preregistro/[id] (N8): resolve as the caller, then welcome
 * email and account invitation through ninos_preregistro_invitar.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/ninos/preregistro/[id]/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const payload = {
  padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null, genero: 'Femenino' },
  hijos: [{ nombre: 'Sofía', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', genero: 'Femenino' }],
  autorizados: [],
}
let rpc: jest.Mock
let adminRpc: jest.Mock

function setup(user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn((nombre: string) =>
    Promise.resolve(
      nombre === 'ninos_preregistro_resolver'
        ? { data: { padre_id: 'p1', padre_nuevo: true, estado: 'confirmado' }, error: null }
        : { data: { id: 'inv1', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: null }, error: null },
    ),
  )
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
  POST(new NextRequest(`http://localhost/api/ninos/preregistro/${id}`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => jest.clearAllMocks())

describe('POST /api/ninos/preregistro/[id]', () => {
  it('401 without a session; 400 for a bad id or body', async () => {
    setup(null)
    expect((await post({ accion: 'descartar' })).status).toBe(401)
    setup()
    expect((await post({ accion: 'descartar' }, 'x')).status).toBe(400)
    expect((await post({ accion: 'otra' })).status).toBe(400)
  })

  it('confirms, welcomes and invites with the preregistro-bound RPC', async () => {
    setup()
    const res = await post({ accion: 'confirmar', payload, email: 'ana@example.test' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, padreId: 'p1', correo: 'enviado', invitacion: 'enviada' })
    expect(rpc).toHaveBeenCalledWith('ninos_preregistro_invitar', { p_id: ID, p_email: 'ana@example.test' })
    expect(adminRpc).toHaveBeenCalledWith('invitacion_cuenta_registrar_envio', { p_id: 'inv1', p_auth_user_id: 'au-n' })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Bienvenidos a Waumba Land / UpStreet', idempotencyKey: `ninos-bienvenida-${ID}` }))
  })
})
