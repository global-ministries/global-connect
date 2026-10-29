import { fireEvent, render, screen, within } from '@testing-library/react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { UnoAUnoAccesoProvider } from '@/hooks/useUnoAUnoAcceso'
import { SIN_ACCESO_UNO_A_UNO } from '@/lib/uno-a-uno/acceso'

// T4/T7 (odd/tasks/uno-a-uno.md, S7.5) — "Mis 1 a 1" for whoever leads
// someone, supervises or takes part in a 1:1 (uno_a_uno_acceso()), fed by the
// (auth) layout through UnoAUnoAccesoProvider and composed into the menus by
// components/navegacion/use-entradas-navegacion.ts. Same harness as
// __tests__/components/navegacion/paridad-navegacion.test.tsx.

const LIDERA = { ...SIN_ACCESO_UNO_A_UNO, lidera: true }

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
      <UnoAUnoAccesoProvider acceso={LIDERA}>
        <SidebarModerna />
      </UnoAUnoAccesoProvider>,
    )
    expect(screen.getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
    const nav = screen.getByRole('navigation', { name: 'Navegación principal', hidden: true }).parentElement as HTMLElement
    expect(hrefsDe(nav).slice(0, 2)).toEqual(['/dashboard', '/mis-uno-a-uno'])
  })

  it.each(['supervisa', 'participa'] as const)('shows the entry to whoever only %s', (flag) => {
    render(
      <UnoAUnoAccesoProvider acceso={{ ...SIN_ACCESO_UNO_A_UNO, [flag]: true }}>
        <SidebarModerna />
      </UnoAUnoAccesoProvider>,
    )
    expect(screen.getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
  })

  it('hides it when the user leads no one, supervises no one and takes part in no 1:1', () => {
    render(
      <UnoAUnoAccesoProvider acceso={SIN_ACCESO_UNO_A_UNO}>
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

// The phone has no drawer since the app shell (odd/tasks/sistema-diseno-v2.md,
// S9.6): "Mis 1 a 1" is reached from the tab bar's "Más" sheet, under General.
describe('"Más" sheet "Mis 1 a 1"', () => {
  function abrirMas() {
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    return within(screen.getByRole('dialog', { name: 'Más' }))
  }

  it('lists the entry under General for whoever leads someone', () => {
    render(
      <UnoAUnoAccesoProvider acceso={LIDERA}>
        <MenuInferiorMovil />
      </UnoAUnoAccesoProvider>,
    )
    const general = within(abrirMas().getByRole('region', { name: 'General' }))
    expect(general.getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
  })

  it('leaves it out of the sheet outside the provider', () => {
    render(<MenuInferiorMovil />)
    expect(abrirMas().queryByRole('link', { name: 'Mis 1 a 1' })).not.toBeInTheDocument()
  })
})

describe('MenuInferiorMovil "Mis 1 a 1"', () => {
  it('stays out of the bottom bar, like the other server-fed sections', () => {
    render(
      <UnoAUnoAccesoProvider acceso={LIDERA}>
        <MenuInferiorMovil />
      </UnoAUnoAccesoProvider>,
    )
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })
    expect(hrefsDe(barra)).not.toContain('/mis-uno-a-uno')
  })
})
