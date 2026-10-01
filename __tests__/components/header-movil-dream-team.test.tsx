import { fireEvent, render, screen, within } from '@testing-library/react'

import { HeaderMovil } from '@/components/ui/header-movil'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * Mobile drawer — Dream Team section.
 *
 * Same entries, same rule and same flag handling as the desktop sidebar
 * (sidebar-moderna-dream-team.test.tsx): a capability holder sees Mi equipo,
 * Servidores and Estructura; a Grupos de Vida director (system role, no
 * capability) sees Mi equipo alone; everyone else sees no Dream Team section;
 * the flag off hides it for everybody. The drawer is aria-hidden until opened,
 * so every test opens it first.
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

function renderOpenDrawer() {
  render(<HeaderMovil />)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
  return within(screen.getByRole('dialog', { name: 'Menú de navegación' }))
}

describe('HeaderMovil Dream Team section', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = null
    delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
  })

  it('shows a capability holder Dream Team with Mi equipo, Servidores and Estructura', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const drawer = renderOpenDrawer()

    expect(drawer.getByRole('link', { name: 'Dream Team' })).toHaveAttribute('href', '/dream-team/mi-equipo')
    expect(drawer.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo')
    expect(drawer.getByRole('link', { name: 'Servidores' })).toHaveAttribute('href', '/admin/dream-team/servidores')
    expect(drawer.getByRole('link', { name: 'Estructura' })).toHaveAttribute('href', '/admin/dream-team/estructura')
  })

  it.each([['director-etapa'], ['director-general']])('shows %s without capability only Mi equipo', (role) => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole(role)

    const drawer = renderOpenDrawer()

    expect(drawer.getByRole('link', { name: 'Dream Team' })).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo')
    expect(drawer.queryByRole('link', { name: 'Servidores' })).not.toBeInTheDocument()
    expect(drawer.queryByRole('link', { name: 'Estructura' })).not.toBeInTheDocument()
  })

  it.each([['lider'], ['miembro'], ['admin']])('shows a plain %s no Dream Team section', (role) => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole(role)

    const drawer = renderOpenDrawer()

    expect(drawer.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
    expect(drawer.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument()
  })

  it('shows nobody the section without a platform session', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'

    const drawer = renderOpenDrawer()

    expect(drawer.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
  })

  it('hides the section from everybody when the flag is off', () => {
    for (const session of [readCapableSession, sessionWithRole('director-etapa')]) {
      currentPlatformSession = session
      const { unmount } = render(<HeaderMovil />)
      fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
      expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('places Dream Team right after Grupos de Vida, like the desktop sidebar', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const drawer = renderOpenDrawer()
    const topLevel = drawer
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label) => ['Dashboard', 'Usuarios', 'Grupos de Vida', 'Dream Team'].includes(label ?? ''))

    expect(topLevel.indexOf('Dream Team')).toBe(topLevel.indexOf('Grupos de Vida') + 1)
  })

  it('opens and closes the Dream Team submenu like the other submenus', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const drawer = renderOpenDrawer()
    const toggle = drawer.getByRole('button', { name: 'Abrir Dream Team' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(drawer.getByRole('button', { name: 'Cerrar Dream Team' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(drawer.getByRole('button', { name: 'Cerrar Dream Team' }))
    expect(drawer.getByRole('button', { name: 'Abrir Dream Team' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('auto-expands the submenu and highlights the active child on a Dream Team route', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession
    currentPathname = '/admin/dream-team/estructura'

    const drawer = renderOpenDrawer()

    expect(drawer.getByRole('button', { name: 'Cerrar Dream Team' })).toHaveAttribute('aria-expanded', 'true')
    expect(drawer.getByRole('link', { name: 'Estructura' })).toHaveAttribute('aria-current', 'page')
    expect(drawer.getByRole('link', { name: 'Mi equipo' })).not.toHaveAttribute('aria-current')
  })

  it('auto-expands a director\'s submenu and highlights Mi equipo', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = sessionWithRole('director-etapa')
    currentPathname = '/dream-team/mi-equipo'

    const drawer = renderOpenDrawer()

    expect(drawer.getByRole('button', { name: 'Cerrar Dream Team' })).toHaveAttribute('aria-expanded', 'true')
    expect(drawer.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not touch the other drawer sections', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    const drawer = renderOpenDrawer()

    expect(drawer.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(drawer.getByRole('link', { name: 'Grupos de Vida' })).toHaveAttribute('href', '/grupos-vida')
    expect(drawer.getByRole('link', { name: 'Actualizaciones' })).toHaveAttribute('href', '/actualizaciones')
  })
})

describe('HeaderMovil page title on the Dream Team routes', () => {
  beforeEach(() => {
    currentPlatformSession = readCapableSession
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
  })

  it.each([
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
