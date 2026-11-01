/**
 * PRESERVE for Editar persona (S14): lib/actions/auth.actions.ts calls
 * `supabase.auth.updateUser` (Supabase Auth, the password) in updatePassword,
 * not the updateUser server action of lib/actions/user.actions.ts. Its result
 * shape, read by app/update-password/page.tsx (`response?.error`), stays the
 * same.
 */
import { redirect } from 'next/navigation'

import { updatePassword } from '@/lib/actions/auth.actions'

const authUpdateUser = jest.fn()

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { updateUser: (...args: unknown[]) => authUpdateUser(...args) } }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/vincular-ficha', () => ({ vincularFichaConfirmada: jest.fn() }))
jest.mock('@/lib/actions/user.actions', () => {
  throw new Error('auth.actions must not depend on user.actions')
})

beforeEach(() => {
  authUpdateUser.mockReset()
  jest.mocked(redirect).mockReset()
})

describe('updatePassword (auth.updateUser), unchanged by the profile updateUser', () => {
  it('sends only the new password to Supabase Auth and goes to the dashboard', async () => {
    authUpdateUser.mockResolvedValue({ error: null })

    const respuesta = await updatePassword('nueva-clave-123')

    expect(authUpdateUser).toHaveBeenCalledWith({ password: 'nueva-clave-123' })
    expect(redirect).toHaveBeenCalledWith('/dashboard')
    expect(respuesta).toBeUndefined()
  })

  it('returns { error } when Supabase Auth fails, without redirecting', async () => {
    authUpdateUser.mockResolvedValue({ error: { message: 'weak password' } })

    const respuesta = await updatePassword('x')

    expect(respuesta).toEqual({ error: 'No se pudo actualizar la contraseña. Inténtalo de nuevo.' })
    expect(redirect).not.toHaveBeenCalled()
  })
})
