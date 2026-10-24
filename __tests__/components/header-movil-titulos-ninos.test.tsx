import { render, screen } from '@testing-library/react'

import { HeaderMovil } from '@/components/ui/header-movil'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * Mobile header title on the Niños screens (odd/tasks/ninos-roles-ui.md F4): the same
 * title as the desktop header, never the fallback "Global".
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


describe('HeaderMovil title on the Niños screens', () => {
  beforeEach(() => {
    currentPlatformSession = null
  })

  it.each([
    ['/ninos/checkin', 'Check-in'],
    ['/ninos/familias', 'Familias'],
    ['/ninos/salon', 'Salones'],
    ['/ninos/voluntarios', 'Voluntarios'],
    ['/ninos/cartel', 'Cartel QR'],
    ['/ninos/reportes', 'Reportes'],
  ])('%s shows "%s"', (ruta, titulo) => {
    currentPathname = ruta
    render(<HeaderMovil />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(titulo)
  })

  it('keeps the existing titles (Mi equipo, Mi Perfil) and the logo on the dashboard', () => {
    currentPathname = '/dream-team/mi-equipo'
    const { unmount } = render(<HeaderMovil />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mi equipo')
    unmount()
    currentPathname = '/perfil'
    const segundo = render(<HeaderMovil />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mi Perfil')
    segundo.unmount()
    currentPathname = '/dashboard'
    render(<HeaderMovil />)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
