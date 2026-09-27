/**
 * PR20 — Tests for the talleres nav sub-menu component.
 *
 * Covers:
 *   - counterVariantFor: warning for pendientes, info otherwise
 *   - counters fetch behavior
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — rewritten. Every
 * old role-prefixed item (and its own counter query) is deleted: the
 * Dirección talleres/reportes counters, the líder Mis Grupos counter,
 * and the admin-only killSwitch carve-out are all gone along with the
 * screens they backed. Only talleres_pendientes' counter survives.
 *
 * T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — "Mis
 * grupos" is restored, but DATA-gated (≥1 grupo as líder/voluntario), not
 * capability-gated (a real líder can hold zero talleres capabilities) —
 * so its count fetch runs UNCONDITIONALLY, independent of
 * sessionCapabilities, unlike talleres_pendientes' capability-gated
 * fetch. Resolving "my own" grupos needs the caller's personaId, fetched
 * the same way hooks/useCurrentUser.tsx does: auth.getUser() ->
 * usuarios.id -> the scoped count.
 */

import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import {
  TalleresNavSubmenu,
  counterVariantFor,
} from '@/components/talleres/nav-submenu'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

const createClientMock = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => createClientMock(),
}))

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => true,
  getTalleresFlags: () => ({
    enabled: true,
    stage: 'public',
    killSwitch: false,
    minAppVersion: null,
  }),
}))

interface QueryChain {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  is: jest.Mock
  maybeSingle: jest.Mock
  then<T>(onFulfilled: (value: { count: number }) => T): Promise<T>
}

function makeQueryChain(count: number, maybeSingleData: unknown = null): QueryChain {
  const chain: QueryChain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    is: jest.fn(() => chain),
    // T11 — the "Mis grupos" persona lookup (.from('usuarios')...eq('auth_id', ...).maybeSingle())
    // uses this instead of `then`; every other query in this file ignores it.
    maybeSingle: jest.fn(() => Promise.resolve({ data: maybeSingleData, error: null })),
    then<T>(onFulfilled: (value: { count: number }) => T): Promise<T> {
      return Promise.resolve({ count }).then(onFulfilled)
    },
  }
  return chain
}

/**
 * Generic mock: every `.from()` call counts toward `queryCountRef` and
 * resolves an arbitrary count — used by tests that only care HOW MANY
 * queries ran, not which table. `.maybeSingle()` resolves `{ id: 'p-1' }`
 * unconditionally, so the T11 "Mis grupos" persona lookup always finds a
 * persona and proceeds to its own count query (2 `.from()` calls total:
 * usuarios, then taller_grupo_asignaciones).
 */
function makeBrowserClientMock(queryCountRef: { count: number }) {
  return () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
    },
    from: (_table: string) => {
      queryCountRef.count++
      return makeQueryChain(queryCountRef.count * 10, { id: 'p-1' })
    },
  })
}

// ─── counterVariantFor — pure helper ──────────────────────────────────────

describe('counterVariantFor', () => {
  it('returns warning for the pendientes inbox', () => {
    expect(counterVariantFor('talleres_pendientes')).toBe('warning')
  })

  it('returns info for everything else', () => {
    expect(counterVariantFor('talleres_reportes')).toBe('info')
    expect(counterVariantFor('talleres_temporadas')).toBe('info')
    expect(counterVariantFor('talleres_participante_explorar')).toBe('info')
    // fix/talleres-nav-catalogo
    expect(counterVariantFor('talleres_catalogo')).toBe('info')
  })
})

// ─── useTalleresCounters — fetch behavior ─────────────────────────────────

// T11 — the "Mis grupos" persona-lookup + count is now 2 UNCONDITIONAL
// `.from()` calls (usuarios, then taller_grupo_asignaciones) on top of
// whatever the capability-gated pendientes fetch adds.
const MIS_GRUPOS_QUERIES = 2

