import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * Phone navigation — Dream Team (odd/tasks/sistema-diseno-v2.md, S9.6-8).
 *
 * The drawer is gone. Same rule and same flag handling as the desktop sidebar
 * (sidebar-moderna-dream-team.test.tsx): whoever sees Dream Team gets the
 * Equipo tab, which opens /dream-team (the page that lists the Dream Team
 * pages they can open, accesos-seccion.test.tsx) and stays active on every
 * Dream Team route; everyone else gets no Equipo tab. The "Más" sheet never
 * repeats Dream Team or its submenu.
 */

let currentPathname = '/dashboard'
let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null },
    roles: ['admin'],
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))
jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => false,
  getTalleresFlags: () => ({ enabled: false, stage: 'off', killSwitch: false, minAppVersion: null }),
  getTalleresStage: () => 'off',
  getTalleresStageGate: () => false,
  parseFlag: (value: string | undefined | null) => value === 'true' || value === 'on' || value === '1' || value === 'yes',
}))

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

const readCapableSession: PlatformSession = {
  ...basePlatformSession,
  capabilities: [{ key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }],
}

const sessionWithRole = (role: string): PlatformSession => ({ ...basePlatformSession, globalRoles: [role] })

function renderBarra() {
  render(<MenuInferiorMovil />)
  return within(screen.getByRole('navigation', { name: 'Navegación inferior' }))
}

function abrirMas() {
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  return within(screen.getByRole('dialog', { name: 'Más' }))
}

function hrefsMas(hoja: Pick<typeof screen, 'queryAllByRole'>) {
  return hoja.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '')
}

describe('Phone navigation Dream Team tab', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = null
    delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
  })

  it('gives a capability holder the Equipo tab, opening the Dream Team page', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const barra = renderBarra()

    const equipo = barra.getByRole('link', { name: 'Navegar a Dream Team' })
    expect(equipo).toHaveAttribute('href', '/dream-team')
    expect(equipo).toHaveTextContent(/^Equipo$/)
  })

  it.each([['director-etapa'], ['director-general']])('gives %s without capability the Equipo tab too', (role) => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole(role)

    const barra = renderBarra()

    expect(barra.getByRole('link', { name: 'Navegar a Dream Team' })).toHaveAttribute('href', '/dream-team')
  })

  it.each([['lider'], ['miembro'], ['admin']])('gives a plain %s no Equipo tab and no Dream Team in "Más"', (role) => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole(role)

    const barra = renderBarra()
    expect(barra.queryByRole('link', { name: 'Navegar a Dream Team' })).not.toBeInTheDocument()
    expect(hrefsMas(abrirMas()).some((href) => href.includes('dream-team'))).toBe(false)
  })

  it('gives nobody the tab without a platform session', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'

    const barra = renderBarra()

    expect(barra.queryByRole('link', { name: 'Navegar a Dream Team' })).not.toBeInTheDocument()
  })

  it('hides the tab from everybody when the flag is off', () => {
    for (const session of [readCapableSession, sessionWithRole('director-etapa')]) {
      currentPlatformSession = session
      const { unmount } = render(<MenuInferiorMovil />)
      expect(screen.queryByRole('link', { name: 'Navegar a Dream Team' })).not.toBeInTheDocument()
      expect(hrefsMas(abrirMas()).some((href) => href.includes('dream-team'))).toBe(false)
      unmount()
    }
  })

  it('places Equipo right after Grupos, like Dream Team after Grupos de Vida in the sidebar', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const barra = renderBarra()
    const nombres = barra.getAllByRole('link').map((link) => link.getAttribute('aria-label'))

    expect(nombres.indexOf('Navegar a Dream Team')).toBe(nombres.indexOf('Navegar a Grupos de Vida') + 1)
  })

  it('does not repeat Dream Team or its submenu in "Más"', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    renderBarra()
    const hoja = abrirMas()

    expect(hrefsMas(hoja).some((href) => href.includes('dream-team'))).toBe(false)
    expect(hoja.queryByRole('button', { name: /Dream Team/ })).not.toBeInTheDocument()
  })

  it.each([['/dream-team'], ['/dream-team/mi-equipo'], ['/admin/dream-team/servidores'], ['/admin/dream-team/estructura']])(
    'marks Equipo as the current tab on %s',
    (pathname) => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      currentPlatformSession = readCapableSession
      currentPathname = pathname

      const barra = renderBarra()

      expect(barra.getByRole('link', { name: 'Navegar a Dream Team' })).toHaveAttribute('aria-current', 'page')
      expect(barra.getByRole('link', { name: 'Navegar a Inicio' })).not.toHaveAttribute('aria-current')
      expect(screen.getByRole('button', { name: 'Más' })).not.toHaveAttribute('aria-current')
    },
  )

  it('marks Equipo on Mi equipo for a director too', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole('director-etapa')
    currentPathname = '/dream-team/mi-equipo'

    const barra = renderBarra()

    expect(barra.getByRole('link', { name: 'Navegar a Dream Team' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not touch the other tabs and footer links', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const barra = renderBarra()

    expect(barra.getByRole('link', { name: 'Navegar a Inicio' })).toHaveAttribute('href', '/dashboard')
    expect(barra.getByRole('link', { name: 'Navegar a Grupos de Vida' })).toHaveAttribute('href', '/grupos-vida')
    expect(abrirMas().getByRole('link', { name: 'Actualizaciones' })).toHaveAttribute('href', '/actualizaciones')
  })
})

describe('HeaderMovil without the drawer', () => {
  it('has no menu button and no navigation drawer, and keeps the bell', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession
    currentPathname = '/admin/dream-team/servidores'

    render(<HeaderMovil />)

    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Menú de navegación')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toHaveAttribute('aria-haspopup', 'dialog')
  })
})

describe('HeaderMovil page title on the Dream Team routes', () => {
  beforeEach(() => {
    currentPlatformSession = readCapableSession
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
  })

  it.each([
    ['/dream-team', 'Dream Team'],
    ['/dream-team/mi-equipo', 'Mi equipo'],
    ['/admin/dream-team/servidores', 'Servidores'],
    ['/admin/dream-team/estructura', 'Estructura'],
  ])('titles %s as %s', (pathname, title) => {
    currentPathname = pathname

    render(<HeaderMovil />)

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('titles Mi equipo for a director too', () => {
    currentPlatformSession = sessionWithRole('director-general')
    currentPathname = '/dream-team/mi-equipo'

    render(<HeaderMovil />)

    expect(screen.getByRole('heading', { level: 1, name: 'Mi equipo' })).toBeInTheDocument()
  })
})
