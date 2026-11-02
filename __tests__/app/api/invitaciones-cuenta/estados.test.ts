/**
 * @jest-environment node
 *
 * POST /api/invitaciones-cuenta/estados (T2 of odd/tasks/invitaciones-pendientes.md).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/invitaciones-cuenta/estados/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let rpc: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? [], error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
}

const url = new URL('http://localhost/api/invitaciones-cuenta/estados')
const post = (body: unknown) => POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => jest.clearAllMocks())

describe('POST /api/invitaciones-cuenta/estados', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await post({ ids: [ANA] })).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 for a bad body, a bad id or more than 2000 ids', async () => {
    setup()
    expect((await post({ ids: 'x' })).status).toBe(400)
    expect((await post({ ids: [ANA, 'x'] })).status).toBe(400)
    const muchos = Array.from({ length: 2001 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${i.toString(16).padStart(12, '0')}`)
    const res = await post({ ids: muchos })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Demasiadas personas (máximo 2000)')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns the summaries read as the caller', async () => {
    setup({
      data: [
        {
          usuario_id: ANA,
          id: 'inv-1',
          estado: 'aceptada',
          email: 'ana@example.test',
          created_at: '2026-10-01T10:00:00Z',
          aceptada_at: '2026-10-01T11:00:00Z',
          invitado_por_nombre: 'Marta Díaz',
        },
      ],
    })
    const res = await post({ ids: [ANA, ANA] })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('invitacion_cuenta_estados', { p_usuario_ids: [ANA] })
    expect(await res.json()).toEqual({
      invitaciones: [
        {
          usuarioId: ANA,
          estado: 'registrada',
          email: 'ana@example.test',
          enviadaEl: '2026-10-01T10:00:00Z',
          aceptadaEl: '2026-10-01T11:00:00Z',
          invitadoPor: 'Marta Díaz',
          envios: 1,
          historial: [
            { estado: 'aceptada', email: 'ana@example.test', fecha: '2026-10-01T10:00:00Z', invitadoPor: 'Marta Díaz' },
          ],
        },
      ],
    })
  })

  it('answers an empty list without calling the database for no ids', async () => {
    setup()
    const res = await post({ ids: [] })
    expect(await res.json()).toEqual({ invitaciones: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('500 when the database fails', async () => {
    setup({ error: { code: 'XX000', message: 'boom' } })
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post({ ids: [ANA] })).status).toBe(500)
    log.mockRestore()
  })
})
