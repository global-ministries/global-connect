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
  then<T>(onFulfilled: (value: { count: number }) => T): Promise<T>
}

function makeQueryChain(count: number): QueryChain {
  const chain: QueryChain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    is: jest.fn(() => chain),
    then<T>(onFulfilled: (value: { count: number }) => T): Promise<T> {
      return Promise.resolve({ count }).then(onFulfilled)
    },
  }
  return chain
}

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
      return makeQueryChain(queryCountRef.count * 10)
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
  })
})

// ─── useTalleresCounters — fetch behavior ─────────────────────────────────

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
    if (expectedQueries === 0) {
      await new Promise((r) => setTimeout(r, 100))
    } else {
      await waitFor(
        () => {
          expect(ref.count).toBeGreaterThanOrEqual(expectedQueries)
        },
        { timeout: 3000 },
      )
    }
    return ref.count
  }

  it('fetches the 2 pendientes queries when user has coordinator.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.coordinator.read'], 2)
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('fetches the 2 pendientes queries when user has director.read too (T10: the old extra 2 Dirección queries are gone)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.director.read'], 2)
    expect(count).toBe(2)
  })

  it('fetches the 2 pendientes queries when user has metrics.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.metrics.read'], 2)
    expect(count).toBe(2)
  })

  it('does NOT fetch counters when user has only participation.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.participation.read'], 0)
    expect(count).toBe(0)
  })

  it('does NOT fetch counters when user has no capabilities', async () => {
    const count = await runFetchTest([], 0)
    expect(count).toBe(0)
  })

  it('does NOT fetch counters for lead.read alone (T10: the old líder Mis Grupos counter is gone)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.lead.read'], 0)
    expect(count).toBe(0)
  })
})

// ─── T6 — /talleres/pendientes counter agrees with the page's own data ─────

describe('TalleresNavSubmenu — talleres_pendientes counter (T6)', () => {
  it('sums the same inscripciones-pendientes + solicitudes-pendientes counts, and queries nothing else', async () => {
    const queriedTables: string[] = []
    createClientMock.mockImplementation(() => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        queriedTables.push(table)
        if (table === 'taller_inscripciones') return makeQueryChain(3)
        if (table === 'taller_solicitudes_retiro') return makeQueryChain(2)
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
    // T10: exactly these 2 queries total — the old Dirección
    // talleres/reportes counters and the líder grupos counter are gone.
    expect(queriedTables).toEqual(
      expect.arrayContaining(['taller_inscripciones', 'taller_solicitudes_retiro']),
    )
    expect(queriedTables).toHaveLength(2)
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

  it('shows the participante Explorar + Mi Recorrido items even when the flag is "off"', () => {
    // The flag going 'off' used to hide every non-admin entry (PR26
    // behavior). PR42 removed that filter — the pages don't gate on
    // the flag, so the sidebar shouldn't either.
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

  it('T10: an admin.manage-only user sees only the 2 P items — the admin wizard entry is deleted', () => {
    const ref = { count: 0 }
    createClientMock.mockImplementation(makeBrowserClientMock(ref))
    render(
      React.createElement(TalleresNavSubmenu, {
        sessionCapabilities: ['talleres_crecimiento.admin.manage'],
      }),
    )
    expect(screen.getByText('Explorar')).toBeDefined()
    expect(screen.getByText('Mi Recorrido')).toBeDefined()
    expect(screen.queryByText('Grupos de Corto Plazo')).toBeNull()
    expect(screen.queryByText('Inscripciones (global)')).toBeNull()
  })
})
