/**
 * @jest-environment node
 *
 * PR29-D — Server-component test for
 * /admin/talleres/ediciones-globales/page.tsx.
 *
 * The page is an async RSC that calls
 * `requireEdicionesGlobalesRole()` (for the auth/cap gate) +
 * `loadEdicionesGlobales(client)` (for the data fetch). Both are
 * mocked at the module boundary so the test can drive the 3 visible
 * branches:
 *   - kill switch → renders the "El módulo de talleres está deshabilitado" card
 *   - unauthorized → renders the "Necesitás iniciar sesión" card
 *   - forbidden → renders the "No tenés permiso" card
 *   - happy path with results → renders each edicion as a card
 *   - happy path empty → renders the empty state
 *
 * The page import contains Next.js-specific modules (next/link,
 * next/navigation) which are mocked at the top.
 */

import React from 'react'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

const requireRoleMock = jest.fn()
const loadMock = jest.fn()

jest.mock('@/lib/platform/talleres/ediciones-globales', () => ({
  requireEdicionesGlobalesRole: () => requireRoleMock(),
  loadEdicionesGlobales: (client: unknown) => loadMock(client),
}))

// Mock the UI primitives so the page renders to a string-friendly tree.
jest.mock('@/components/ui/sistema-diseno', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- test stub
  const React = require('react')
  return {
    ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo: string }) =>
      React.createElement('section', { 'data-testid': 'dashboard' }, titulo, children),
    TarjetaSistema: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement('div', { 'data-testid': 'tarjeta', className }, children),
    TextoSistema: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    BadgeSistema: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', { 'data-testid': 'badge' }, children),
  }
})

import EdicioneGlobalesIndexPage from '@/app/(auth)/admin/talleres/ediciones-globales/page'

beforeEach(() => {
  requireRoleMock.mockReset()
  loadMock.mockReset()
})

async function renderToString(PageComponent: () => Promise<React.ReactElement>): Promise<string> {
  // The page is an async server component (a function that returns a
  // Promise of JSX). We invoke it directly to drive its await chain
  // (the resolved value is the JSX tree it returns, which is then
  // synchronous JSX — safe for `renderToStaticMarkup`).
  const resolved = await PageComponent()
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- test utility
  const { renderToStaticMarkup } = require('react-dom/server')
  return renderToStaticMarkup(resolved as React.ReactElement)
}

describe('EdicionesGlobalesIndexPage', () => {
  it('renders the kill-switch message when the feature flag is off', async () => {
    requireRoleMock.mockResolvedValue({ ok: false, error: 'not-found' })
    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/El módulo de talleres está deshabilitado/)
  })

  it('renders the unauthorized message when no user is signed in', async () => {
    requireRoleMock.mockResolvedValue({ ok: false, error: 'unauthorized' })
    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/Necesitás iniciar sesión/)
  })

  it('renders the forbidden message when the user lacks caps', async () => {
    requireRoleMock.mockResolvedValue({ ok: false, error: 'forbidden' })
    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/No tenés permiso/)
  })

  it('renders the empty state when there are no ediciones globales', async () => {
    requireRoleMock.mockResolvedValue({
      ok: true,
      supabase: {},
      personaId: 'p-1',
    })
    loadMock.mockResolvedValue([])
    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/No hay ediciones globales todavía/)
    expect(html).toMatch(/Crear edición global/)
  })

  it('renders one card per edicion global in the result set', async () => {
    requireRoleMock.mockResolvedValue({
      ok: true,
      supabase: {},
      personaId: 'p-1',
    })
    loadMock.mockResolvedValue([
      {
        id: 'g-1',
        nombre: 'Otoño 2026',
        slug: 'otono-2026',
        descripcion: 'Temporada de otoño',
        fecha_apertura: '2026-09-01T00:00:00.000Z',
        fecha_cierre: '2026-12-15T00:00:00.000Z',
        estado: 'borrador',
        created_by_persona_id: 'p-1',
        created_at: '2026-08-16T00:00:00.000Z',
        updated_at: '2026-08-16T00:00:00.000Z',
        version: 1,
        participantes_count: 4,
      },
      {
        id: 'g-2',
        nombre: 'Primavera 2027',
        slug: 'primavera-2027',
        descripcion: null,
        fecha_apertura: '2027-03-01T00:00:00.000Z',
        fecha_cierre: '2027-06-15T00:00:00.000Z',
        estado: 'abierto',
        created_by_persona_id: 'p-1',
        created_at: '2026-08-16T00:00:00.000Z',
        updated_at: '2026-08-16T00:00:00.000Z',
        version: 1,
        participantes_count: 2,
      },
    ])

    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/Otoño 2026/)
    expect(html).toMatch(/Primavera 2027/)
    expect(html).toMatch(/4 talleres/)
    expect(html).toMatch(/2 talleres/)
    // The two badges
    const badges = html.match(/data-testid="badge"/g) ?? []
    expect(badges.length).toBe(2)
    // Both globales link to the detail page
    expect(html).toMatch(/href="\/admin\/talleres\/ediciones-globales\/g-1"/)
    expect(html).toMatch(/href="\/admin\/talleres\/ediciones-globales\/g-2"/)
  })

  it('renders singular "1 taller" (no pluralization)', async () => {
    requireRoleMock.mockResolvedValue({
      ok: true,
      supabase: {},
      personaId: 'p-1',
    })
    loadMock.mockResolvedValue([
      {
        id: 'g-1',
        nombre: 'Solo',
        slug: 'solo',
        descripcion: null,
        fecha_apertura: '2026-09-01T00:00:00.000Z',
        fecha_cierre: '2026-12-15T00:00:00.000Z',
        estado: 'borrador',
        created_by_persona_id: 'p-1',
        created_at: '2026-08-16T00:00:00.000Z',
        updated_at: '2026-08-16T00:00:00.000Z',
        version: 1,
        participantes_count: 1,
      },
    ])
    const html = await renderToString(EdicioneGlobalesIndexPage)
    expect(html).toMatch(/1 taller\b/)
    expect(html).not.toMatch(/1 talleres/)
  })
})