/**
 * Regression coverage for the reported bug: on every full page load the
 * sidebar first painted only permission-free items (Dashboard, Grupos de
 * Vida) — Usuarios, Soporte, platform items and Dream Team appeared seconds
 * later, because CurrentUserProvider resolved roles/capabilities/session in
 * one sequential client-side chain on mount.
 *
 * Unlike __tests__/components/sidebar-moderna-dream-team.test.tsx (which
 * mocks useCurrentUser directly), this test wires up the REAL
 * CurrentUserProvider with a server-resolved `initial` snapshot — exactly
 * what app/(auth)/layout.tsx and app/(pastoral)/layout.tsx now pass — and
 * asserts the role-gated Dream Team entry is present on the very first,
 * synchronous render. No `act(async …)`, no `waitFor`: if this needed an
 * effect to run first, the regression would still be there.
 */

import { render, screen } from '@testing-library/react'

import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { CurrentUserProvider, type CurrentUserResult } from '@/hooks/useCurrentUser'
import type { PlatformSession } from '@/lib/platform/session/types'

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({
    campusActivo: null,
    localidadActiva: null,
    campusDisponibles: [],
    localidadesDisponibles: [],
    campusId: null,
    localidadId: null,
    esSuperadmin: false,
    loading: false,
    seleccionarCampus: jest.fn(),
    seleccionarLocalidad: jest.fn(),
  }),
}))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))
// Same reasoning as sidebar-moderna-dream-team.test.tsx: the talleres flag is
// irrelevant here, but TalleresNavSubmenu reads it at render-time, and the
// test env has no NEXT_PUBLIC_TALLERES_* vars set.
jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => false,
  getTalleresFlags: () => ({ enabled: false, stage: 'off', killSwitch: false, minAppVersion: null }),
  getTalleresStage: () => 'off',
  getTalleresStageGate: () => false,
  parseFlag: (value: string | undefined | null) => value === 'true' || value === 'on' || value === '1' || value === 'yes',
}))

// CurrentUserProvider is the REAL one here (not mocked) — it still mounts a
// background fetch effect via @/lib/supabase/client, which must not throw
// synchronously. It is never awaited or asserted on below: the assertions
// run before any of its microtasks get a chance to settle.
const createClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))
jest.mock('@sentry/nextjs', () => ({ addBreadcrumb: jest.fn() }))

function setupHangingSupabaseClient() {
  const client = {
    auth: {
      // Never resolves — isolates "does the first render already show the
      // initial data" from anything the background fetch does.
      getUser: jest.fn(() => new Promise(() => {})),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => {
      throw new Error('Unexpected from() call before getUser() resolves')
    }),
    rpc: jest.fn(),
  }
  createClient.mockReturnValue(client)
}

const dreamTeamCapableSnapshot: CurrentUserResult = {
  authUserId: 'auth-1',
  usuario: { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' } as CurrentUserResult['usuario'],
  roles: ['admin'],
  supportCapabilities: [],
  platformSession: {
    personaId: 'usuario-1',
    subjectAuthId: 'auth-1',
    globalRoles: ['admin'],
    contexts: [],
    capabilities: [
      { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' },
    ],
  } satisfies PlatformSession,
}

describe('SidebarModerna first render with a server-provided CurrentUserProvider snapshot', () => {
  const originalDreamTeamFlag = process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED

  beforeEach(() => {
    createClient.mockReset()
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
  })

  afterEach(() => {
    if (originalDreamTeamFlag === undefined) {
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
    } else {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = originalDreamTeamFlag
    }
  })

  it('renders the Dream Team entry on the first render — no effect has to run first', () => {
    setupHangingSupabaseClient()

    render(
      <CurrentUserProvider initial={dreamTeamCapableSnapshot}>
        <SidebarModerna />
      </CurrentUserProvider>
    )

    // Synchronous assertion, immediately after render(): the background
    // fetch above hangs forever, so if this passes it can only be because
    // the FIRST render already had the role-gated capability available.
    expect(screen.getByRole('link', { name: 'Dream Team' })).toBeInTheDocument()
  })

  it('does not render Dream Team on the first render when the initial snapshot lacks the capability', () => {
    setupHangingSupabaseClient()

    render(
      <CurrentUserProvider initial={{ ...dreamTeamCapableSnapshot, platformSession: { ...dreamTeamCapableSnapshot.platformSession!, capabilities: [] } }}>
        <SidebarModerna />
      </CurrentUserProvider>
    )

    expect(screen.queryByRole('link', { name: 'Dream Team' })).not.toBeInTheDocument()
  })
})
