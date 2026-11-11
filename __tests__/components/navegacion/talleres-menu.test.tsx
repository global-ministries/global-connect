import { fireEvent, render, screen, within } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * «Talleres» as its own menu entry (odd/tasks/proximo-paso.md, T6, L18):
 * shown whenever talleres is on (NEXT_PUBLIC_TALLERES_*), without the
 * platform navigation flag, which keeps Administración DPS, NextGen and
 * 1:1 Global hidden in production.
 */

let currentPathname = '/dashboard'
let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1' },
    roles: ['miembro'],
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

const sesion: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' }],
  capabilities: [
    { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'global', source: 'manual' },
    { key: 'nextgen.admin.manage', experience: 'nextgen', scopeType: 'experience', source: 'manual' },
    { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'manual' },
  ],
}

const ENTORNO = [
  'NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED',
  'NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH',
  'NEXT_PUBLIC_TALLERES_ENABLED',
  'NEXT_PUBLIC_TALLERES_STAGE',
  'NEXT_PUBLIC_TALLERES_KILL_SWITCH',
] as const

function talleresEncendido() {
  process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
  process.env.NEXT_PUBLIC_TALLERES_STAGE = 'public'
  process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'false'
}

const enlacesTalleres = () => screen.queryAllByRole('link', { name: 'Talleres' })

describe('«Talleres» in the sidebar without platform navigation', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = sesion
    for (const clave of ENTORNO) delete process.env[clave]
  })

  afterAll(() => {
    for (const clave of ENTORNO) delete process.env[clave]
  })

  it('shows Talleres in Ministerios, opening its submenu, while the platform-only entries stay hidden', () => {
    talleresEncendido()

    render(<SidebarModerna />)

    expect(enlacesTalleres()).toHaveLength(1)
    expect(enlacesTalleres()[0]).toHaveAttribute('href', '/talleres/explorar')
    for (const nombre of ['Administración DPS', 'Administración NextGen', '1:1 Global', 'Grupos de Vida — Adultos']) {
      expect(screen.queryByRole('link', { name: nombre })).not.toBeInTheDocument()
    }

    const abrir = screen.getByRole('button', { name: 'Abrir submenú de Talleres' })
    expect(abrir).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(abrir)
    expect(screen.getByRole('button', { name: 'Cerrar submenú de Talleres' })).toHaveAttribute('aria-expanded', 'true')
    const submenu = document.getElementById(abrir.getAttribute('aria-controls')!)!
    expect(within(submenu).getByRole('link', { name: 'Explorar' })).toHaveAttribute('href', '/talleres/explorar')
    expect(within(submenu).getByRole('link', { name: 'Mi Recorrido' })).toHaveAttribute('href', '/talleres/mi-recorrido')
  })

  it('places Talleres in the Ministerios list', () => {
    talleresEncendido()

    render(<SidebarModerna />)

    const ministerios = screen.getByRole('link', { name: 'Grupos de Vida' }).closest('ul')!
    expect(within(ministerios).getByRole('link', { name: 'Talleres' })).toBeInTheDocument()
  })

  it.each([
    ['talleres is off', () => {}],
    ['the kill switch is on', () => {
      talleresEncendido()
      process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'true'
    }],
    ['the stage is off', () => {
      talleresEncendido()
      process.env.NEXT_PUBLIC_TALLERES_STAGE = 'off'
    }],
  ])('hides Talleres when %s', (_caso, preparar) => {
    preparar()

    render(<SidebarModerna />)

    expect(enlacesTalleres()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Abrir submenú de Talleres' })).not.toBeInTheDocument()
  })

  it.each(['/talleres/proximo-paso', '/admin/talleres/inscripciones'])('opens the Talleres group on %s', (ruta) => {
    talleresEncendido()
    currentPathname = ruta

    render(<SidebarModerna />)

    expect(screen.getByRole('button', { name: 'Cerrar submenú de Talleres' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Explorar' })).toHaveAttribute('href', '/talleres/explorar')
  })

  it('renders a single Talleres entry when the platform navigation flag is also on', async () => {
    talleresEncendido()
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'

    render(<SidebarModerna />)

    // The platform items have resolved once its scoped Grupos de Vida link shows.
    expect(await screen.findByRole('link', { name: 'Grupos de Vida — Adultos' })).toBeInTheDocument()
    expect(enlacesTalleres()).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Abrir submenú de Talleres' })).toHaveLength(1)
  })
})
