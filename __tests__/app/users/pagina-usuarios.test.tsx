/**
 * /users server page and loading (T8-2): the page parses the URL into the
 * island's starting filters, so a shared link opens the same view, and the
 * loading skeleton keeps the screen's frame (hero, toolbar, four metrics,
 * six rows).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const mockIsla = jest.fn()
jest.mock('@/components/users/lista/usuarios-client', () => ({
  UsuariosClient: (props: unknown) => {
    mockIsla(props)
    return null
  },
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

import PaginaUsuarios from '@/app/(auth)/users/page'
import LoadingUsuarios from '@/app/(auth)/users/loading'
import { FILTROS_INICIALES } from '@/lib/platform/usuarios/lista-vista'

describe('/users page', () => {
  it('starts the island from the URL', async () => {
    render(await PaginaUsuarios({ searchParams: Promise.resolve({ q: 'ana', grupo: '0', roles: 'lider,raro', orden: 'registro_desc', pagina: '2', persona: 'u-1' }) }))

    expect(mockIsla).toHaveBeenCalledWith({
      filtrosIniciales: { ...FILTROS_INICIALES, q: 'ana', enGrupo: false, roles: ['lider'], orden: 'registro_desc', pagina: 2, persona: 'u-1' },
    })
  })

  it('without a query the island starts from the defaults', async () => {
    render(await PaginaUsuarios())
    expect(mockIsla).toHaveBeenLastCalledWith({ filtrosIniciales: FILTROS_INICIALES })
  })

  it('the loading skeleton keeps the frame', () => {
    render(<LoadingUsuarios />)
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })
})
