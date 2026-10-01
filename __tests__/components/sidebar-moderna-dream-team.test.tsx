import { render, screen } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentPathname = '/dashboard'
let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1' },
    roles: ['admin'],
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))
// Same reasoning as sidebar-platform-navigation.test.tsx: the talleres flag
// is irrelevant here, but TalleresNavSubmenu reads it at render-time, and
// the test env has no NEXT_PUBLIC_TALLERES_* vars set.
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

function withCapabilities(capabilities: PlatformSession['capabilities']): PlatformSession {
  return { ...basePlatformSession, capabilities }
}

const readCapableSession = withCapabilities([
  { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' },
])

describe('SidebarModerna Dream Team entry', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = null
    delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
  })

  it('renders Dream Team with its three children when the flag is on and the session can read', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession

    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Dream Team' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo')
    expect(screen.getByRole('link', { name: 'Servidores' })).toHaveAttribute('href', '/admin/dream-team/servidores')
    expect(screen.getByRole('link', { name: 'Estructura' })).toHaveAttribute('href', '/admin/dream-team/estructura')
  })

  it('does not render Dream Team when the flag is off', () => {
    currentPlatformSession = readCapableSession

    render(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument()
  })

  it('does not render Dream Team when the session lacks a Dream Team read capability', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = withCapabilities([])

    render(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
  })

  describe('Grupos de Vida directors (system role, no Dream Team capability)', () => {
    const directorSession = (role: string): PlatformSession => ({ ...basePlatformSession, globalRoles: [role] })

    it.each([['director-etapa'], ['director-general']])('shows %s only Mi equipo', (role) => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      currentPlatformSession = directorSession(role)

      render(<SidebarModerna />)

      expect(screen.getByRole('link', { name: 'Dream Team' })).toHaveAttribute('href', '/dream-team/mi-equipo')
      expect(screen.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo')
      expect(screen.queryByRole('link', { name: 'Servidores' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Estructura' })).not.toBeInTheDocument()
    })

    it('shows a plain leader nothing', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      currentPlatformSession = directorSession('lider')

      render(<SidebarModerna />)

      expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument()
    })

    it('shows a director nothing when the flag is off', () => {
      currentPlatformSession = directorSession('director-etapa')

      render(<SidebarModerna />)

      expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument()
    })

    it('keeps the three entries for a director who also holds a capability', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      currentPlatformSession = { ...readCapableSession, globalRoles: ['director-etapa'] }

      render(<SidebarModerna />)

      expect(screen.getByRole('link', { name: 'Mi equipo' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Servidores' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Estructura' })).toBeInTheDocument()
    })

    it('auto-expands the director\'s submenu on /dream-team/mi-equipo', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      currentPlatformSession = directorSession('director-etapa')
      currentPathname = '/dream-team/mi-equipo'

      render(<SidebarModerna />)

      const chevronButton = screen
        .getAllByRole('button')
        .find((btn) => btn.getAttribute('aria-label')?.includes('submenú de Dream Team'))
      expect(chevronButton).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('aria-current', 'page')
    })
  })

  it('auto-expands the Dream Team submenu when a child route is active', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = readCapableSession
    currentPathname = '/admin/dream-team/estructura'

    render(<SidebarModerna />)

    const chevronButton = screen
      .getAllByRole('button')
      .find((btn) => btn.getAttribute('aria-label')?.includes('submenú de Dream Team'))
    expect(chevronButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Estructura' })).toHaveAttribute('aria-current', 'page')
  })
})
