/**
 * Pastoral pages adopt PaginaSistema (docs/design-system.md): dashboards and
 * lists keep the full content width, the personal roadmap (a single-column
 * detail view) uses the form width.
 */
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/lib/platform/pastoral/flags', () => ({ isPastoralEnabled: () => true }))
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  requirePastoralSession: async () => ({ personaId: 'p1', capabilities: [] }),
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
jest.mock('@/lib/platform/pastoral/hierarchical-visibility', () => ({
  getPersonasUnderMe: async () => ['p1'],
}))
jest.mock('@/lib/platform/pastoral/public-roadmap/load-public-roadmap', () => ({
  loadPublicRoadmap: async () => null,
}))

import PastorDashboardClient from '@/app/(pastoral)/pastor/PastorDashboardClient'
import LiderDashboardClient from '@/app/(pastoral)/lider/LiderDashboardClient'
import UsuariosClient from '@/app/(pastoral)/pastor/usuarios/UsuariosClient'
import AsistidoRoadmapPage from '@/app/(pastoral)/asistido/page'

function anchoDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')?.getAttribute('data-ancho')
}

describe('Pastoral page widths', () => {
  it('the pastor dashboard keeps the full content width', async () => {
    render(
      <PastorDashboardClient
        metrics={{ unoAunoPorPeriodo: 3, lideresActivos: 2, alarmas90dias: 1 }}
        crisisAlerts={[]}
      />,
    )
    expect(anchoDe(screen.getByText('Sesiones 1:1'))).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard Pastoral' })).toBeInTheDocument()
  })

  it('the leader dashboard keeps the full content width', async () => {
    render(<LiderDashboardClient unoAunos={[]} crisisAlerts={[]} />)
    expect(anchoDe(screen.getByText('No tienes sesiones 1:1 programadas.'))).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi Seguimiento Pastoral' })).toBeInTheDocument()
  })

  it('the usuarios list is full width and lists each usuario as a card on mobile', async () => {
    render(
      <UsuariosClient
        error={null}
        usuarios={[
          { id: 'u1', email: 'ana@example.com', nombre: 'Ana', apellido: 'López', auth_id: null, capabilities: [] },
        ]}
      />,
    )
    const listaMovil = screen.getByRole('list')
    expect(listaMovil).toHaveClass('md:hidden')
    expect(anchoDe(listaMovil)).toBe('default')
    expect(within(listaMovil).getByRole('link', { name: 'Gestionar' })).toHaveAttribute('href', '/pastor/grants/u1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestión de Usuarios' })).toBeInTheDocument()
  })

  it('the personal roadmap uses the form width', async () => {
    render((await AsistidoRoadmapPage()) as ReactElement)
    expect(anchoDe(screen.getByText('No pudimos cargar tu roadmap. Intenta más tarde.'))).toBe('form')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi Camino Pastoral' })).toBeInTheDocument()
  })
})
