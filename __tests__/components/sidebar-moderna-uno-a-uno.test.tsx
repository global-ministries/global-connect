import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { UnoAUnoAccesoProvider } from '@/hooks/useUnoAUnoAcceso'

// T4 (odd/tasks/uno-a-uno.md) — "Mis 1 a 1" only for whoever leads someone
// (mis_dirigidos() has a row), fed by the (auth) layout through
// UnoAUnoAccesoProvider and composed into the menus by
// components/navegacion/use-entradas-navegacion.ts. Same harness as
// __tests__/components/navegacion/paridad-navegacion.test.tsx.

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null, email: 'ana@example.com' },
    roles: ['miembro'],
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

function hrefsDe(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map((link) => link.getAttribute('href') ?? '')
}

describe('SidebarModerna "Mis 1 a 1"', () => {
  it('shows the entry right after Dashboard to whoever leads someone', () => {
    render(
      <UnoAUnoAccesoProvider lideraAAlguien>
        <SidebarModerna />
      </UnoAUnoAccesoProvider>,
    )
    expect(screen.getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
    const nav = screen.getByRole('navigation', { name: 'Navegación principal', hidden: true }).parentElement as HTMLElement
    expect(hrefsDe(nav).slice(0, 2)).toEqual(['/dashboard', '/mis-uno-a-uno'])
  })

  it('hides it when the user leads no one', () => {
    render(
      <UnoAUnoAccesoProvider lideraAAlguien={false}>
        <SidebarModerna />
      </UnoAUnoAccesoProvider>,
    )
    expect(screen.queryByRole('link', { name: 'Mis 1 a 1' })).not.toBeInTheDocument()
  })

  it('hides it outside the provider (fails closed)', () => {
    render(<SidebarModerna />)
    expect(screen.queryByRole('link', { name: 'Mis 1 a 1' })).not.toBeInTheDocument()
  })
})

describe('HeaderMovil "Mis 1 a 1"', () => {
  function abrirMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    return within(screen.getByRole('dialog', { name: 'Menú de navegación' }))
  }

  it('lists the entry in the drawer for whoever leads someone', () => {
    render(
      <UnoAUnoAccesoProvider lideraAAlguien>
        <HeaderMovil />
      </UnoAUnoAccesoProvider>,
    )
    expect(abrirMenu().getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
  })

  it('leaves it out of the drawer outside the provider', () => {
    render(<HeaderMovil />)
    expect(abrirMenu().queryByRole('link', { name: 'Mis 1 a 1' })).not.toBeInTheDocument()
  })
})

describe('MenuInferiorMovil "Mis 1 a 1"', () => {
  it('stays out of the bottom bar, like the other server-fed sections', () => {
    render(
      <UnoAUnoAccesoProvider lideraAAlguien>
        <MenuInferiorMovil />
      </UnoAUnoAccesoProvider>,
    )
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })
    expect(hrefsDe(barra)).not.toContain('/mis-uno-a-uno')
  })
})
