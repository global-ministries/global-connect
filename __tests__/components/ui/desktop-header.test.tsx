import { fireEvent, render, screen, within } from '@testing-library/react'

import { DesktopHeader } from '@/components/ui/desktop-header'

/**
 * The desktop header of the app shell (odd/tasks/sistema-diseno-v2.md, S9;
 * prototype design/app-shell): 64px, no glass shadow, breadcrumbs or title,
 * the primary action, the bell always visible and one account menu with the
 * theme. No duplicated theme toggle or Ayuda icon.
 */

jest.mock('next/navigation', () => ({
  usePathname: () => '/grupos-vida/temporadas/nueva',
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null, email: 'ana@example.com' },
    roles: ['lider'],
    supportCapabilities: [],
    platformSession: null,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme: jest.fn() }) }))

function cabecera(container: HTMLElement) {
  return container.querySelector('[data-slot="desktop-header"]') as HTMLElement
}

describe('DesktopHeader', () => {
  it('is a 64px sticky bar on the page surface, without the glass shadow', () => {
    const { container } = render(<DesktopHeader titulo="Temporadas" />)
    const header = cabecera(container)

    expect(header).toHaveClass('sticky', 'top-0', 'min-h-16', 'hidden', 'md:flex', 'border-b')
    expect(header.className).not.toMatch(/glass|shadow/)
  })

  it('titles the page with its h1', () => {
    render(<DesktopHeader titulo="Temporadas" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Temporadas' })).toBeVisible()
  })

  it('shows the breadcrumbs and keeps the title as the h1 for assistive tech', () => {
    render(
      <DesktopHeader
        titulo="Servidores"
        breadcrumbs={<nav aria-label="Migas de pan"><a href="/admin/dream-team">Dream Team</a></nav>}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Migas de pan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Servidores' })).toHaveClass('sr-only')
  })

  it('names the back link after where it goes', () => {
    render(<DesktopHeader titulo="Nueva temporada" botonRegreso={{ href: '/grupos-vida/temporadas', texto: 'Temporadas' }} />)

    const volver = screen.getByRole('link', { name: 'Volver a Temporadas' })
    expect(volver).toHaveAttribute('href', '/grupos-vida/temporadas')
    expect(volver).toHaveClass('size-11')
  })

  it('renders the primary action', () => {
    render(<DesktopHeader titulo="Servidores" accionPrincipal={<button type="button">Asignar servicio</button>} />)
    expect(screen.getByRole('button', { name: 'Asignar servicio' })).toBeInTheDocument()
  })

  it('always shows the notifications bell, with its empty state', () => {
    render(<DesktopHeader />)

    const campana = screen.getByRole('button', { name: 'Notificaciones' })
    expect(campana).toHaveClass('size-11')
    fireEvent.click(campana)
    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toHaveTextContent('No tenés notificaciones')
  })

  it('has one theme control, in the account menu, and no Ayuda icon', () => {
    render(<DesktopHeader titulo="Temporadas" />)

    expect(screen.queryByRole('button', { name: /Cambiar a modo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ayuda' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tu cuenta: Ana Pérez' }))
    const menu = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(within(menu).getByText('Líder')).toBeInTheDocument()
    expect(within(menu).getByText('ana@example.com')).toBeInTheDocument()
    expect(within(menu).getByRole('group', { name: 'Tema' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(menu).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil')

    fireEvent.click(within(menu).getByRole('button', { name: 'Cerrar sesión' }))
    expect(screen.getByRole('alertdialog', { name: '¿Cerrar sesión?' })).toBeInTheDocument()
  })
})
