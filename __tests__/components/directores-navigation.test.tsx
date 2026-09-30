/**
 * Navigation of the Directores page: "Directores" lives inside Grupos de Vida,
 * right after "Segmentos" (admin, pastor and director general), and
 * "Directores Generales" is gone from Configuración. Covers the desktop
 * sidebar and the phone drawer.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { HeaderMovil } from '@/components/ui/header-movil'

let currentRoles = ['admin']
let currentPathname = '/grupos-vida/directores'

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: null,
    roles: currentRoles,
    supportCapabilities: [],
    platformSession: null,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({
    campusActivo: null,
    localidadActiva: null,
    campusDisponibles: [],
    localidadesDisponibles: [],
    campusId: null,
    localidadId: null,
    esSuperadmin: false,
    loading: false,
    seleccionarCampus: jest.fn(),
    seleccionarLocalidad: jest.fn(),
  }),
}))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))

beforeEach(() => {
  currentRoles = ['admin']
  currentPathname = '/grupos-vida/directores'
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
})

/** Text of every link, in document order. */
const enlaces = (raiz: HTMLElement = document.body) => within(raiz).getAllByRole('link').map((a) => a.textContent?.trim())

describe('SidebarModerna — Directores', () => {
  it.each([['admin'], ['pastor'], ['director-general']])('shows Directores right after Segmentos for the role %s', (rol) => {
    currentRoles = [rol]
    render(<SidebarModerna />)

    const link = screen.getByRole('link', { name: 'Directores' })
    expect(link).toHaveAttribute('href', '/grupos-vida/directores')
    const textos = enlaces()
    expect(textos[textos.indexOf('Segmentos') + 1]).toBe('Directores')
  })

  it('does not show Directores to a director de etapa', () => {
    currentRoles = ['director-etapa']
    render(<SidebarModerna />)
    expect(screen.queryByRole('link', { name: 'Directores' })).not.toBeInTheDocument()
  })

  it('removes Directores Generales from Configuración', () => {
    currentPathname = '/configuracion/soporte' // expands the Configuración group
    render(<SidebarModerna />)
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Directores Generales' })).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('/configuracion/directores-generales')
  })
})

describe('HeaderMovil — Directores', () => {
  async function abrirMenu() {
    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))
  }

  it.each([['admin'], ['pastor'], ['director-general']])('shows Directores right after Segmentos for the role %s', async (rol) => {
    currentRoles = [rol]
    await abrirMenu()

    expect(screen.getByRole('link', { name: 'Directores' })).toHaveAttribute('href', '/grupos-vida/directores')
    const textos = enlaces()
    expect(textos[textos.indexOf('Segmentos') + 1]).toBe('Directores')
  })

  it('does not show Directores to a director de etapa', async () => {
    currentRoles = ['director-etapa']
    await abrirMenu()
    expect(screen.queryByRole('link', { name: 'Directores' })).not.toBeInTheDocument()
  })

  it('removes Directores Generales from Configuración', async () => {
    currentPathname = '/configuracion/soporte' // expands the Configuración group
    await abrirMenu()
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Directores Generales' })).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('/configuracion/directores-generales')
  })

  it('titles the page Directores in the phone header', () => {
    currentPathname = '/grupos-vida/directores'
    render(<HeaderMovil />)
    expect(screen.getByRole('heading', { name: 'Directores' })).toBeInTheDocument()
  })
})
