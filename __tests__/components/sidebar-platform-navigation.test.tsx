import { render, screen } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentRoles = ['miembro']
let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: null,
    roles: currentRoles,
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

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

describe('SidebarModerna platform navigation', () => {
  beforeEach(() => {
    currentRoles = ['miembro']
    currentPlatformSession = null
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
  })

  it('keeps legacy sidebar behavior when the platform navigation flag is off', () => {
    currentRoles = ['admin']
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument()
  })

  it('shows scoped platform navigation when the flag is on and scope is allowed', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'DPS Música' })).toHaveAttribute('href', '/dashboard/dps')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('keeps legacy sidebar behavior when the kill switch is active', () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = 'true'
    currentRoles = ['admin']
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument()
  })

  it('does not show global platform access without explicit allowed scope', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
      { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'unsafe' },
      { key: 'nextgen.admin.manage', experience: 'nextgen', scopeType: 'experience', source: 'unsafe' },
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
      { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'unsafe' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'DPS Música' })).toHaveAttribute('href', '/dashboard/dps')
    expect(screen.queryByRole('link', { name: 'Administración DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración NextGen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración Talleres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '1:1 Global' })).not.toBeInTheDocument()
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities']): PlatformSession {
  return { ...basePlatformSession, capabilities }
}
