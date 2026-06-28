import { render, screen, waitFor } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentRoles = ['miembro']
let currentPlatformSession: PlatformSession | null = null
let currentLoading = false
let currentUsuario: { id: string } | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: currentUsuario,
    roles: currentRoles,
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: currentLoading,
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
    currentLoading = false
    currentUsuario = null
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

  it('keeps gated legacy items visible while loading after they were already resolved', () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentRoles = ['admin']
    currentPlatformSession = null

    const { rerender } = render(<SidebarModerna />)
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')

    currentLoading = true
    currentRoles = []
    rerender(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
  })

  it('retains gated legacy items for a signed-in admin during loading and removes them after sign-out', () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentRoles = ['admin']
    currentUsuario = { id: 'usuario-1' }
    currentPlatformSession = null

    const { rerender } = render(<SidebarModerna />)
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')

    currentLoading = true
    currentRoles = []
    rerender(<SidebarModerna />)

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')

    currentLoading = false
    currentRoles = []
    currentUsuario = null
    rerender(<SidebarModerna />)

    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('shows scoped platform navigation when the flag is on and the route is available', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('does not render platform links for dashboard child routes that do not exist', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
      { key: 'ninos.room.read', experience: 'ninos', scopeType: 'salon', scopeId: 'waumbaland', source: 'family' },
      { key: 'estudiantes.room.read', experience: 'estudiantes', scopeType: 'salon', scopeId: 'insideout', source: 'family' },
      { key: 'talleres_crecimiento.participation.read', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'de-hombre-a-hombre', source: 'ledger' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument())
    const dashboardChildLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/dashboard/'))
    expect(dashboardChildLinks).toHaveLength(0)
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
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
      { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'unsafe' },
      { key: 'nextgen.admin.manage', experience: 'nextgen', scopeType: 'experience', source: 'unsafe' },
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
      { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'unsafe' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
    expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración NextGen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración Talleres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '1:1 Global' })).not.toBeInTheDocument()
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
