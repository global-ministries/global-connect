import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'

/**
 * Navigation surfaces on the design-system foundation: 44px targets, the
 * active entry on bg-brand-tint / text-brand-text, labelled icon-only
 * buttons, a labelled collapsed sidebar and the bottom bar's safe area.
 */

let currentPathname = '/grupos-vida/mapa'

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null },
    roles: ['admin'],
    supportCapabilities: [],
    platformSession: null,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))

beforeEach(() => {
  currentPathname = '/grupos-vida/mapa'
  window.localStorage.clear()
})

describe('desktop sidebar', () => {
  it('marks the current child and its section with the brand tint', () => {
    render(<SidebarModerna />)
    const nav = screen.getByRole('navigation', { name: 'Navegación principal', hidden: true })

    const mapa = within(nav).getByRole('link', { name: 'Mapa', hidden: true })
    expect(mapa).toHaveAttribute('aria-current', 'page')
    expect(mapa).toHaveClass('bg-brand-tint', 'text-brand-text', 'min-h-11')
    expect(within(nav).getByRole('link', { name: 'Grupos de Vida', hidden: true })).toHaveClass('bg-brand-tint')
    expect(within(nav).getByRole('link', { name: 'Usuarios', hidden: true })).not.toHaveClass('bg-brand-tint')
  })

  it('gives the icon-only buttons a name and a 44px target', () => {
    render(<SidebarModerna />)

    const contraer = screen.getByRole('button', { name: 'Contraer menú', hidden: true })
    expect(contraer).toHaveClass('size-11', 'focus-ring')
    const submenu = screen.getByRole('button', { name: 'Cerrar submenú de Grupos de Vida', hidden: true })
    expect(submenu).toHaveAttribute('aria-expanded', 'true')
    expect(submenu).toHaveClass('size-11')
  })

  it('keeps every entry named when collapsed and shows its tooltip on keyboard focus', () => {
    window.localStorage.setItem('sidebar-collapsed', 'true')
    render(<SidebarModerna />)

    const usuarios = screen.getByRole('link', { name: 'Usuarios', hidden: true })
    expect(usuarios).toHaveAttribute('aria-label', 'Usuarios')
    expect(screen.getByRole('link', { name: 'Ayuda', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi Perfil', hidden: true })).toBeInTheDocument()

    fireEvent.focus(usuarios)
    expect(screen.getByText('Usuarios', { selector: 'div' })).toBeInTheDocument()
    fireEvent.blur(usuarios)
    expect(screen.queryByText('Usuarios', { selector: 'div' })).not.toBeInTheDocument()
  })
})

describe('mobile top bar and drawer', () => {
  it('labels every icon-only button and gives it a 44px target', () => {
    render(<HeaderMovil />)

    for (const nombre of ['Abrir menú', 'Notificaciones', 'Menú de usuario']) {
      expect(screen.getByRole('button', { name: nombre })).toHaveClass('size-11')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Menú de navegación' }))
    expect(drawer.getByRole('button', { name: 'Cerrar menú' })).toHaveClass('size-11')
    expect(drawer.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  it('highlights the open section and the current child', () => {
    render(<HeaderMovil />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Menú de navegación' }))

    expect(drawer.getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page')
    expect(drawer.getByRole('link', { name: 'Mapa' })).toHaveClass('bg-brand-tint', 'text-brand-text', 'min-h-11')
    expect(drawer.getByRole('link', { name: 'Grupos de Vida' })).toHaveClass('bg-brand-tint')
    expect(drawer.getByRole('button', { name: 'Cerrar Grupos de Vida' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('titles the Salud de los Grupos page like its menu entry', () => {
    currentPathname = '/grupos-vida/dashboard-riesgo'
    render(<HeaderMovil />)

    expect(screen.getByRole('heading', { level: 1, name: 'Salud de los Grupos' })).toBeInTheDocument()
  })
})

describe('mobile bottom bar', () => {
  it('marks the current entry with the brand tint and keeps clear of the safe area', () => {
    currentPathname = '/users/123'
    render(<MenuInferiorMovil />)
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })

    const usuarios = within(barra).getByLabelText('Navegar a Usuarios')
    expect(usuarios).toHaveAttribute('aria-current', 'page')
    expect(usuarios).toHaveClass('bg-brand-tint', 'text-brand-text', 'min-h-14', 'min-w-0')
    expect(within(barra).getByLabelText('Navegar a Dashboard')).not.toHaveAttribute('aria-current')
    expect(within(barra).getByRole('list')).toHaveClass('safe-area-pb', 'safe-area-pl', 'safe-area-pr')
  })

  it('does not mark /dashboard active on other routes', () => {
    currentPathname = '/dashboard-otra'
    render(<MenuInferiorMovil />)

    expect(screen.getByLabelText('Navegar a Dashboard')).not.toHaveAttribute('aria-current')
  })
})
