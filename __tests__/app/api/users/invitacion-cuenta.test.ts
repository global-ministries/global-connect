/**
 * @jest-environment node
 *
 * GET/POST/DELETE /api/users/[id]/invitacion-cuenta (T12; DELETE is T2 of
 * odd/tasks/invitaciones-pendientes.md).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { DELETE, GET, POST } from '@/app/api/users/[id]/invitacion-cuenta/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let rpc: jest.Mock
let adminRpc: jest.Mock
let generateLink: jest.Mock
let getUserById: jest.Mock
let deleteUser: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  adminRpc = jest.fn().mockResolvedValue({ data: null, error: null })
  generateLink = jest.fn().mockResolvedValue({
    data: { user: { id: 'auth-nuevo' }, properties: { hashed_token: 'hash-1' } },
    error: null,
  })
  getUserById = jest.fn().mockResolvedValue({ data: { user: null }, error: null })
  deleteUser = jest.fn().mockResolvedValue({ error: null })
  createAdmin.mockReturnValue({
    rpc: adminRpc,
    auth: { admin: { generateLink, getUserById, deleteUser } },
  })
  sendEmail.mockResolvedValue({ success: true })
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const url = new URL(`http://localhost/api/users/${ID}/invitacion-cuenta`)
const post = (body: unknown, id?: string) =>
  POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body) }), ctx(id))

beforeEach(() => jest.clearAllMocks())

describe('GET /api/users/[id]/invitacion-cuenta', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await GET(new NextRequest(url), ctx())).status).toBe(401)
  })
  it('404 when the caller may not invite (the RPC answers null)', async () => {
    setup({ data: null })
    expect((await GET(new NextRequest(url), ctx())).status).toBe(404)
  })
  it('returns the state', async () => {
    setup({ data: { sin_cuenta: true, email_ficha: null, invitacion: null } })
    const res = await GET(new NextRequest(url), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ estado: { sinCuenta: true, emailFicha: null, invitacion: null } })
    expect(rpc).toHaveBeenCalledWith('invitacion_cuenta_estado', { p_usuario_id: ID })
  })
})

describe('POST /api/users/[id]/invitacion-cuenta', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await post({ email: 'ana@example.test' })).status).toBe(401)
  })
  it('400 for a bad id or a bad email', async () => {
    setup()
    expect((await post({ email: 'ana@example.test' }, 'x')).status).toBe(400)
    expect((await post({ email: 'nope' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('403 when the database refuses the caller, and nothing is created', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    expect((await post({ email: 'ana@example.test' })).status).toBe(403)
    expect(generateLink).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('409 with the code when the email belongs to someone else', async () => {
    setup({ error: { code: '23505', message: 'email_en_uso' } })
    const res = await post({ email: 'ana@example.test' })
    expect(res.status).toBe(409)
    expect((await res.json()).codigo).toBe('email_en_uso')
  })
  it('invites: records as the caller, creates the account and sends the email', async () => {
    setup({ data: { id: 'inv-1', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: null } })
    const res = await post({ email: 'Ana@Example.test', reemplazarEmail: true })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('invitacion_cuenta_crear', {
      p_usuario_id: ID, p_email: 'ana@example.test', p_reemplazar_email: true,
    })
    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite', email: 'ana@example.test', options: { data: { invitacion_cuenta_id: 'inv-1' } },
    })
    expect(adminRpc).toHaveBeenCalledWith('invitacion_cuenta_registrar_envio', { p_id: 'inv-1', p_auth_user_id: 'auth-nuevo' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test' }))
  })
})

describe('DELETE /api/users/[id]/invitacion-cuenta', () => {
  const borrar = (id?: string) => DELETE(new NextRequest(url, { method: 'DELETE' }), ctx(id))

  it('401 without a session', async () => {
    setup({}, null)
    expect((await borrar()).status).toBe(401)
  })
  it('400 for a bad id', async () => {
    setup()
    expect((await borrar('x')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('403 when the database refuses the caller', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    const res = await borrar()
    expect(res.status).toBe(403)
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('409 when there is no open invitation', async () => {
    setup({ error: { code: 'P0002', message: 'sin_invitacion_abierta' } })
    const res = await borrar()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Esta persona no tiene una invitación abierta')
  })
  it('cancels as the caller and deletes the never-confirmed auth account', async () => {
    setup({ data: { id: 'inv-1', auth_user_id: 'auth-1' } })
    getUserById.mockResolvedValue({ data: { user: { email: 'ana@example.test', email_confirmed_at: null } }, error: null })
    const res = await borrar()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('invitacion_cuenta_cancelar', { p_usuario_id: ID })
    expect(deleteUser).toHaveBeenCalledWith('auth-1')
  })
  it('keeps a confirmed auth account', async () => {
    setup({ data: { id: 'inv-1', auth_user_id: 'auth-1' } })
    getUserById.mockResolvedValue({
      data: { user: { email: 'ana@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' } },
      error: null,
    })
    expect((await borrar()).status).toBe(200)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
