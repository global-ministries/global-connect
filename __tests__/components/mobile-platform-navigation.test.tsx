import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HeaderMovil } from '@/components/ui/header-movil'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentRoles = ['miembro']
let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
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

describe('HeaderMovil platform navigation', () => {
  beforeEach(() => {
    currentRoles = ['miembro']
    currentPlatformSession = null
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
  })

  it.each([
    ['feature flag is off', undefined, undefined],
    ['kill switch is active', 'true', 'true'],
  ])('keeps legacy mobile drawer behavior when the %s', async (_label, enabled, killSwitch) => {
    if (enabled) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = enabled
    if (killSwitch) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = killSwitch
    currentRoles = ['admin']
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument()
  })

  it('shows scoped platform navigation in the mobile drawer when the flag is on and the route is available', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))

    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('suppresses unavailable and global platform access in the mobile drawer', async () => {
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

    render(<HeaderMovil />)
    await userEvent.click(screen.getByLabelText('Abrir menú'))

    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'DPS Música' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Niños' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Estudiantes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Talleres de Crecimiento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración NextGen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administración Talleres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '1:1 Global' })).not.toBeInTheDocument()
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
