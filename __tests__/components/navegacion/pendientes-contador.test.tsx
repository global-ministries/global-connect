/**
 * "Pendientes" in the menu with the urgentes count (odd/tasks/dream-team-pendientes-director.md,
 * T4, S2, S6; artboards design/pendientes-director/01 and 02): a desktop
 * sidebar entry under Dream Team and, on phones, a tab for whoever has team
 * authority. The count is read once on the client after mount
 * (GET /api/dream-team/pendientes), never blocking the layout, only for the
 * viewers who see the entry; it stays hidden until it arrives, at 0 and on
 * error.
 */
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { DreamTeamAccesoProvider } from '@/hooks/useDreamTeamAcceso'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentPathname = '/dashboard'
let currentSession: PlatformSession | null = null
let currentRoles: string[] = ['miembro']

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null, email: 'ana@example.com' },
    roles: currentRoles,
    supportCapabilities: [],
    platformSession: currentSession,
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
  parseFlag: (value: string | undefined | null) => value === 'true' || value === 'on',
}))

const base: PlatformSession = { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }
const coordinador: PlatformSession = {
  ...base,
  capabilities: [{ key: 'dream_team.coordinate', experience: 'dream_team', scopeType: 'equipo', scopeId: 'eq-1', source: 'dream-team' }],
}
const director: PlatformSession = {
  ...base,
  capabilities: [{ key: 'dream_team.direct', experience: 'dream_team', scopeType: 'equipo', scopeId: 'eq-1', source: 'dream-team' }],
}
const directorGdv: PlatformSession = { ...base, globalRoles: ['director-etapa'] }

const fetchMock = jest.fn()
const respuesta = (status: number, cuerpo: unknown) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
const conProveedor = (ui: ReactElement) => <DreamTeamAccesoProvider puedeRegistrar={false}>{ui}</DreamTeamAccesoProvider>
const envOriginal = { ...process.env }

beforeEach(() => {
  currentPathname = '/dashboard'
  currentRoles = ['miembro']
  currentSession = director
  process.env = { ...envOriginal, NEXT_PUBLIC_DREAM_TEAM_ENABLED: 'true' }
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterAll(() => {
  process.env = envOriginal
})

describe('sidebar — Pendientes under Dream Team', () => {
  it('links Pendientes and shows the urgentes once they arrive', async () => {
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 9 }))
    render(conProveedor(<SidebarModerna />))
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveAttribute('href', '/dream-team/pendientes')
    expect(await screen.findByRole('link', { name: 'Pendientes, 9 urgentes' })).toHaveTextContent('Pendientes9')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/pendientes', expect.objectContaining({ cache: 'no-store' }))
  })

  it('hides the count at 0', async () => {
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 0 }))
    render(conProveedor(<SidebarModerna />))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveTextContent(/^Pendientes$/)
  })

  it('fails silently: no count when the read fails', async () => {
    fetchMock.mockReturnValue(respuesta(500, { error: 'x' }))
    render(conProveedor(<SidebarModerna />))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveTextContent(/^Pendientes$/)
  })

  it('gives a coordinator Mi equipo and Pendientes', async () => {
    currentSession = coordinador
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 2 }))
    render(conProveedor(<SidebarModerna />))
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Pendientes, 2 urgentes' })).toBeInTheDocument()
  })

  it('gives a Grupos de Vida director (role only) no Pendientes and asks for nothing', async () => {
    currentSession = directorGdv
    currentRoles = ['director-etapa']
    render(conProveedor(<SidebarModerna />))
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Pendientes/ })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('phone tab bar — the Pendientes tab', () => {
  it('takes the fourth tab for a director, with the count', async () => {
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 9 }))
    render(conProveedor(<MenuInferiorMovil />))
    const pestana = await screen.findByRole('link', { name: 'Navegar a Pendientes, 9 urgentes' })
    expect(pestana).toHaveAttribute('href', '/dream-team/pendientes')
    expect(pestana).toHaveTextContent('Pendientes9')
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })
    expect(Array.from(barra.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard',
      '/grupos-vida',
      '/dream-team',
      '/dream-team/pendientes',
    ])
  })

  it('hides the count at 0', async () => {
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 0 }))
    render(conProveedor(<MenuInferiorMovil />))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('link', { name: 'Navegar a Pendientes' })).toHaveTextContent(/^Pendientes$/)
  })

  it('marks only Pendientes as current on its page, not Equipo', async () => {
    currentPathname = '/dream-team/pendientes'
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 0 }))
    render(conProveedor(<MenuInferiorMovil />))
    expect(screen.getByRole('link', { name: 'Navegar a Pendientes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Navegar a Dream Team' })).not.toHaveAttribute('aria-current')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })

  it('keeps Equipo current on Mi equipo', async () => {
    currentPathname = '/dream-team/mi-equipo'
    fetchMock.mockReturnValue(respuesta(200, { urgentes: 0 }))
    render(conProveedor(<MenuInferiorMovil />))
    expect(screen.getByRole('link', { name: 'Navegar a Dream Team' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Navegar a Pendientes' })).not.toHaveAttribute('aria-current')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})
