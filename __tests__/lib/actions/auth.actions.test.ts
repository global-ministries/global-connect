import { signup, listarVinculosPendientes, resolverVinculoPendiente } from '@/lib/actions/auth.actions'

const signUp = jest.fn()
const rpc = jest.fn()
const createSupabaseAdminClient = jest.fn()
const vincularFichaConfirmada = jest.fn()

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signUp: (...args: unknown[]) => signUp(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/supabase/vincular-ficha', () => ({
  vincularFichaConfirmada: (...args: unknown[]) => vincularFichaConfirmada(...args),
}))

function formulario(cedula: string) {
  const fd = new FormData()
  fd.append('nombre', 'Beatriz')
  fd.append('apellido', 'Paz')
  fd.append('email', 'bea@example.com')
  fd.append('password', 'secreto123')
  fd.append('cedula', cedula)
  return fd
}

describe('signup: the ficha is linked only after the email is confirmed', () => {
  beforeEach(() => {
    signUp.mockReset()
    createSupabaseAdminClient.mockReset()
    vincularFichaConfirmada.mockReset()
    createSupabaseAdminClient.mockReturnValue({ admin: true })
  })

  it('does not touch usuarios before confirmation and asks to check the inbox', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'auth-1', email_confirmed_at: null } }, error: null })

    const res = await signup(formulario('V-22.328.215'))

    expect(res).toEqual({
      success: true,
      message: '¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.',
    })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
  })

  it('carries the form data, with the normalized cedula, in user_metadata', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'auth-1', email_confirmed_at: null } }, error: null })

    await signup(formulario('V-22.328.215'))

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bea@example.com',
        options: expect.objectContaining({
          data: { nombre: 'Beatriz', apellido: 'Paz', cedula: '22328215' },
          emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
        }),
      }),
    )
  })

  it('stores a blank cedula as null in user_metadata', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'auth-1', email_confirmed_at: null } }, error: null })

    await signup(formulario('   '))

    expect(signUp.mock.calls[0][0].options.data.cedula).toBeNull()
  })

  it('links right away only when the project auto-confirms the email', async () => {
    const user = { id: 'auth-1', email_confirmed_at: '2026-10-04T00:00:00Z' }
    signUp.mockResolvedValue({ data: { user }, error: null })
    vincularFichaConfirmada.mockResolvedValue({ estado: 'vinculada' })

    const res = await signup(formulario('22328215'))

    expect(vincularFichaConfirmada).toHaveBeenCalledWith({ admin: true }, user)
    expect(res.success).toBe(true)
  })

  it('reports an error when the auth signup fails', async () => {
    signUp.mockResolvedValue({ data: null, error: { status: 400 } })

    const res = await signup(formulario('22328215'))

    expect(res).toEqual({ success: false, message: 'Este correo electrónico ya está registrado.' })
  })

  it('tells the person a director must approve when the link is pending', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'auth-1', email_confirmed_at: '2026-10-04T00:00:00Z' } },
      error: null,
    })
    vincularFichaConfirmada.mockResolvedValue({ estado: 'pendiente_aprobacion' })

    const res = await signup(formulario('22328215'))

    expect(res).toEqual({
      success: true,
      message: 'Tu cuenta está pendiente de aprobación por tu director',
    })
  })
})

describe('pending links by cedula', () => {
  beforeEach(() => rpc.mockReset())

  it('lists through the session rpc', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    await expect(listarVinculosPendientes()).resolves.toEqual({ ok: true, solicitudes: [{ id: 'v1' }] })
    expect(rpc).toHaveBeenCalledWith('vinculos_pendientes_listar')
  })

  it('returns an empty list with a neutral failure when the rpc fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await expect(listarVinculosPendientes()).resolves.toEqual({ ok: false, solicitudes: [] })
  })

  it('resolves through the session rpc', async () => {
    rpc.mockResolvedValue({ data: { ok: true, estado: 'aprobado' }, error: null })
    await expect(resolverVinculoPendiente('v1', true)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('vinculo_pendiente_resolver', { p_id: 'v1', p_aprobar: true })
  })

  it('explains a request that can no longer be approved', async () => {
    rpc.mockResolvedValue({ data: { ok: false, codigo: 'FICHA_YA_VINCULADA' }, error: null })
    const res = await resolverVinculoPendiente('v1', true)
    expect(res).toEqual({ ok: false, message: 'Esa ficha ya tiene una cuenta. La solicitud quedó rechazada.' })
  })
})
