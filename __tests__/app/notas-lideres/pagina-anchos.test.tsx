/**
 * Notas de líderes adopts PaginaSistema (docs/design-system.md): a list, so
 * it keeps the full content width.
 */
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async () => ({
      data: [
        {
          evento_id: 'e1',
          grupo_id: 'g1',
          grupo_nombre: 'Grupo Norte',
          fecha: '2026-10-01',
          hora: '19:00',
          tema: 'Fe',
          notas: 'Buena reunión',
          lider_nombre: 'Ana',
          presentes: 5,
          total: 8,
        },
      ],
      error: null,
    }),
  }),
}))

import PaginaNotasLideres from '@/app/(auth)/notas-lideres/page'

describe('Notas de líderes page width', () => {
  it('keeps the full content width and links each note to its attendance', async () => {
    render((await PaginaNotasLideres()) as ReactElement)
    const enlace = screen.getByRole('link', { name: /Grupo Norte/ })
    expect(enlace).toHaveAttribute('href', '/grupos-vida/g1/asistencia/e1')
    expect(enlace.closest('[data-ancho]')?.getAttribute('data-ancho')).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Notas de Líderes' })).toBeInTheDocument()
  })
})
