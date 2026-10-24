/**
 * Grupos de Vida pages adopt PaginaSistema (docs/design-system.md): every page,
 * forms included, uses the full content width, and the description is rendered
 * above the content.
 */
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
jest.mock('@/lib/getUserWithRoles', () => ({
  getUserWithRoles: async () => ({ user: { id: 'u1' }, roles: ['admin'] }),
}))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
jest.mock('@/lib/actions/configuracion-grupos-vida.actions', () => ({
  obtenerConfiguracionGrupos: async () => ({ success: true, data: null }),
}))
jest.mock('@/components/grupos-vida/configuracion-panel', () => ({
  ConfiguracionPanel: () => <form aria-label="Configuración de grupos" />,
}))
jest.mock('@/lib/actions/solicitudes-grupo.actions', () => ({
  listarSolicitudesPendientes: async () => ({ success: true, data: [] }),
  listarSolicitudesCompletadas: async () => ({ success: true, data: [] }),
}))
jest.mock('@/app/(auth)/grupos-vida/solicitudes/SolicitudesPendientesClient', () => ({
  SolicitudesPendientesClient: () => <ul aria-label="Solicitudes" />,
}))

import ConfiguracionPage from '@/app/(auth)/grupos-vida/configuracion/page'
import SolicitudesPage from '@/app/(auth)/grupos-vida/solicitudes/page'

function anchoDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')?.getAttribute('data-ancho')
}

describe('Grupos de Vida page widths', () => {
  it('Configuración uses the full content width and shows its description', async () => {
    render((await ConfiguracionPage()) as ReactElement)
    expect(anchoDe(screen.getByRole('form', { name: 'Configuración de grupos' }))).toBe('default')
    expect(screen.getByText('Ajustes generales del módulo de grupos de vida')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
  })

  it('Solicitudes keeps the full content width', async () => {
    render((await SolicitudesPage()) as ReactElement)
    expect(anchoDe(screen.getByRole('list', { name: 'Solicitudes' }))).toBe('default')
    expect(screen.getByText('Gestiona las solicitudes de grupos de vida')).toBeInTheDocument()
  })
})
