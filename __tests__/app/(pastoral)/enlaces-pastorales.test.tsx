/**
 * Pastoral links must point at routes that exist.
 *
 * The 1:1 detail lives under app/(pastoral)/lider/uno-auno/[id]; there is no
 * /lider/uno-a-uno route and no /pastor/lecturas/[id] page, and the API
 * route /api/pastoral/one-on-one only accepts POST.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
}))

jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TarjetaSistema: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TituloSistema: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SkeletonSistema: () => <div />,
}))

jest.mock('@/components/pastoral/OneOnOneCard', () => ({
  OneOnOneCard: ({ id, href }: { id: string; href: string }) => (
    <a data-testid={`card-${id}`} href={href}>{id}</a>
  ),
}))

jest.mock('@/components/pastoral/CrisisAlertBanner', () => ({
  CrisisAlertBanner: () => null,
}))

jest.mock('@/lib/platform/pastoral/flags', () => ({
  isPastoralEnabled: () => true,
}))

jest.mock('@/lib/platform/pastoral/route-access', () => ({
  requirePastoralSession: async () => ({ personaId: 'persona-mentor', capabilities: [] }),
  hasPastoralOneOnOneReadCapability: () => true,
  hasPastoralReadAllCapability: () => true,
}))

jest.mock('@/lib/platform/pastoral/hierarchical-visibility', () => ({
  getPersonasUnderMe: async () => ['persona-asistida'],
  visiblePersonaIdsOrNone: (ids: readonly string[]) => ids,
}))

const SESSION_ROW = {
  id: 'sesion-1',
  estado: 'scheduled',
  scheduled_at: '2026-10-20T15:00:00.000Z',
  completed_at: null,
  pastoral_one_on_one_participantes: [{ persona_id: 'persona-asistida' }],
}

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      query[method] = () => query
    }
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [SESSION_ROW], error: null }).then(resolve)
    return { from: () => query }
  },
}))

describe('pastoral links', () => {
  it('lider dashboard links each upcoming 1:1 to the uno-auno detail route', async () => {
    const { default: LiderDashboardClient } = await import('@/app/(pastoral)/lider/LiderDashboardClient')
    render(
      <LiderDashboardClient
        unoAunos={[{ id: 'sesion-1', estado: 'scheduled', scheduledAtIso: null, assistedPersonaName: 'Ana', pasosValidadosCount: 0 }]}
        crisisAlerts={[]}
      />,
    )
    expect(screen.getByTestId('card-sesion-1')).toHaveAttribute('href', '/lider/uno-auno/sesion-1')
  })

  it('lider 1:1 list does not link to the POST-only API route', async () => {
    const { default: LiderUnoAUnoListPage } = await import('@/app/(pastoral)/lider/uno-auno/page')
    const { container } = render(await LiderUnoAUnoListPage())
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs.some((href) => href?.startsWith('/api/'))).toBe(false)
    expect(screen.getByTestId('card-sesion-1')).toHaveAttribute('href', '/lider/uno-auno/sesion-1')
  })

  it('pastor lecturas links each 1:1 to the existing detail page', async () => {
    const { default: PastorLecturasPage } = await import('@/app/(pastoral)/pastor/lecturas/page')
    render(await PastorLecturasPage())
    expect(screen.getByTestId('card-sesion-1')).toHaveAttribute('href', '/lider/uno-auno/sesion-1')
  })
})
