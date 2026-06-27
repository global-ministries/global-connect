import { act, render, screen, waitFor } from '@testing-library/react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { resolvePlatformNavigation } from '@/lib/platform/navigation'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentPathname = '/dashboard'
let currentPlatformSession: PlatformSession | null = null
let currentLoading = false

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}))

jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: null,
    roles: ['miembro'],
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: currentLoading,
    error: null,
  }),
}))

jest.mock('@/lib/platform/navigation', () => {
  const actual = jest.requireActual('@/lib/platform/navigation')
  return {
    ...actual,
    resolvePlatformNavigation: jest.fn(actual.resolvePlatformNavigation),
  }
})

const resolvePlatformNavigationMock = jest.mocked(resolvePlatformNavigation)

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}
const originalPlatformNavigationEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
const originalPlatformNavigationKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

describe('MenuInferiorMovil platform navigation', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = null
    currentLoading = false
    resolvePlatformNavigationMock.mockClear()
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
  })

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalPlatformNavigationEnabled)
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalPlatformNavigationKillSwitch)
  })

  it.each([
    ['feature flag is off', undefined, undefined, withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ])],
    ['kill switch is active', 'true', 'true', withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ])],
    ['platform session is missing', 'true', undefined, null],
  ] satisfies Array<[string, string | undefined, string | undefined, PlatformSession | null]>)('keeps legacy bottom navigation when the %s', (_label, enabled, killSwitch, platformSession) => {
    if (enabled) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = enabled
    if (killSwitch) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = killSwitch
    currentPlatformSession = platformSession

    render(<MenuInferiorMovil />)

    expect(screen.getByLabelText('Navegar a Dashboard')).toHaveAttribute('href', '/dashboard')
    expect(screen.getByLabelText('Navegar a Usuarios')).toHaveAttribute('href', '/users')
    expect(screen.getByLabelText('Navegar a Grupos de Vida')).toHaveAttribute('href', '/grupos-vida')
    expect(screen.getByLabelText('Navegar a Ayuda')).toHaveAttribute('href', '/ayuda')
  })

  it('does not show legacy bottom navigation while the user session is still loading with platform navigation enabled', () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentLoading = true
    currentPlatformSession = null

    render(<MenuInferiorMovil />)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByLabelText('Navegar a Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Grupos de Vida')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Ayuda')).not.toBeInTheDocument()
  })

  it('shows scoped platform navigation when the flag is on and the route is available', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<MenuInferiorMovil />)

    expect(screen.queryByLabelText('Navegar a Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Grupos de Vida')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Navegar a Grupos de Vida — Adultos')).toHaveAttribute('href', '/grupos-vida')
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Ayuda')).not.toBeInTheDocument()
  })

  it('hides previously resolved platform links while the user session reloads', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    const { rerender } = render(<MenuInferiorMovil />)
    expect(await screen.findByLabelText('Navegar a Grupos de Vida — Adultos')).toHaveAttribute('href', '/grupos-vida')

    currentLoading = true
    rerender(<MenuInferiorMovil />)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByLabelText('Navegar a Grupos de Vida — Adultos')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Ayuda')).not.toBeInTheDocument()
  })

  it('does not present unavailable and global platform entries in the bottom navigation', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
      { key: 'ninos.room.read', experience: 'ninos', scopeType: 'salon', scopeId: 'waumbaland', source: 'family' },
      { key: 'estudiantes.room.read', experience: 'estudiantes', scopeType: 'salon', scopeId: 'insideout', source: 'family' },
      { key: 'talleres_crecimiento.participation.read', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'de-hombre-a-hombre', source: 'ledger' },
      { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'unsafe' },
      { key: 'nextgen.admin.manage', experience: 'nextgen', scopeType: 'experience', source: 'unsafe' },
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
      { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'unsafe' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<MenuInferiorMovil />)

    expect(await screen.findByLabelText('Navegar a Grupos de Vida — Adultos')).toHaveAttribute('href', '/grupos-vida')
    await waitFor(() => expect(screen.queryByLabelText('Navegar a DPS Música')).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Navegar a Niños')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Estudiantes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Talleres de Crecimiento')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Administración DPS')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Administración NextGen')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Administración Talleres')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a 1:1 Global')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
  })

  it('does not fall back to legacy global links when no platform route is available for the session', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<MenuInferiorMovil />)

    await waitForPlatformNavigationToSettle()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Ayuda')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a DPS Música')).not.toBeInTheDocument()
  })

  it('does not retain stale platform links while transitioning to a session with no visible items', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    const { rerender } = render(<MenuInferiorMovil />)
    expect(await screen.findByLabelText('Navegar a Grupos de Vida — Adultos')).toHaveAttribute('href', '/grupos-vida')

    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])
    rerender(<MenuInferiorMovil />)

    await waitForPlatformNavigationToSettle(2)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByLabelText('Navegar a Grupos de Vida — Adultos')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Navegar a DPS Música')).not.toBeInTheDocument()
  })
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}

async function waitForPlatformNavigationToSettle(expectedCalls = 1) {
  await waitFor(() => expect(resolvePlatformNavigationMock).toHaveBeenCalledTimes(expectedCalls))
  await act(async () => {
    await Promise.all(resolvePlatformNavigationMock.mock.results.map((result) => result.value))
    await Promise.resolve()
  })
}
