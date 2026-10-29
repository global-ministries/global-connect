import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

/** The phone "Más" sheet, which took over the drawer (odd/tasks/sistema-diseno-v2.md, S9.6). */
async function abrirMas() {
  render(<MenuInferiorMovil />)
  await userEvent.click(screen.getByRole('button', { name: 'Más' }))
  return within(screen.getByRole('dialog', { name: 'Más' }))
}

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

    expect(screen.queryByRole('link', { name: 'Cola de soporte' })).not.toBeInTheDocument()
  })

  it('shows the support admin entry in the desktop sidebar for support-capable staff', () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.view']

    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Cola de soporte' })).toHaveAttribute('href', '/ayuda/admin')
  })

  it('does not show support admin when capability-like strings are only present in roles', () => {
    currentRoles = ['admin', 'support.view']

    render(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Cola de soporte' })).not.toBeInTheDocument()
  })

  it('shows the support admin entry in the phone "Más" sheet for support-capable staff', async () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.reply']

    const hoja = await abrirMas()

    expect(hoja.getByRole('link', { name: 'Cola de soporte' })).toHaveAttribute('href', '/ayuda/admin')
  })

  it('hides the support admin entry from "Más" without a support capability', async () => {
    currentRoles = ['admin']

    const hoja = await abrirMas()

    expect(hoja.queryByRole('link', { name: 'Cola de soporte' })).not.toBeInTheDocument()
  })

  it('lists Configuración and its pages in a "Más" block for a higher role (S10)', async () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.manage']

    const hoja = await abrirMas()

    const configuracion = within(hoja.getByRole('region', { name: 'Configuración' }))
    expect(configuracion.getAllByRole('link').map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['General', '/configuracion'],
      ['Configuración de soporte', '/configuracion/soporte'],
    ])
  })

  it('leaves Configuración de soporte out of "Más" without support.manage', async () => {
    currentRoles = ['admin']
    currentSupportCapabilities = ['support.reply']

    const hoja = await abrirMas()

    expect(hoja.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/configuracion')
    expect(hoja.queryByRole('link', { name: 'Configuración de soporte' })).not.toBeInTheDocument()
  })

  it('hides the support configuration entry for pure support.manage staff without higher role context', async () => {
    currentRoles = ['miembro']
    currentSupportCapabilities = ['support.manage']

    const hoja = await abrirMas()

    expect(hoja.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument()
    expect(hoja.getByRole('link', { name: 'Cola de soporte' })).toHaveAttribute('href', '/ayuda/admin')
    expect(hoja.queryByRole('link', { name: 'Configuración de soporte' })).not.toBeInTheDocument()
  })
})
