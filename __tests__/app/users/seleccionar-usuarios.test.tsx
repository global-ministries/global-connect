/**
 * /users "Seleccionar" mode (S13 decision 3): the bulk role change stays
 * admin-only, as today, but moves behind an explicit mode with a bottom bar
 * and a confirmation. In the mode a row tap marks the person; outside it a
 * row tap always opens the panel. The change goes to /api/usuarios/cambiar-rol
 * with the marked ids, then the list reloads and the mode ends.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { aEstadisticas, aPersonas, FILTROS_INICIALES, type FilaUsuarioRpc } from '@/lib/platform/usuarios/lista-vista'

const mockReplace = jest.fn()
const mockRecargar = jest.fn()
let mockRoles: string[] = ['admin']

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/users',
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ roles: mockRoles, authUserId: 'auth-1', usuario: { id: 'yo' } }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null, campusActivo: null }) }))
jest.mock('@/components/users/vinculos-pendientes-card', () => ({ VinculosPendientesCard: () => null }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: async () => ({ data: false, error: null }) }) }))
jest.mock('@/components/forms/UserCreateForm', () => function UserCreateForm() {
  return null
})
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal }: { accionPrincipal?: React.ReactNode }) => <header>{accionPrincipal}</header>,
}))

const rpcFila = (cambios: Partial<FilaUsuarioRpc>): FilaUsuarioRpc => ({
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: null, telefono: null, cedula: null,
  fecha_registro: '2021-03-14T12:00:00Z', rol_nombre_interno: 'miembro', rol_nombre_visible: 'Miembro',
  foto_perfil_url: null, total_count: 2, puede_ver: true, cuenta: 'si', grupo_id: null,
  grupo_nombre: null, campus_nombre: null, es_de_mi_grupo: false, ...cambios,
})

jest.mock('@/components/users/lista/use-lista-usuarios', () => ({
  useListaUsuarios: () => ({
    personas: mockPersonas,
    total: 2,
    estadisticas: mockStats,
    cargando: false,
    error: null,
    recargar: mockRecargar,
  }),
}))
const mockPersonas = aPersonas([rpcFila({}), rpcFila({ id: 'u-2', nombre: 'Luis', apellido: 'Barrios' })])
const mockStats = aEstadisticas({ total_usuarios: 2 })

import { UsuariosClient } from '@/components/users/lista/usuarios-client'

const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['admin']
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

async function entrar() {
  const user = userEvent.setup()
  render(<UsuariosClient filtrosIniciales={FILTROS_INICIALES} />)
  const boton = screen.getByRole('button', { name: 'Seleccionar' })
  expect(boton).toHaveAttribute('aria-pressed', 'false')
  await user.click(boton)
  expect(boton).toHaveAttribute('aria-pressed', 'true')
  return user
}

const barra = () => screen.getByRole('region', { name: 'Personas seleccionadas' })

describe('/users Seleccionar', () => {
  it('outside the mode there is no bar and a row opens the panel', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={FILTROS_INICIALES} />)

    expect(screen.queryByRole('region', { name: 'Personas seleccionadas' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir Ana Pérez' }))
    expect(await screen.findByRole('dialog', { name: 'Ana Pérez' })).toBeInTheDocument()
  })

  it('in the mode a row tap marks the person instead of opening the panel', async () => {
    const user = await entrar()

    expect(screen.getByText('Marca a las personas para cambiar su rol')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar persona' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seleccionar a Ana Pérez' }))

    expect(screen.queryByRole('dialog', { name: 'Ana Pérez' })).toBeNull()
    expect(within(barra()).getByText('seleccionada', { exact: false })).toHaveTextContent('1 seleccionada')
    await user.click(screen.getByRole('button', { name: 'Quitar de la selección a Ana Pérez' }))
    expect(within(barra()).getByText('seleccionadas', { exact: false })).toHaveTextContent('0 seleccionadas')
    expect(within(barra()).getByRole('button', { name: 'Cambiar rol' })).toBeDisabled()
  })

  it('"Toda la página" marks every row; a second tap clears them', async () => {
    const user = await entrar()

    await user.click(within(barra()).getByRole('button', { name: 'Toda la página' }))
    expect(barra()).toHaveTextContent('2 seleccionadas')
    await user.click(within(barra()).getByRole('button', { name: 'Quitar la página' }))
    expect(barra()).toHaveTextContent('0 seleccionadas')
  })

  it('"Cambiar rol" asks first, then changes the marked people, reloads and leaves the mode', async () => {
    const user = await entrar()
    await user.click(within(barra()).getByRole('button', { name: 'Toda la página' }))
    await user.selectOptions(within(barra()).getByRole('combobox', { name: 'Nuevo rol' }), 'lider')
    await user.click(within(barra()).getByRole('button', { name: 'Cambiar rol' }))

    const dialogo = await screen.findByRole('alertdialog', { name: 'Cambiar rol' })
    expect(dialogo).toHaveTextContent('¿Cambiar el rol de 2 personas a «Líder»? Cambia lo que pueden ver y editar.')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar rol' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/usuarios/cambiar-rol', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['u-1', 'u-2'], rol: 'lider' }),
    })
    expect(mockRecargar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Personas seleccionadas' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Seleccionar' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Rol actualizado para 2 personas')).toBeInTheDocument()
  })

  it('a refused change keeps the dialog, the selection and says why', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'No autorizado' }) })
    const user = await entrar()
    await user.click(screen.getByRole('button', { name: 'Seleccionar a Luis Barrios' }))
    await user.click(within(barra()).getByRole('button', { name: 'Cambiar rol' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Cambiar rol' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar rol' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No autorizado')
    expect(mockRecargar).not.toHaveBeenCalled()
    expect(barra()).toHaveTextContent('1 seleccionada')
  })

  it('"Cancelar" leaves the mode and forgets the selection', async () => {
    const user = await entrar()
    await user.click(screen.getByRole('button', { name: 'Seleccionar a Ana Pérez' }))
    await user.click(within(barra()).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('region', { name: 'Personas seleccionadas' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir Ana Pérez' })).toBeInTheDocument()
  })

  it('on phones the filters sheet enters the mode', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={FILTROS_INICIALES} />)

    await user.click(screen.getAllByRole('button', { name: 'Filtros' })[0])
    await user.click(await screen.findByRole('button', { name: 'Seleccionar personas' }))
    expect(screen.getByRole('region', { name: 'Personas seleccionadas' })).toBeInTheDocument()
  })

  it.each([['pastor'], ['director-general'], ['director-etapa'], ['lider']])('%s has no selection mode, not even in the sheet', async (rol) => {
    const user = userEvent.setup()
    mockRoles = [rol]
    render(<UsuariosClient filtrosIniciales={FILTROS_INICIALES} />)

    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Filtros' })[0])
    await screen.findByRole('dialog', { name: 'Filtros' })
    expect(screen.queryByRole('button', { name: 'Seleccionar personas' })).toBeNull()
  })
})
