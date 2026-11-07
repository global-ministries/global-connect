/**
 * "Planificar temporada" (T9a of odd/tasks/planner-gdv.md; S10, S12, S18):
 * inside Grupos de Vida, right after "Temporadas" for admin, pastor and
 * director general, and among the Grupos de Vida pages for a director de
 * etapa (who has no "Temporadas"); never for a líder or a miembro. Covers the
 * desktop sidebar, the phone "Más" sheet and the phone header title.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'

let currentRoles = ['admin']
let currentPathname = '/grupos-vida/planificar'

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
  currentPathname = '/grupos-vida/planificar'
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
})

const textos = (raiz: HTMLElement = document.body) => within(raiz).getAllByRole('link').map((a) => a.textContent?.trim())

describe('SidebarModerna — Planificar temporada', () => {
  it.each([['admin'], ['pastor'], ['director-general']])('shows it right after Temporadas for the role %s', (rol) => {
    currentRoles = [rol]
    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Planificar temporada' })).toHaveAttribute('href', '/grupos-vida/planificar')
    const lista = textos()
    expect(lista[lista.indexOf('Temporadas') + 1]).toBe('Planificar temporada')
  })

  it('shows it to a director de etapa, after Segmentos (no Temporadas for that role)', () => {
    currentRoles = ['director-etapa']
    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Planificar temporada' })).toHaveAttribute('href', '/grupos-vida/planificar')
    expect(screen.queryByRole('link', { name: 'Temporadas' })).not.toBeInTheDocument()
    const lista = textos()
    expect(lista[lista.indexOf('Segmentos') + 1]).toBe('Planificar temporada')
  })

  it.each([['lider'], ['miembro']])('hides it from the role %s', (rol) => {
    currentRoles = [rol]
    render(<SidebarModerna />)
    expect(screen.queryByRole('link', { name: 'Planificar temporada' })).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('/grupos-vida/planificar')
  })
})

describe('phone menus — Planificar temporada', () => {
  async function abrirMas() {
    render(<MenuInferiorMovil />)
    await userEvent.click(screen.getByRole('button', { name: 'Más' }))
    return within(screen.getByRole('dialog', { name: 'Más' }))
  }

  it.each([['admin'], ['pastor'], ['director-general'], ['director-etapa']])('lists it in the Grupos de Vida block for the role %s', async (rol) => {
    currentRoles = [rol]
    const hoja = await abrirMas()

    const grupos = within(hoja.getByRole('region', { name: 'Grupos de Vida' }))
    expect(grupos.getByRole('link', { name: 'Planificar temporada' })).toHaveAttribute('href', '/grupos-vida/planificar')
  })

  it.each([['lider'], ['miembro']])('does not list it for the role %s', async (rol) => {
    currentRoles = [rol]
    const hoja = await abrirMas()
    expect(hoja.queryByRole('link', { name: 'Planificar temporada' })).not.toBeInTheDocument()
  })

  it.each([
    ['/grupos-vida/planificar', 'Planificar temporada'],
    ['/grupos-vida/planificar/nueva', 'Nueva temporada'],
    ['/grupos-vida/planificar/publicar', 'Publicar temporada'],
    ['/grupos-vida/planificar/diagnostico', 'Diagnóstico de cierre'],
  ])('titles %s "%s" in the phone header, not "Detalle del Grupo"', (ruta, titulo) => {
    currentPathname = ruta
    render(<HeaderMovil />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(titulo)
  })
})
