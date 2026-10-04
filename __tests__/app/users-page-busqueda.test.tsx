/**
 * /users page: the search is "type first, then search". Typing only edits a
 * local draft; the search runs when the person confirms (Enter or the
 * "Buscar" button) and the confirmed text is applied through
 * `actualizarFiltros({ busqueda })`.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const actualizarFiltros = jest.fn()
const limpiarFiltros = jest.fn()

type FiltrosMock = {
  busqueda: string
  roles: string[]
  con_email: boolean | null
  con_telefono: boolean | null
  en_grupo: boolean | null
  limite: number
}

function estadoDelHook(overrides: { busqueda?: string; cargando?: boolean } = {}) {
  const filtros: FiltrosMock = {
    busqueda: overrides.busqueda ?? '',
    roles: [],
    con_email: null,
    con_telefono: null,
    en_grupo: null,
    limite: 20,
  }
  return {
    usuarios: [
      {
        id: 'u-1',
        nombre: 'Ana',
        apellido: 'Pérez',
        email: 'ana@example.com',
        telefono: null,
        cedula: null,
        fecha_registro: '2026-01-01',
        rol_nombre_interno: 'miembro',
        rol_nombre_visible: 'Miembro',
        puede_ver: true,
        foto_perfil_url: null,
      },
    ],
    estadisticas: { total_usuarios: 1, con_email: 1, con_telefono: 0, registrados_hoy: 0 },
    cargando: overrides.cargando ?? false,
    filtros,
    paginaActual: 1,
    totalPaginas: 1,
    actualizarFiltros,
    recargarDatos: jest.fn(),
    limpiarFiltros,
    cambiarPagina: jest.fn(),
  }
}

let hookState = estadoDelHook()

// The pending-links card loads through a server action; it has its own tests.
jest.mock('@/components/users/vinculos-pendientes-card', () => ({ VinculosPendientesCard: () => null }))
jest.mock('@/hooks/use-usuarios-con-permisos', () => ({
  useUsuariosConPermisos: () => hookState,
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ roles: ['miembro'] }),
}))
jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({ campusId: null }),
}))
// ContenedorDashboard lazy-loads its header behind Suspense — synchronous test double.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

import PaginaUsuarios from '@/app/(auth)/users/page'

const cajaDeBusqueda = () => screen.getByRole('textbox', { name: 'Buscar usuarios' }) as HTMLInputElement
const botonBuscar = () => screen.getByRole('button', { name: 'Buscar' })

beforeEach(() => {
  jest.clearAllMocks()
  hookState = estadoDelHook()
})

describe('/users search box', () => {
  it('renders a named search box with a submit "Buscar" button in one form', () => {
    render(<PaginaUsuarios />)

    const caja = cajaDeBusqueda()
    expect(caja).toHaveAttribute('placeholder', 'Buscar por nombre, email, cédula...')
    expect(botonBuscar()).toHaveAttribute('type', 'submit')
    expect(caja.closest('form')).toBe(botonBuscar().closest('form'))
    expect(caja.closest('form')).not.toBeNull()
  })

  it('starts with the applied search text', () => {
    hookState = estadoDelHook({ busqueda: 'ana' })
    render(<PaginaUsuarios />)

    expect(cajaDeBusqueda()).toHaveValue('ana')
  })

  it('does not search while typing', async () => {
    const user = userEvent.setup()
    render(<PaginaUsuarios />)

    await user.type(cajaDeBusqueda(), 'ana perez')

    expect(cajaDeBusqueda()).toHaveValue('ana perez')
    expect(actualizarFiltros).not.toHaveBeenCalled()
  })

  it('applies the trimmed text once when pressing Enter', async () => {
    const user = userEvent.setup()
    render(<PaginaUsuarios />)

    await user.type(cajaDeBusqueda(), '  ana  {Enter}')

    expect(actualizarFiltros).toHaveBeenCalledTimes(1)
    expect(actualizarFiltros).toHaveBeenCalledWith({ busqueda: 'ana' })
    expect(cajaDeBusqueda()).toHaveValue('ana')
  })

  it('applies the text when clicking "Buscar"', async () => {
    const user = userEvent.setup()
    render(<PaginaUsuarios />)

    await user.type(cajaDeBusqueda(), 'maria')
    expect(actualizarFiltros).not.toHaveBeenCalled()
    await user.click(botonBuscar())

    expect(actualizarFiltros).toHaveBeenCalledTimes(1)
    expect(actualizarFiltros).toHaveBeenCalledWith({ busqueda: 'maria' })
  })

  it('clears the search when confirming an empty box', async () => {
    const user = userEvent.setup()
    hookState = estadoDelHook({ busqueda: 'ana' })
    render(<PaginaUsuarios />)

    await user.clear(cajaDeBusqueda())
    expect(actualizarFiltros).not.toHaveBeenCalled()
    await user.click(botonBuscar())

    expect(actualizarFiltros).toHaveBeenCalledTimes(1)
    expect(actualizarFiltros).toHaveBeenCalledWith({ busqueda: '' })
  })

  it('does not search again when confirming the text that is already applied', async () => {
    const user = userEvent.setup()
    hookState = estadoDelHook({ busqueda: 'ana' })
    render(<PaginaUsuarios />)

    await user.click(botonBuscar())
    await user.type(cajaDeBusqueda(), '  {Enter}')

    expect(actualizarFiltros).not.toHaveBeenCalled()
  })

  it('does not search when confirming an empty box and nothing is applied', async () => {
    const user = userEvent.setup()
    render(<PaginaUsuarios />)

    await user.type(cajaDeBusqueda(), '   {Enter}')
    await user.click(botonBuscar())

    expect(actualizarFiltros).not.toHaveBeenCalled()
  })

  it('empties the box when "Limpiar Filtros" is clicked', async () => {
    const user = userEvent.setup()
    hookState = estadoDelHook({ busqueda: 'ana' })
    render(<PaginaUsuarios />)

    await user.type(cajaDeBusqueda(), ' perez')
    expect(cajaDeBusqueda()).toHaveValue('ana perez')
    await user.click(screen.getByRole('button', { name: 'Limpiar Filtros' }))

    expect(limpiarFiltros).toHaveBeenCalledTimes(1)
    expect(cajaDeBusqueda()).toHaveValue('')
  })

  it('keeps the draft through the loading skeleton', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PaginaUsuarios />)
    await user.type(cajaDeBusqueda(), 'ana')

    hookState = estadoDelHook({ cargando: true })
    rerender(<PaginaUsuarios />)
    // The whole page, input included, is replaced by the skeleton while loading.
    expect(screen.queryByRole('textbox', { name: 'Buscar usuarios' })).toBeNull()

    hookState = estadoDelHook({ cargando: false })
    rerender(<PaginaUsuarios />)
    expect(cajaDeBusqueda()).toHaveValue('ana')
  })

  it('follows the applied value when it changes from outside', () => {
    const { rerender } = render(<PaginaUsuarios />)
    expect(cajaDeBusqueda()).toHaveValue('')

    hookState = estadoDelHook({ busqueda: 'maria' })
    rerender(<PaginaUsuarios />)
    expect(cajaDeBusqueda()).toHaveValue('maria')

    hookState = estadoDelHook({ busqueda: '' })
    rerender(<PaginaUsuarios />)
    expect(cajaDeBusqueda()).toHaveValue('')
  })
})
