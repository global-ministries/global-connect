import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { NinosAccesoProvider } from '@/hooks/useNinosAcceso'
import { UnoAUnoAccesoProvider } from '@/hooks/useUnoAUnoAcceso'
import { logout } from '@/lib/actions/auth.actions'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * The phone "Más" sheet (odd/tasks/sistema-diseno-v2.md, S9.6 and S9.8): the
 * tab bar's "Más" button opens a bottom sheet with the account, the campus
 * selector, every visible section the tabs do not open (without submenus),
 * a block per group with its sub-pages (S10), the footer links, the theme and
 * "Cerrar sesión" behind a confirmation.
 */

let currentPathname = '/dashboard'
let currentRoles = ['admin']
let currentPlatformSession: PlatformSession | null = null
let currentCampus: { id: string; nombre: string }[] = []
const setTheme = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null, email: 'ana@example.com' },
    roles: currentRoles,
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({
    campusActivo: currentCampus[0] ?? null,
    localidadActiva: null,
    campusDisponibles: currentCampus,
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
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }))

const sesionDreamTeam: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [{ key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }],
}

function renderBarra(ui: ReactElement = <MenuInferiorMovil />, ninos = false) {
  return render(ninos ? <NinosAccesoProvider puedeOperar puedeVerSalon puedeConfigurar>{ui}</NinosAccesoProvider> : ui)
}

function abrirMas() {
  fireEvent.click(screen.getByRole('button', { name: 'Más', hidden: true }))
  return within(screen.getByRole('dialog', { name: 'Más' }))
}

function hrefs(raiz: Pick<typeof screen, 'queryAllByRole'>) {
  return raiz.queryAllByRole('link').map((link) => link.getAttribute('href'))
}

beforeEach(() => {
  currentPathname = '/dashboard'
  currentRoles = ['admin']
  currentPlatformSession = null
  currentCampus = []
  setTheme.mockClear()
  jest.mocked(logout).mockClear()
  delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
})

