import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'

let currentRoles = ['miembro']
let currentSupportCapabilities: string[] = []

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ usuario: null, roles: currentRoles, supportCapabilities: currentSupportCapabilities, loading: false }) }))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))

describe('support navigation links', () => {
  beforeEach(() => {
    currentRoles = ['miembro']
    currentSupportCapabilities = []
  })

  it('renders the mobile bottom Ayuda item as a real /ayuda link', () => {
    render(<MenuInferiorMovil />)

    expect(screen.getByLabelText('Navegar a Ayuda')).toHaveAttribute('href', '/ayuda')
  })

  it('renders the desktop sidebar Ayuda footer item as a real /ayuda link', () => {
    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda')
  })

  it('hides the support admin entry when the user has no support capability', () => {
    render(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Soporte' })).not.toBeInTheDocument()
  })

  it('shows the support admin entry in the desktop sidebar for support-capable staff', () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.view']

    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', '/ayuda/admin')
  })

  it('does not show support admin when capability-like strings are only present in roles', () => {
    currentRoles = ['admin', 'support.view']

    render(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Soporte' })).not.toBeInTheDocument()
  })

  it('shows the support admin entry in the mobile drawer for support-capable staff', async () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.reply']

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))

    expect(screen.getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', '/ayuda/admin')
  })

  it('shows the support configuration entry only for higher-role support.manage capability holders', async () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.manage']

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))
    await userEvent.click(screen.getByRole('button', { name: /Abrir Configuración/i }))

    expect(screen.getAllByRole('link', { name: 'Soporte' }).map((link) => link.getAttribute('href'))).toContain('/configuracion/soporte')
  })

  it('hides the support configuration entry for pure support.manage staff without higher role context', async () => {
    currentRoles = ['miembro']
    currentSupportCapabilities = ['support.manage']

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))

    expect(screen.queryByRole('button', { name: /Abrir Configuración/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', '/ayuda/admin')
    expect(screen.getAllByRole('link', { name: 'Soporte' }).map((link) => link.getAttribute('href'))).not.toContain('/configuracion/soporte')
  })
})