describe('TalleresNavSubmenu — counters fetch behavior', () => {
  async function runFetchTest(
    sessionCapabilities: readonly string[],
    expectedQueries: number
  ): Promise<number> {
    const ref = { count: 0 }
    createClientMock.mockImplementation(makeBrowserClientMock(ref))
    render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities,
      }),
    )
    await waitFor(
      () => {
        expect(ref.count).toBeGreaterThanOrEqual(expectedQueries)
      },
      { timeout: 3000 },
    )
    // Give any (unexpected) extra query a moment to land before the final assert.
    await new Promise((r) => setTimeout(r, 50))
    return ref.count
  }

  it('fetches the 2 pendientes + 2 mis-grupos queries when user has coordinator.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.coordinator.read'], 2 + MIS_GRUPOS_QUERIES)
    expect(count).toBe(2 + MIS_GRUPOS_QUERIES)
  })

  it('fetches the 2 pendientes + 2 mis-grupos queries when user has director.read too (T10: the old extra 2 Dirección queries stay gone)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.director.read'], 2 + MIS_GRUPOS_QUERIES)
    expect(count).toBe(2 + MIS_GRUPOS_QUERIES)
  })

  it('fetches the 2 pendientes + 2 mis-grupos queries when user has metrics.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.metrics.read'], 2 + MIS_GRUPOS_QUERIES)
    expect(count).toBe(2 + MIS_GRUPOS_QUERIES)
  })

  it('fetches only the 2 mis-grupos queries when user has only participation.read (pendientes still gated)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.participation.read'], MIS_GRUPOS_QUERIES)
    expect(count).toBe(MIS_GRUPOS_QUERIES)
  })

  it('fetches the 2 mis-grupos queries even with zero capabilities (T11: a real líder can hold none)', async () => {
    const count = await runFetchTest([], MIS_GRUPOS_QUERIES)
    expect(count).toBe(MIS_GRUPOS_QUERIES)
  })

  it('fetches only the 2 mis-grupos queries for lead.read alone (T10: pendientes stays gated; T11: mis-grupos never was)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.lead.read'], MIS_GRUPOS_QUERIES)
    expect(count).toBe(MIS_GRUPOS_QUERIES)
  })
})

// ─── T11 — "Mis grupos" nav item, data-gated (not capability-gated) ───────

describe('TalleresNavSubmenu — Mis grupos (T11)', () => {
  it('renders "Mis grupos" -> /talleres#mis-grupos-heading with its count badge when the persona has ≥1 grupo', async () => {
    createClientMock.mockImplementation(() => ({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'usuarios') return makeQueryChain(0, { id: 'p-1' })
        if (table === 'taller_grupo_asignaciones') return makeQueryChain(3)
        return makeQueryChain(0)
      },
    }))
    render(React.createElement(TalleresNavSubmenu, { sessionCapabilities: [] }))

    const link = await screen.findByText('Mis grupos')
    expect(link.closest('a')).toHaveAttribute('href', '/talleres#mis-grupos-heading')
    expect(await screen.findByText('3')).toBeDefined()
  })

  it('never renders "Mis grupos" when the persona has zero grupos', async () => {
    createClientMock.mockImplementation(() => ({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'usuarios') return makeQueryChain(0, { id: 'p-1' })
        if (table === 'taller_grupo_asignaciones') return makeQueryChain(0)
        return makeQueryChain(0)
      },
    }))
    render(React.createElement(TalleresNavSubmenu, { sessionCapabilities: [] }))

    // Let the fetch settle before asserting absence.
    await waitFor(() => expect(screen.getByText('Catálogo')).toBeDefined())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Mis grupos')).toBeNull()
  })

  it('never renders "Mis grupos" when there is no signed-in user (auth.getUser returns null)', async () => {
    createClientMock.mockImplementation(() => ({
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: () => makeQueryChain(0),
    }))
    render(React.createElement(TalleresNavSubmenu, { sessionCapabilities: [] }))

    await waitFor(() => expect(screen.getByText('Catálogo')).toBeDefined())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Mis grupos')).toBeNull()
  })
})

// ─── T6 — /talleres/pendientes counter agrees with the page's own data ─────

