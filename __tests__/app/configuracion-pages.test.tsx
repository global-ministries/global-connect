import { act, render, screen } from '@testing-library/react'
import type { PlatformSession } from '@/lib/platform/session/types'

const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
const redirect = jest.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) })

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
jest.mock('@/components/layout/dashboard-layout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo: string }) => <section><h1>{titulo}</h1>{children}</section>,
}))
jest.mock('@/app/(auth)/configuracion/ConfiguracionGlobalClient', () => ({ ConfiguracionGlobalClient: () => <div data-testid="configuracion-global-client" /> }))
jest.mock('@/app/(auth)/configuracion/directores-generales/GestionDGClient', () => ({ GestionDGClient: () => <div data-testid="gestion-dg-client" /> }))
jest.mock('@/lib/actions/dg-segmentos.actions', () => ({ obtenerDirectoresGenerales: jest.fn().mockResolvedValue([]), obtenerSegmentosDisponibles: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/actions/dg-directores.actions', () => ({ obtenerDEsAsignadosPorDG: jest.fn().mockResolvedValue({}) }))

const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

describe('configuracion pages render through the platform route guard without changing legacy behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalEnabled)
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalKillSwitch)
  })

  it('renders /configuracion/directores-generales when the platform flag is off (pre-slice behavior preserved)', async () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['admin', 'pastor', 'director-general'], platformSession: null })
    const { default: DirectoresGeneralesPage } = await import('@/app/(auth)/configuracion/directores-generales/page')

    await act(async () => { render(await DirectoresGeneralesPage()) })

    expect(screen.getByText('Directores Generales')).toBeInTheDocument()
  })

  it.each([
    ['kill switch is active', { enabled: 'true', killSwitch: 'true' }, null],
    ['platform session is missing', { enabled: 'true' }, null],
    ['platform session has no capabilities', { enabled: 'true' }, buildPlatformSession([])],
    ['platform session lacks the required capability', { enabled: 'true' }, buildPlatformSession([{ key: 'support.manage', experience: 'support', scopeType: 'experience', source: 'legacy' }])],
  ] as Array<[string, { enabled?: 'true'; killSwitch?: 'true' }, PlatformSession | null]>)(
    'redirects /configuracion to /dashboard when the %s',
    async (_label, env, platformSession) => {
    setNavigationEnv({ enabled: env.enabled, killSwitch: env.killSwitch })
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['admin'], platformSession })
    const { default: PaginaConfiguracion } = await import('@/app/(auth)/configuracion/page')

    await expect(PaginaConfiguracion()).rejects.toThrow(/NEXT_REDIRECT:\/dashboard/)
  })

  it('renders /configuracion when the platform flag is on and the required capability is present', async () => {
    createSupabaseServerClient.mockResolvedValue({
      from: jest.fn(() => ({ select: jest.fn(() => ({ limit: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
    })
    setNavigationEnv({ enabled: 'true' })
    getUserWithRoles.mockResolvedValue({
      user: { id: 'auth-1' },
      roles: ['admin'],
      platformSession: buildPlatformSession([{ key: 'configuracion.platform.manage', experience: 'configuracion', scopeType: 'experience', source: 'legacy' }]),
    })
    const { default: PaginaConfiguracion } = await import('@/app/(auth)/configuracion/page')

    await act(async () => { render(await PaginaConfiguracion()) })

    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByTestId('configuracion-global-client')).toBeInTheDocument()
  })
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function setNavigationEnv(env: { enabled?: 'true'; killSwitch?: 'true' }) {
  restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', env.enabled)
  restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', env.killSwitch)
}

function buildPlatformSession(capabilities: PlatformSession['capabilities']): PlatformSession {
  return { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: ['admin'], contexts: [], capabilities }
}