describe('the "Más" button', () => {
  it('opens a dialog named "Más" and reports it with aria-haspopup and aria-expanded', () => {
    renderBarra()
    const boton = screen.getByRole('button', { name: 'Más' })
    expect(boton).toHaveAttribute('aria-haspopup', 'dialog')
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(boton)

    expect(screen.getByRole('dialog', { name: 'Más' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Más', hidden: true })).toHaveAttribute('aria-expanded', 'true')
  })

  it('is the current tab on a page only "Más" lists, and not on a tab page', () => {
    currentPathname = '/users/123'
    const { unmount } = renderBarra()
    expect(screen.getByRole('button', { name: 'Más' })).toHaveAttribute('aria-current', 'page')
    unmount()

    currentPathname = '/grupos-vida'
    renderBarra()
    expect(screen.getByRole('button', { name: 'Más' })).not.toHaveAttribute('aria-current')
  })
})

describe('the "Más" sheet', () => {
  it('starts with the account row: name, role and Mi perfil', () => {
    renderBarra()
    const hoja = abrirMas()

    const cuenta = hoja.getByRole('link', { name: /Ana Pérez/ })
    expect(cuenta).toHaveAttribute('href', '/perfil')
    expect(cuenta).toHaveTextContent('Administrador · Mi perfil')
  })

  it('shows the campus selector when there is more than one campus', () => {
    currentCampus = [{ id: 'c1', nombre: 'Barquisimeto' }, { id: 'c2', nombre: 'Cabudare' }]
    renderBarra()
    const hoja = abrirMas()

    expect(hoja.getByRole('heading', { name: 'Campus' })).toBeInTheDocument()
    expect(hoja.getByRole('combobox', { name: 'Seleccionar campus' })).toBeInTheDocument()
  })

  it('hides the campus block with a single campus', () => {
    currentCampus = [{ id: 'c1', nombre: 'Barquisimeto' }]
    renderBarra()
    const hoja = abrirMas()

    expect(hoja.queryByRole('heading', { name: 'Campus' })).not.toBeInTheDocument()
  })

  it('lists the remaining sections under their headers and the footer under Ayuda', () => {
    // An admin's tabs: Inicio, Grupos and Ayuda.
    renderBarra()
    const hoja = abrirMas()

    const administracion = within(hoja.getByRole('region', { name: 'Administración' }))
    expect(administracion.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    // Configuración has sub-pages, so it is its own block (S10), not a row here.
    expect(administracion.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument()
    const ayuda = within(hoja.getByRole('region', { name: 'Ayuda' }))
    expect(hrefs(ayuda)).toEqual(['/actualizaciones'])
  })

  it('leaves out a section with nothing left to list', () => {
    // Inicio is a tab, so "General" only appears with "Mis 1 a 1"; without it the section is left out.
    renderBarra()
    const hoja = abrirMas()
    expect(hoja.getByRole('region', { name: 'Administración' })).toBeInTheDocument()
    expect(hoja.queryByRole('region', { name: 'General' })).not.toBeInTheDocument()
  })

  it('names the general section "General" (Mis 1 a 1)', () => {
    renderBarra(
      <UnoAUnoAccesoProvider acceso={{ lidera: true, supervisa: false, participa: false }}>
        <MenuInferiorMovil />
      </UnoAUnoAccesoProvider>,
    )
    const hoja = abrirMas()

    const general = within(hoja.getByRole('region', { name: 'General' }))
    expect(general.getByRole('link', { name: 'Mis 1 a 1' })).toHaveAttribute('href', '/mis-uno-a-uno')
  })

  it('leaves out the entries the tabs already open and every submenu', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sesionDreamTeam
    renderBarra(<MenuInferiorMovil />, true)
    const hoja = abrirMas()

    const enlaces = hrefs(hoja)
    // Grupos de Vida and Configuración keep their sub-pages as blocks (S10); Niños and Dream Team are tabs.
    expect(enlaces).toEqual([
      '/perfil', '/users',
      '/grupos-vida/casas-anfitrionas', '/grupos-vida/segmentos', '/grupos-vida/directores', '/grupos-vida/temporadas',
      '/grupos-vida/mapa', '/grupos-vida/reportes/asistencia-semanal', '/grupos-vida/dashboard-riesgo',
      '/grupos-vida/solicitudes', '/grupos-vida/configuracion',
      '/configuracion',
      '/actualizaciones', '/ayuda',
    ])
    expect(enlaces).not.toContain('/grupos-vida')
    expect(enlaces.some((href) => href?.startsWith('/ninos'))).toBe(false)
    expect(enlaces.some((href) => href?.includes('dream-team'))).toBe(false)
    // Four tabs (Inicio, Grupos, Niños, Equipo) leave no slot for Ayuda, so it stays in "Más".
    expect(hoja.getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda')
  })

  it('marks the current page and gives every row a 52px target and a chevron', () => {
    currentPathname = '/users/123'
    renderBarra()
    const hoja = abrirMas()

    const usuarios = hoja.getByRole('link', { name: 'Usuarios' })
    expect(usuarios).toHaveAttribute('aria-current', 'page')
    expect(usuarios).toHaveClass('min-h-[52px]')
    expect(usuarios.querySelector('[data-slot="chevron"]')).not.toBeNull()
    expect(hoja.getByRole('link', { name: 'General' })).not.toHaveAttribute('aria-current')
  })

  it('switches the theme with the Apariencia control', () => {
    renderBarra()
    const hoja = abrirMas()

    const apariencia = within(hoja.getByRole('group', { name: 'Apariencia' }))
    expect(apariencia.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(apariencia.getByRole('button', { name: 'Oscuro' }))
    expect(setTheme).toHaveBeenCalledWith('dark')
    fireEvent.click(apariencia.getByRole('button', { name: 'Sistema' }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('asks before signing out and signs out only on confirmation', async () => {
    renderBarra()
    const hoja = abrirMas()

    fireEvent.click(hoja.getByRole('button', { name: 'Cerrar sesión' }))
    const confirmacion = within(await screen.findByRole('alertdialog', { name: '¿Cerrar sesión?' }))
    expect(confirmacion.getByText('Vas a salir de Global Connect en este dispositivo.')).toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()

    fireEvent.click(confirmacion.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(logout).not.toHaveBeenCalled()

    fireEvent.click(abrirMas().getByRole('button', { name: 'Cerrar sesión' }))
    const segunda = within(await screen.findByRole('alertdialog', { name: '¿Cerrar sesión?' }))
    fireEvent.click(segunda.getByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })
})

describe('the "Más" sub-page blocks (S10)', () => {
  it('lists the Grupos de Vida pages the role sees under a "Grupos de Vida" block, though Grupos is a tab', () => {
    currentRoles = ['director-etapa']
    renderBarra()
    const hoja = abrirMas()

    const grupos = within(hoja.getByRole('region', { name: 'Grupos de Vida' }))
    expect(hrefs(grupos)).toEqual([
      '/grupos-vida/casas-anfitrionas', '/grupos-vida/segmentos', '/grupos-vida/mapa',
      '/grupos-vida/reportes/asistencia-semanal', '/grupos-vida/dashboard-riesgo', '/grupos-vida/solicitudes',
    ])
    expect(grupos.getByRole('link', { name: 'Salud de los Grupos' })).toHaveClass('min-h-[52px]')
  })

  it('has no block for a member, who sees no sub-page', () => {
    currentRoles = ['miembro']
    renderBarra()
    const hoja = abrirMas()

    expect(hoja.queryByRole('region', { name: 'Grupos de Vida' })).not.toBeInTheDocument()
    expect(hoja.queryByRole('region', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('lists General under "Configuración" for an admin', () => {
    renderBarra()
    const hoja = abrirMas()

    const configuracion = within(hoja.getByRole('region', { name: 'Configuración' }))
    expect(configuracion.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/configuracion')
  })

  it('marks only the deepest matching row as the current page', () => {
    currentPathname = '/grupos-vida/reportes/asistencia-semanal'
    renderBarra()
    const hoja = abrirMas()

    const actuales = hoja.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(actuales.map((link) => link.getAttribute('href'))).toEqual(['/grupos-vida/reportes/asistencia-semanal'])
    // The Grupos tab holds that page, so "Más" is not the current tab.
    expect(screen.getByRole('button', { name: 'Más', hidden: true })).not.toHaveAttribute('aria-current')
  })

  it('makes "Más" the current tab on a block page whose group is not a tab', () => {
    currentPathname = '/configuracion'
    renderBarra()
    expect(screen.getByRole('button', { name: 'Más' })).toHaveAttribute('aria-current', 'page')
  })
})
