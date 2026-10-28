import { fireEvent, render, screen, within } from '@testing-library/react'

import userEvent from '@testing-library/user-event'

import { MenuCuenta } from '@/components/navegacion/menu-cuenta'
import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'

/**
 * Navigation surfaces on the design-system foundation: 44px targets, the
 * active sidebar entry on bg-brand-tint, the active tab on text-brand-text
 * with no fill, labelled icon-only buttons, a labelled collapsed sidebar and
 * the bottom bar's safe area.
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
  it('marks the current child with the brand tint and its group as holding it', () => {
    render(<SidebarModerna />)
    const nav = screen.getByRole('navigation', { name: 'Navegación principal', hidden: true })

    // App shell (S9): the current page is bg-brand-tint on foreground text; submenu
    // rows are 36px on a fine pointer and 44px on touch.
    const mapa = within(nav).getByRole('link', { name: 'Mapa', hidden: true })
    expect(mapa).toHaveAttribute('aria-current', 'page')
    expect(mapa).toHaveClass('bg-brand-tint', 'text-foreground', 'min-h-9', 'pointer-coarse:min-h-11')
    const grupos = within(nav).getByRole('link', { name: 'Grupos de Vida', hidden: true })
    expect(grupos).toHaveClass('text-foreground', 'min-h-11')
    expect(grupos).not.toHaveAttribute('aria-current')
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

    fireEvent.focus(usuarios)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Usuarios')
    fireEvent.blur(usuarios)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps Mi perfil one keyboard step away, in the account menu', async () => {
    // Mi perfil left the sidebar for the account menu of the header (S9.4).
    const usuario = userEvent.setup()
    render(<MenuCuenta />)

    screen.getByRole('button', { name: 'Tu cuenta: Ana Pérez' }).focus()
    await usuario.keyboard('{Enter}')

    const menu = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(within(menu).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil')
    expect(within(menu).getByRole('link', { name: 'Mi perfil' })).toHaveClass('min-h-11')
  })
})

// Since the app shell (odd/tasks/sistema-diseno-v2.md, S9.6) the phone has no
// hamburger or drawer: the top bar holds the title and the bell, and the tab
// bar's "Más" sheet holds the rest of the navigation.
describe('mobile top bar and "Más" sheet', () => {
  it('names the bell and the "Más" button and gives them a 44px or taller target', () => {
    render(<HeaderMovil />)
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toHaveClass('size-11')
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument()

    render(<MenuInferiorMovil />)
    const mas = screen.getByRole('button', { name: 'Más' })
    expect(mas).toHaveClass('min-h-14', 'focus-ring')
    fireEvent.click(mas)
    expect(screen.getByRole('dialog', { name: 'Más' })).toBeInTheDocument()
  })

  it('highlights the current tab and the current sub-page in the "Más" sheet', () => {
    render(<MenuInferiorMovil />)
    expect(screen.getByLabelText('Navegar a Grupos de Vida')).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    const hoja = within(screen.getByRole('dialog', { name: 'Más' }))
    const mapa = hoja.getByRole('link', { name: 'Mapa' })
    expect(mapa).toHaveAttribute('aria-current', 'page')
    expect(mapa).toHaveClass('min-h-[52px]', 'aria-[current=page]:font-semibold')
    expect(hoja.getByRole('link', { name: 'Segmentos' })).not.toHaveAttribute('aria-current')
  })

  it('titles the Salud de los Grupos page like its menu entry', () => {
    currentPathname = '/grupos-vida/dashboard-riesgo'
    render(<HeaderMovil />)

    expect(screen.getByRole('heading', { level: 1, name: 'Salud de los Grupos' })).toBeInTheDocument()
  })
})

describe('mobile bottom bar', () => {
  it('marks the current tab with brand text and no fill, and keeps clear of the safe area', () => {
    // Usuarios left the tab bar for "Más" (odd/tasks/sistema-diseno-v2.md, S9.7); a group page marks Grupos.
    currentPathname = '/grupos-vida/123'
    render(<MenuInferiorMovil />)
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })

    const grupos = within(barra).getByLabelText('Navegar a Grupos de Vida')
    expect(grupos).toHaveAttribute('aria-current', 'page')
    expect(grupos).toHaveClass('text-brand-text', 'min-h-14', 'min-w-0')
    expect(grupos).not.toHaveClass('bg-brand-tint')
    expect(within(barra).getByLabelText('Navegar a Inicio')).not.toHaveAttribute('aria-current')
    expect(within(barra).getByRole('list')).toHaveClass('safe-area-pb', 'safe-area-pl', 'safe-area-pr')
  })

  it('does not mark /dashboard active on other routes', () => {
    currentPathname = '/dashboard-otra'
    render(<MenuInferiorMovil />)

    expect(screen.getByLabelText('Navegar a Inicio')).not.toHaveAttribute('aria-current')
  })
})
