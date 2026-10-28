import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentRoles = ['miembro']
let currentPlatformSession: PlatformSession | null = null
let currentLoading = false

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
    loading: currentLoading,
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

/**
 * The phone menus in platform navigation mode. The drawer is gone
 * (odd/tasks/sistema-diseno-v2.md, S9.6): what it listed is now split between
 * the tab bar and the "Más" sheet, so these tests read both.
 */
async function abrirMas() {
  await userEvent.click(screen.getByRole('button', { name: 'Más' }))
  return within(screen.getByRole('dialog', { name: 'Más' }))
}

/** Every link on the phone: the tabs (hidden from the tree while the sheet is open), then the open "Más" sheet. */
function enlacesMovil() {
  return screen.queryAllByRole('link', { hidden: true }).map((link) => ({
    nombre: link.getAttribute('aria-label') ?? link.textContent ?? '',
    href: link.getAttribute('href'),
  }))
}

describe('phone platform navigation (tab bar and "Más")', () => {
  beforeEach(() => {
    currentRoles = ['miembro']
    currentPlatformSession = null
    currentLoading = false
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
  })

  it.each([
    ['feature flag is off', undefined, undefined],
    ['kill switch is active', 'true', 'true'],
  ])('keeps the legacy entries when the %s', async (_label, enabled, killSwitch) => {
    if (enabled) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = enabled
    if (killSwitch) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = killSwitch
    currentRoles = ['admin']
    currentPlatformSession = withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ])

    render(<MenuInferiorMovil />)
    const hoja = await abrirMas()

    expect(hoja.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    expect(enlacesMovil().some(({ nombre }) => nombre.includes('DPS Música'))).toBe(false)
  })

  it('keeps gated legacy items visible while loading after they were already resolved', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentRoles = ['admin']
    currentPlatformSession = null

    const { rerender } = render(<MenuInferiorMovil />)
    await abrirMas()
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')

    currentLoading = true
    currentRoles = []
    rerender(<MenuInferiorMovil />)

    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
  })

  it('opens the scoped platform Grupos de Vida item from the Grupos tab when the flag is on', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPlatformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    render(<MenuInferiorMovil />)

    // Talleres resolves with the platform items; the scoped Grupos de Vida item opens the Grupos tab's page.
    expect(await screen.findByLabelText('Navegar a Talleres')).toBeInTheDocument()
    expect(screen.getByLabelText('Navegar a Grupos de Vida')).toHaveAttribute('href', '/grupos-vida')
    const hoja = await abrirMas()
    expect(hoja.queryByRole('link', { name: 'Grupos de Vida — Adultos' })).not.toBeInTheDocument()
    expect(hoja.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('suppresses unavailable and global platform access in the tab bar and "Más"', async () => {
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
    expect(await screen.findByLabelText('Navegar a Talleres — de-hombre-a-hombre')).toHaveAttribute('href', '/talleres/explorar')
    await abrirMas()

    await waitFor(() => expect(enlacesMovil().some(({ nombre }) => nombre.includes('DPS Música'))).toBe(false))
    const nombres = enlacesMovil().map(({ nombre }) => nombre)
    for (const oculto of ['Niños', 'Estudiantes', 'Administración DPS', 'Administración NextGen', '1:1 Global', 'Usuarios']) {
      expect(nombres.some((nombre) => nombre === oculto || nombre === `Navegar a ${oculto}`)).toBe(false)
    }
    // Only the shared Talleres entry (a tab) reaches /talleres; no global Talleres admin.
    expect(enlacesMovil().filter(({ href }) => href?.startsWith('/talleres')).map(({ href }) => href)).toEqual(['/talleres/explorar'])
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
