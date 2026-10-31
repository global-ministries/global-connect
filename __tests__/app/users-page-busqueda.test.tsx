/**
 * /users page: the search is "type first, then search" (kept from before
 * T8-2). Typing only edits a local draft; the search runs when the person
 * confirms (Enter; on phones the keyboard's search key submits the search form), and the confirmed
 * text goes to the URL (`?q=`) and to the list. The box is the prototype's
 * "Buscar personas" (name, phone, email or cédula); "Enter para buscar" shows
 * while the draft differs from the applied text.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { aEstadisticas, aPersonas, FILTROS_INICIALES, type FiltrosUsuarios } from '@/lib/platform/usuarios/lista-vista'

const mockReplace = jest.fn()
const mockHook = jest.fn()
let mockCargando = false

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/users',
}))
jest.mock('@/components/users/lista/use-lista-usuarios', () => ({
  useListaUsuarios: (o: unknown) => {
    mockHook(o)
    return {
      personas: aPersonas([{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.com', telefono: null, cedula: null, fecha_registro: null, rol_nombre_interno: 'miembro', rol_nombre_visible: 'Miembro', foto_perfil_url: null, total_count: 1, puede_ver: true, cuenta: 'si', grupo_id: null, grupo_nombre: null, campus_nombre: null, es_de_mi_grupo: false }]),
      total: 1,
      estadisticas: aEstadisticas({ total_usuarios: 1 }),
      cargando: mockCargando,
      error: null,
      recargar: jest.fn(),
    }
  },
}))
jest.mock('@/components/users/vinculos-pendientes-card', () => ({ VinculosPendientesCard: () => null }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: async () => ({ data: false, error: null }) }) }))
// The create form pulls server actions; the "Agregar persona" panel has its own test.
jest.mock('@/components/forms/UserCreateForm', () => function UserCreateForm() {
  return null
})
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ roles: ['miembro'], authUserId: 'auth-1', usuario: { id: 'yo' } }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null, campusActivo: null }) }))
// PaginaSistema lazy-loads its desktop header behind Suspense — synchronous test double.
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

import { UsuariosClient } from '@/components/users/lista/usuarios-client'

const f = (cambios: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ ...FILTROS_INICIALES, ...cambios })
const caja = () => screen.getByRole('searchbox', { name: 'Buscar personas' }) as HTMLInputElement
const busquedaAplicada = () => (mockHook.mock.calls.at(-1)?.[0] as { filtros: FiltrosUsuarios }).filtros.q

beforeEach(() => {
  jest.clearAllMocks()
  mockCargando = false
})

describe('/users search box', () => {
  it('renders a named search box inside a search form', () => {
    render(<UsuariosClient filtrosIniciales={f()} />)

    expect(caja()).toHaveAttribute('placeholder', 'Buscar por nombre, teléfono, email o cédula')
    expect(caja().closest('form')).toBe(screen.getByRole('search'))
  })

  it('starts with the applied search text from the URL', () => {
    render(<UsuariosClient filtrosIniciales={f({ q: 'ana' })} />)

    expect(caja()).toHaveValue('ana')
    expect(busquedaAplicada()).toBe('ana')
  })

  it('does not search while typing; it says how to search', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    await user.type(caja(), 'ana perez')

    expect(caja()).toHaveValue('ana perez')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(busquedaAplicada()).toBe('')
    expect(screen.getByText('Enter para buscar')).toBeInTheDocument()
  })

  it('applies the trimmed text once when pressing Enter, back to page 1', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f({ pagina: 3 })} />)

    await user.type(caja(), '  ana  {Enter}')

    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/users?q=ana', { scroll: false })
    expect(busquedaAplicada()).toBe('ana')
    expect(caja()).toHaveValue('ana')
    expect(screen.queryByText('Enter para buscar')).toBeNull()
  })

  it('searches by phone or cédula with the same box', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    await user.type(caja(), '0414 552{Enter}')
    expect(busquedaAplicada()).toBe('0414 552')
  })

  it('clears the search when confirming an empty box', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f({ q: 'ana' })} />)

    await user.clear(caja())
    expect(mockReplace).not.toHaveBeenCalled()
    await user.type(caja(), '{Enter}')

    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/users', { scroll: false })
    expect(busquedaAplicada()).toBe('')
  })

  it('does not search again when confirming the text that is already applied', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f({ q: 'ana' })} />)

    await user.type(caja(), '  {Enter}')

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not search when confirming an empty box and nothing is applied', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    await user.type(caja(), '   {Enter}')

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('empties the box when "Limpiar todo" is clicked', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f({ q: 'ana', conEmail: true })} />)

    await user.type(caja(), ' perez')
    expect(caja()).toHaveValue('ana perez')
    await user.click(screen.getAllByRole('button', { name: 'Limpiar todo' })[0])

    expect(mockReplace).toHaveBeenLastCalledWith('/users', { scroll: false })
    expect(caja()).toHaveValue('')
    expect(busquedaAplicada()).toBe('')
  })

  it('keeps the box and its draft while the list loads (the frame stays)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<UsuariosClient filtrosIniciales={f()} />)
    await user.type(caja(), 'ana')

    mockCargando = true
    rerender(<UsuariosClient filtrosIniciales={f()} />)
    expect(caja()).toHaveValue('ana')

    mockCargando = false
    rerender(<UsuariosClient filtrosIniciales={f()} />)
    expect(caja()).toHaveValue('ana')
  })
})
