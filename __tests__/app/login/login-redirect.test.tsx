/**
 * Login page (/): it passes the ?redirect= of the address bar to the sign-in action (R2c).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import PaginaLogin from '@/app/page'

const login = jest.fn()

jest.mock('@/lib/actions/auth.actions', () => ({ login: (fd: FormData) => login(fd) }))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  }),
}))

describe('login page', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('forwards the redirect of the address bar to the sign-in action', async () => {
    login.mockResolvedValue({ error: 'x' })
    window.history.replaceState(null, '', '/?redirect=%2Fperfil')
    const { container } = render(<PaginaLogin />)

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'persona@example.com' } })
    fireEvent.change(container.querySelector('input[name="password"]') as HTMLInputElement, { target: { value: 'secreto123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(login).toHaveBeenCalled())
    expect((login.mock.calls[0][0] as FormData).get('redirect')).toBe('/perfil')
  })
})
