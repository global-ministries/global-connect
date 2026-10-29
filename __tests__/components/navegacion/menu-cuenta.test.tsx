import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { formatearRol, MenuCuenta } from '@/components/navegacion/menu-cuenta'

/**
 * The account menu (odd/tasks/sistema-diseno-v2.md, S9.4): identity, the one
 * theme control, Mi Perfil and Cerrar sesión, which always asks first.
 */

const setTheme = jest.fn()
let temaActual = 'light'
const logout = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Marcos', apellido: 'Rivas', foto_perfil_url: null, email: 'marcos@example.com' },
    roles: ['admin'],
    supportCapabilities: [],
    platformSession: null,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: () => logout() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: temaActual, setTheme }) }))

beforeEach(() => {
  setTheme.mockReset()
  logout.mockReset()
  temaActual = 'light'
})

function abrirMenu() {
  render(<MenuCuenta />)
  const avatar = screen.getByRole('button', { name: 'Tu cuenta: Marcos Rivas' })
  fireEvent.click(avatar)
  return { avatar, menu: screen.getByRole('dialog', { name: 'Marcos Rivas' }) }
}

describe('MenuCuenta', () => {
  it('is a 44px avatar button that announces its menu', () => {
    render(<MenuCuenta />)
    const avatar = screen.getByRole('button', { name: 'Tu cuenta: Marcos Rivas' })

    expect(avatar).toHaveClass('size-11', 'focus-ring')
    expect(avatar).toHaveAttribute('aria-haspopup', 'dialog')
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the name, role and email', () => {
    const { avatar, menu } = abrirMenu()

    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu).getByText('Administrador')).toBeInTheDocument()
    expect(within(menu).getByText('marcos@example.com')).toBeInTheDocument()
  })

  it('holds the theme as Sistema | Claro | Oscuro', () => {
    const { menu } = abrirMenu()

    const tema = within(menu).getByRole('group', { name: 'Tema' })
    expect(within(tema).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sistema', 'Claro', 'Oscuro'])
    expect(within(tema).getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true')
    // Focus lands on the first control of the menu.
    expect(within(tema).getByRole('button', { name: 'Sistema' })).toHaveFocus()

    fireEvent.click(within(tema).getByRole('button', { name: 'Oscuro' }))
    expect(setTheme).toHaveBeenCalledWith('dark')
    fireEvent.click(within(tema).getByRole('button', { name: 'Sistema' }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('marks Sistema when the theme follows the device', () => {
    temaActual = 'system'
    const { menu } = abrirMenu()
    expect(within(menu).getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('links Mi perfil from the registry', () => {
    const { menu } = abrirMenu()
    expect(within(menu).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil')
  })

  it('asks before signing out; Cancelar keeps the session and returns focus to the avatar', async () => {
    const { avatar, menu } = abrirMenu()

    fireEvent.click(within(menu).getByRole('button', { name: 'Cerrar sesión' }))

    expect(screen.queryByRole('dialog', { name: 'Marcos Rivas' })).not.toBeInTheDocument()
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Cerrar sesión?' })
    expect(confirmacion).toHaveAccessibleDescription('Vas a salir de Global Connect en este dispositivo.')
    expect(logout).not.toHaveBeenCalled()

    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(logout).not.toHaveBeenCalled()
    expect(avatar).toHaveFocus()
  })

  it('signs out once confirmed', async () => {
    logout.mockResolvedValue(undefined)
    const { menu } = abrirMenu()
    fireEvent.click(within(menu).getByRole('button', { name: 'Cerrar sesión' }))

    const confirmacion = screen.getByRole('alertdialog', { name: '¿Cerrar sesión?' })
    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Cerrar sesión' }))

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })
})

describe('formatearRol', () => {
  it('names the first role', () => {
    expect(formatearRol(['admin'])).toBe('Administrador')
    expect(formatearRol(['director-etapa'])).toBe('Director de etapa')
    expect(formatearRol(['otro-rol'])).toBe('Otro-rol')
    expect(formatearRol([])).toBe('Usuario')
  })
})
