import { render, screen, waitFor } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

let currentPathname = '/dashboard'
let currentRoles = ['miembro']
let currentPlatformSession: PlatformSession | null = null
let currentLoading = false
let currentUsuario: { id: string } | null = null

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
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
// Talleres flag is read at render-time by TalleresNavSubmenu. The
// test environment doesn't define NEXT_PUBLIC_TALLERES_* env vars, so
// we force the flag on here — otherwise TalleresNavSubmenu returns
// null and the sub-menu never mounts, regardless of the user's caps.
jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => true,
  getTalleresFlags: () => ({ enabled: true, stage: 'public', killSwitch: false, minAppVersion: null }),
  getTalleresStage: () => 'public',
  getTalleresStageGate: () => true,
  parseFlag: (value: string | undefined | null) => value === 'true' || value === 'on' || value === '1' || value === 'yes',
}))

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

describe('SidebarModerna platform navigation', () => {
  beforeEach(() => {
    currentPathname = '/dashboard'
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

  it('shows all pastoral links for a session with pastoral capabilities', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentRoles = ['admin']
    currentUsuario = { id: 'usuario-1' }
    currentPlatformSession = withCapabilities([
      { key: 'pastoral.read.all', experience: 'pastoral', scopeType: 'experience', source: 'pastoral' },
      { key: 'pastoral.admin.manage', experience: 'pastoral', scopeType: 'experience', source: 'pastoral' },
    ])

    render(<SidebarModerna />)

    expect(await screen.findByRole('link', { name: 'Sesiones 1:1' })).toHaveAttribute('href', '/pastor')
    expect(screen.getByRole('link', { name: 'Gestión de Usuarios' })).toHaveAttribute('href', '/pastor/usuarios')
    expect(screen.getByRole('link', { name: 'Alertas de Crisis' })).toHaveAttribute('href', '/pastor/crisis')
    expect(screen.getByRole('link', { name: 'Lecturas Pastorales' })).toHaveAttribute('href', '/pastor/lecturas')
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

  // ─── PR25 — talleres sub-menu render path ────────────────────────────────
  //
  // The talleres admin parent (id: `platform-talleres_admin-taller-global`)
  // must render the role-grouped sub-menu — including the new
  // `talleres_admin_abstracto` entry-point — when the user holds
  // `talleres_crecimiento.admin.manage` even if no other talleres cap is
  // present. PR25 removed the `&& isOpen` guard from the sub-menu render
  // because platform items never expose a chevron (`children?: never`),
  // so the chevron-toggled path was unreachable for them.

  it('PR25: renders the talleres admin sub-menu for an admin user (no participation.read needed)', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPathname = '/admin/talleres/abstracto'
    currentPlatformSession = withCapabilities([
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
    ])

    render(<SidebarModerna />)

    // The admin parent entry must appear (fixed href in PR25 = /admin/talleres/abstracto).
    // Use a manual query so we don't depend on accessible-name resolution
    // for the platform item (whose SVG icon renders an SVG title that
    // can interfere with name lookups in some jsdom configs).
    await waitFor(() => {
      const adminLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/admin/talleres/abstracto')
      expect(adminLinks.length).toBeGreaterThanOrEqual(1)
    })

    // The role-grouped sub-menu must mount under the admin parent.
    // With admin.manage as the ONLY taller cap, the sub-menu shows the
    // single abstracto entry-point (PR25: previously the sub-menu
    // returned [] and never rendered for admin-only users).
    await waitFor(() => {
      const subLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/admin/talleres/abstracto')
      // Parent + sub-menu link both point to /admin/talleres/abstracto.
      expect(subLinks.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('PR25: auto-expand opens the talleres sub-menu when admin navigates to /admin/talleres/abstracto', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    currentPathname = '/admin/talleres/abstracto'
    currentPlatformSession = withCapabilities([
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
    ])

    render(<SidebarModerna />)

    // Wait for the platform admin parent to render (it's fetched
    // asynchronously by usePlatformNavigationViewItems).
    await waitFor(() => {
      const adminLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/admin/talleres/abstracto')
      expect(adminLinks.length).toBeGreaterThanOrEqual(1)
    })

    // The sub-menu link must be in the document after auto-expand
    // resolves — both the parent and the sub-menu entry point at
    // /admin/talleres/abstracto, so we count occurrences.
    await waitFor(() => {
      const allAdminLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/admin/talleres/abstracto')
      expect(allAdminLinks.length).toBeGreaterThanOrEqual(2)
    })

    // Belt-and-suspenders: the admin parent link's aria-current must
    // reflect the active route once pathname matches.
    await waitFor(() => {
      const adminParents = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/admin/talleres/abstracto' && link.getAttribute('aria-current') === 'page')
      expect(adminParents.length).toBeGreaterThanOrEqual(1)
    })
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
