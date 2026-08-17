/**
 * PR20 — Tests for the talleres nav sub-menu component.
 *
 * Covers:
 *   - counterVariantFor: warning for pendientes, info otherwise
 *   - counters fetch behavior (4 capability profiles)
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
}))

interface QueryChain {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  is: jest.Mock
  then<T>(onFulfilled: (value: { count: number }) => T): Promise<T>
}

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
  it('returns warning for pending approvals', () => {
    expect(counterVariantFor('talleres_coordinacion_inscripciones_pendientes')).toBe('warning')
    expect(counterVariantFor('talleres_direccion_solicitudes')).toBe('warning')
  })

  it('returns info for everything else', () => {
    expect(counterVariantFor('talleres_grupos_mis_grupos')).toBe('info')
    expect(counterVariantFor('talleres_direccion_talleres')).toBe('info')
    expect(counterVariantFor('talleres_direccion_reportes')).toBe('info')
    expect(counterVariantFor('talleres_direccion_resumen_global')).toBe('info')
  })
})

// ─── useTalleresCounters — fetch behavior ─────────────────────────────────

describe('TalleresNavSubmenu — counters fetch behavior', () => {
  // Helper to render a single test, capturing queryCount via the mock.
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

  it('fetches 2 C/D counters when user has coordinator.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.coordinator.read'], 2)
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('fetches 4 counters when user has director.read (2 C/D + 2 D)', async () => {
    const count = await runFetchTest(['talleres_crecimiento.director.read'], 4)
    expect(count).toBeGreaterThanOrEqual(4)
  })

  it('does NOT fetch counters when user has only participation.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.participation.read'], 0)
    expect(count).toBe(0)
  })

  it('does NOT fetch counters when user has no capabilities', async () => {
    const count = await runFetchTest([], 0)
    expect(count).toBe(0)
  })

  it('fetches 1 L counter (mis grupos) when user has lead.read', async () => {
    const count = await runFetchTest(['talleres_crecimiento.lead.read'], 1)
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
