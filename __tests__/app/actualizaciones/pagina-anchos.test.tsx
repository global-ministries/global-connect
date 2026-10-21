/**
 * Actualizaciones adopts PaginaSistema (docs/design-system.md): the feed uses
 * the full content width with its entries laid out by SeccionesSistema; the
 * role filter chips report their state.
 */
import type { ReactElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
jest.mock('@/lib/getUserWithRoles', () => ({
  getUserWithRoles: async () => ({ user: { id: 'u1' }, roles: ['lider'] }),
}))

import ActualizacionesPage from '@/app/(auth)/actualizaciones/page'

describe('Actualizaciones page width', () => {
  it('uses the full content width and lays the entries out with SeccionesSistema', async () => {
    const { container } = render((await ActualizacionesPage()) as ReactElement)
    const filtro = screen.getByRole('group', { name: 'Filtrar por rol' })
    expect(filtro.closest('[data-ancho]')?.getAttribute('data-ancho')).toBe('default')
    const secciones = container.querySelector('[data-slot="secciones"]')
    expect(secciones).not.toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).every((titulo) => secciones?.contains(titulo))).toBe(true)
    expect(await screen.findByRole('heading', { level: 1, name: 'Actualizaciones' })).toBeInTheDocument()
  })

  it('the role chips are toggle buttons with a touch-sized height', async () => {
    render((await ActualizacionesPage()) as ReactElement)
    const todos = screen.getByRole('button', { name: 'Todos' })
    expect(todos).toHaveAttribute('aria-pressed', 'true')
    expect(todos).toHaveClass('pointer-coarse:h-11')

    const [primerRol] = screen.getAllByRole('button', { pressed: false })
    fireEvent.click(primerRol)
    expect(primerRol).toHaveAttribute('aria-pressed', 'true')
    expect(todos).toHaveAttribute('aria-pressed', 'false')
  })
})
