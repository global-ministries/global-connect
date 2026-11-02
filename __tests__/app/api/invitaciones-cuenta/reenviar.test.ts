/**
 * @jest-environment node
 *
 * POST /api/invitaciones-cuenta/reenviar (T2 of odd/tasks/invitaciones-pendientes.md).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/invitaciones-cuenta/reenviar/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LUIS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
let rpc: jest.Mock

const filas = [
  {
    usuario_id: ANA, id: 'inv-a', estado: 'enviada', email: 'ana@example.test',
    created_at: '2026-10-01T10:00:00Z', aceptada_at: null, invitado_por_nombre: null,
  },
  {
    usuario_id: LUIS, id: 'inv-l', estado: 'enviada', email: 'luis@example.test',
    created_at: '2026-10-01T10:00:00Z', aceptada_at: null, invitado_por_nombre: null,
  },
]

function setup(user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn(async (nombre: string, args: Record<string, unknown>) => {
    if (nombre === 'invitacion_cuenta_estados') return { data: filas, error: null }
    if (args.p_usuario_id === LUIS) return { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    return { data: { id: 'inv-nueva', email: args.p_email, nombre: 'Ana', auth_user_id_previo: null }, error: null }
  })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  createAdmin.mockReturnValue({
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      admin: {
        generateLink: jest.fn().mockResolvedValue({
          data: { user: { id: 'auth-nuevo' }, properties: { hashed_token: 'hash-1' } },
          error: null,
        }),
        getUserById: jest.fn(),
        deleteUser: jest.fn(),
      },
    },
  })
  sendEmail.mockResolvedValue({ success: true })
}

const url = new URL('http://localhost/api/invitaciones-cuenta/reenviar')
const post = (body: unknown) => POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => jest.clearAllMocks())

describe('POST /api/invitaciones-cuenta/reenviar', () => {
  it('401 without a session', async () => {
    setup(null)
    expect((await post({ ids: [ANA] })).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 for a bad id, no ids or more than 50 ids', async () => {
    setup()
    expect((await post({ ids: ['x'] })).status).toBe(400)
    expect((await post({ ids: [] })).status).toBe(400)
    const muchos = Array.from({ length: 51 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${i.toString(16).padStart(12, '0')}`)
    expect((await post({ ids: muchos })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('200 with one result per person, even when some fail', async () => {
    setup()
    const res = await post({ ids: [ANA, LUIS, SIN] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      resultados: [
        { id: ANA, ok: true, email: 'ana@example.test' },
        { id: LUIS, ok: false, error: 'No tienes permiso para invitar a esta persona' },
        { id: SIN, ok: false, error: 'No hay una invitación para reenviar' },
      ],
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test' }))
  })
})

describe('route config', () => {
  it('allows up to 60 s: each send takes seconds (the client sends batches of 10)', async () => {
    const ruta = await import('@/app/api/invitaciones-cuenta/reenviar/route')
    expect((ruta as { maxDuration?: number }).maxDuration).toBe(60)
  })
})
