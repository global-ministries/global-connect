import { signup } from '@/lib/actions/auth.actions'

const signUp = jest.fn()
const createSupabaseAdminClient = jest.fn()
const vincularFichaConfirmada = jest.fn()

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
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
})
