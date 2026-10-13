/**
 * R3b — after choosing the password, a Niños invitation lands on Mis hijos;
 * any other or hostile `next` lands on /dashboard.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'

import ResetPasswordForm from '@/app/auth/reset-password/ResetPasswordForm'

const push = jest.fn()
let parametros = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => parametros,
}))
const updateUser = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { updateUser } }) }))

beforeEach(() => {
  jest.useFakeTimers()
  push.mockReset()
  updateUser.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => jest.useRealTimers())

async function elegirContrasena() {
  render(<ResetPasswordForm />)
  fireEvent.change(screen.getByPlaceholderText('Tu nueva contraseña'), { target: { value: 'secreta1' } })
  fireEvent.change(screen.getByPlaceholderText('Confirma tu nueva contraseña'), { target: { value: 'secreta1' } })
  fireEvent.click(screen.getByRole('button', { name: /actualizar/i }))
  expect(await screen.findByText('¡Contraseña Actualizada!')).toBeInTheDocument()
  act(() => {
    jest.advanceTimersByTime(2000)
  })
}

describe('ResetPasswordForm redirect', () => {
  it('a Niños invitation lands on Mis hijos', async () => {
    parametros = new URLSearchParams({ next: '/perfil#mis-hijos' })
    await elegirContrasena()
    expect(screen.getByText('Te llevaremos a tu cuenta en unos segundos...')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/perfil#mis-hijos')
  })

  it('a hostile next lands on /dashboard', async () => {
    parametros = new URLSearchParams({ next: 'https://evil.example/perfil' })
    await elegirContrasena()
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('without next lands on /dashboard', async () => {
    parametros = new URLSearchParams()
    await elegirContrasena()
    expect(push).toHaveBeenCalledWith('/dashboard')
  })
})
