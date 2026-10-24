/**
 * Configuración and Administración pages adopt PaginaSistema
 * (docs/design-system.md): every page, settings forms included, uses the
 * full content width (the 768px form cap is deprecated).
 */
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ select: () => ({ limit: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
jest.mock('@/lib/getUserWithRoles', () => ({
  getUserWithRoles: async () => ({ user: { id: 'u1' }, roles: ['admin'], platformSession: null }),
}))
jest.mock('@/lib/platform/routeGuard', () => ({ checkPlatformRouteAccess: () => ({ allowed: true }) }))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
jest.mock('@/app/(auth)/configuracion/ConfiguracionGlobalClient', () => ({
  ConfiguracionGlobalClient: () => <form aria-label="Configuración global" />,
}))

import PaginaConfiguracion from '@/app/(auth)/configuracion/page'
import LoadingServidores from '@/app/(auth)/admin/dream-team/servidores/loading'

function anchoDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')?.getAttribute('data-ancho')
}

describe('Configuración and Administración page widths', () => {
  it('Configuración uses the full content width', async () => {
    render((await PaginaConfiguracion()) as ReactElement)
    expect(anchoDe(screen.getByRole('form', { name: 'Configuración global' }))).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
  })

  it('the Servidores loading skeleton keeps the full content width', async () => {
    const { container } = render(<LoadingServidores />)
    expect(container.querySelector('[data-ancho]')?.getAttribute('data-ancho')).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Servidores' })).toBeInTheDocument()
  })
})
