import { render, screen } from '@testing-library/react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ usuario: null, roles: ['miembro'], loading: false }) }))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))

describe('support navigation links', () => {
  it('renders the mobile bottom Ayuda item as a real /ayuda link', () => {
    render(<MenuInferiorMovil />)

    expect(screen.getByLabelText('Navegar a Ayuda')).toHaveAttribute('href', '/ayuda')
  })

  it('renders the desktop sidebar Ayuda footer item as a real /ayuda link', () => {
    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda')
  })
})
