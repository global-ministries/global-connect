import { render, screen } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { NinosAccesoProvider } from '@/hooks/useNinosAcceso'
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


function renderCon(acceso: { puedeOperar: boolean; puedeVerSalon: boolean; puedeConfigurar?: boolean }) {
  return render(
    <NinosAccesoProvider puedeOperar={acceso.puedeOperar} puedeVerSalon={acceso.puedeVerSalon} puedeConfigurar={acceso.puedeConfigurar}>
      <SidebarModerna />
    </NinosAccesoProvider>,
  )
}

describe('SidebarModerna Niños section', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
    currentPlatformSession = null
  })

  it('shows Check-in, Familias and Salones to whoever operates', () => {
    renderCon({ puedeOperar: true, puedeVerSalon: true })
    expect(screen.getByRole('link', { name: 'Niños' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('href', '/ninos/checkin')
    expect(screen.getByRole('link', { name: 'Familias' })).toHaveAttribute('href', '/ninos/familias')
    expect(screen.getByRole('link', { name: 'Salones' })).toHaveAttribute('href', '/ninos/salon')
    expect(screen.getByRole('link', { name: 'Cartel QR' })).toHaveAttribute('href', '/ninos/cartel')
    expect(document.querySelector('a[href="/ninos/reportes"]')).toBeNull()
  })

  it('shows Reportes only to whoever configures (directors, coordinators, admin)', () => {
    renderCon({ puedeOperar: true, puedeVerSalon: true, puedeConfigurar: true })
    const enlaces = screen.getAllByRole('link', { name: 'Reportes' }).map((a) => a.getAttribute('href'))
    expect(enlaces).toContain('/ninos/reportes')
  })

  it('shows only Salones to a líder who sees a room', () => {
    renderCon({ puedeOperar: false, puedeVerSalon: true })
    expect(screen.getByRole('link', { name: 'Niños' })).toHaveAttribute('href', '/ninos/salon')
    expect(screen.getByRole('link', { name: 'Salones' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Check-in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Familias' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cartel QR' })).not.toBeInTheDocument()
  })

  it('shows nothing without access', () => {
    renderCon({ puedeOperar: false, puedeVerSalon: false })
    expect(screen.queryByRole('link', { name: 'Niños' })).not.toBeInTheDocument()
  })

  it('shows nothing outside the provider (fails closed)', () => {
    render(<SidebarModerna />)
    expect(screen.queryByRole('link', { name: 'Niños' })).not.toBeInTheDocument()
  })

  it('auto-expands on a Niños route', () => {
    currentPathname = '/ninos/salon'
    renderCon({ puedeOperar: true, puedeVerSalon: true })
    expect(screen.getByRole('link', { name: 'Salones' })).toBeVisible()
  })
})