describe('TalleresNavSubmenu — talleres_pendientes counter (T6)', () => {
  it('sums the same inscripciones-pendientes + solicitudes-pendientes counts, and queries nothing else besides the T11 mis-grupos pair', async () => {
    const queriedTables: string[] = []
    createClientMock.mockImplementation(() => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        queriedTables.push(table)
        if (table === 'taller_inscripciones') return makeQueryChain(3)
        if (table === 'taller_solicitudes_retiro') return makeQueryChain(2)
        if (table === 'usuarios') return makeQueryChain(0, { id: 'p-1' })
        if (table === 'taller_grupo_asignaciones') return makeQueryChain(0)
        return makeQueryChain(0)
      },
    }))

    render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities: ['talleres_crecimiento.metrics.read'],
      }),
    )

    await waitFor(() => {
      expect(screen.getByText('5')).toBeDefined()
    })
    // T10: exactly these 2 pendientes queries. T11 adds exactly 2 more
    // (usuarios, then taller_grupo_asignaciones) for mis-grupos — nothing
    // else, no old Dirección talleres/reportes counters revived.
    await waitFor(() => expect(queriedTables).toHaveLength(4))
    expect(queriedTables).toEqual(
      expect.arrayContaining([
        'taller_inscripciones',
        'taller_solicitudes_retiro',
        'usuarios',
        'taller_grupo_asignaciones',
      ]),
    )
    expect(queriedTables).toHaveLength(4)
  })
})

// ─── PR42 — sidebar mirrors capability, not the participant flag ────────────

describe('TalleresNavSubmenu — PR42 capability-only filter', () => {
  /**
   * Helper that overrides the flags mock for the duration of one test.
   * The component reads `getTalleresFlags()` at render time, so we
   * swap the mock implementation before mounting.
   */
  function withFlags(flags: {
    enabled: boolean
    stage: 'off' | 'admin-only' | 'internal' | 'public'
    killSwitch: boolean
    minAppVersion: string | null
  }): void {
    const flagsModule = jest.requireMock('@/lib/platform/talleres/flags')
    flagsModule.getTalleresFlags = jest.fn(() => flags)
    flagsModule.isTalleresEnabled = jest.fn(() => flags.enabled && flags.stage !== 'off' && !flags.killSwitch)
  }

  beforeEach(() => {
    // Reset to the default enabled+public state before each test.
    withFlags({
      enabled: true,
      stage: 'public',
      killSwitch: false,
      minAppVersion: null,
    })
  })

  it('shows the Catálogo + participante Explorar + Mi Recorrido items even when the flag is "off"', () => {
    // The flag going 'off' used to hide every non-admin entry (PR26
    // behavior). PR42 removed that filter — the pages don't gate on
    // the flag, so the sidebar shouldn't either. fix/talleres-nav-catalogo
    // — Catálogo (/talleres) is open to any authenticated user the same
    // way, so it survives the flag going off too.
    withFlags({
      enabled: false,
      stage: 'off',
      killSwitch: false,
      minAppVersion: null,
    })
    const ref = { count: 0 }
    createClientMock.mockImplementation(makeBrowserClientMock(ref))
    render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities: ['talleres_crecimiento.participation.read'],
      }),
    )
    expect(screen.getByText('Catálogo')).toBeDefined()
    expect(screen.getByText('Explorar')).toBeDefined()
    expect(screen.getByText('Mi Recorrido')).toBeDefined()
  })

  it('T10: shows nothing when the kill switch is ON — no admin-only carve-out survives (the item it existed for is deleted)', () => {
    withFlags({
      enabled: true,
      stage: 'public',
      killSwitch: true,
      minAppVersion: null,
    })
    const ref = { count: 0 }
    createClientMock.mockImplementation(makeBrowserClientMock(ref))
    const { container } = render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities: [
          'talleres_crecimiento.participation.read',
          'talleres_crecimiento.admin.manage',
          'talleres_crecimiento.director.read',
          'talleres_crecimiento.metrics.read',
        ],
      }),
    )
    expect(container.firstChild).toBeNull()
  })

  it('T10: an admin.manage-only user sees only the 3 P items — the admin wizard entry is deleted', () => {
    const ref = { count: 0 }
    createClientMock.mockImplementation(makeBrowserClientMock(ref))
    render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities: ['talleres_crecimiento.admin.manage'],
      }),
    )
    expect(screen.getByText('Catálogo')).toBeDefined()
    expect(screen.getByText('Explorar')).toBeDefined()
    expect(screen.getByText('Mi Recorrido')).toBeDefined()
    expect(screen.queryByText('Grupos de Corto Plazo')).toBeNull()
    expect(screen.queryByText('Inscripciones (global)')).toBeNull()
  })
})
