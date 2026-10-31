/**
 * /users on design system v2 (T8-2, S13 of odd/tasks/sistema-diseno-v2.md;
 * prototype docs/design-system/prototipos/usuarios/01-lista-escritorio.html):
 * hero with the real totals, the attention metrics as filters, the filters
 * in the URL (`replace`), one row per person with the account state, the
 * person panel on tap, "Agregar persona" for the roles that add people (as
 * today's "Agregar Miembro"), the skeleton inside the kept frame, the two
 * empty states and the pagination 20/50/100.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { aEstadisticas, aPersonas, FILTROS_INICIALES, type FilaUsuarioRpc, type FiltrosUsuarios } from '@/lib/platform/usuarios/lista-vista'

const mockReplace = jest.fn()
const mockRecargar = jest.fn()
const mockHook = jest.fn()
let mockRoles: string[] = ['admin']
let mockCampus: { campusId: string | null; campusActivo: { nombre: string } | null } = { campusId: null, campusActivo: null }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/users',
}))
jest.mock('@/components/users/lista/use-lista-usuarios', () => ({ useListaUsuarios: (o: unknown) => mockHook(o) }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ roles: mockRoles, authUserId: 'auth-1', usuario: { id: 'yo' } }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => mockCampus }))
jest.mock('@/components/users/vinculos-pendientes-card', () => ({ VinculosPendientesCard: () => null }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: async () => ({ data: false, error: null }) }) }))
jest.mock('@/components/forms/UserCreateForm', () => function UserCreateForm() {
  return <form aria-label="Nueva persona" />
})
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header data-testid="encabezado">
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

import { UsuariosClient } from '@/components/users/lista/usuarios-client'

const rpcFila = (cambios: Partial<FilaUsuarioRpc> = {}): FilaUsuarioRpc => ({
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.com', telefono: '04145550101', cedula: '18456789',
  fecha_registro: '2021-03-14T12:00:00Z', rol_nombre_interno: 'lider', rol_nombre_visible: 'Líder',
  foto_perfil_url: null, total_count: 41, puede_ver: true, cuenta: 'invitada', grupo_id: 'g-1',
  grupo_nombre: 'Familias Unidas', campus_nombre: 'Barquisimeto', es_de_mi_grupo: false, ...cambios,
})

const STATS = aEstadisticas({
  total_usuarios: 148, con_email: 123, con_telefono: 132, registrados_hoy: 1,
  nuevos_7d: 8, sin_grupo: 62, sin_cuenta: 44, sin_telefono: 16, invitadas: 9,
})

function datos(cambios: Record<string, unknown> = {}) {
  mockHook.mockReturnValue({
    personas: aPersonas([rpcFila(), rpcFila({ id: 'u-2', nombre: 'Luis', apellido: 'Barrios', cuenta: 'no', grupo_nombre: null, rol_nombre_interno: 'miembro' })]),
    total: 41,
    estadisticas: STATS,
    cargando: false,
    error: null,
    recargar: mockRecargar,
    ...cambios,
  })
}

const f = (cambios: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ ...FILTROS_INICIALES, ...cambios })
const ultimoHook = () => mockHook.mock.calls.at(-1)?.[0] as { filtros: FiltrosUsuarios; limite: number; campusId: string | null }

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['admin']
  mockCampus = { campusId: null, campusActivo: null }
  datos()
})

describe('/users list', () => {
  it('hero: "Usuarios" and the real totals of the scope; crumb "Usuarios"', async () => {
    mockCampus = { campusId: 'c-1', campusActivo: { nombre: 'Barquisimeto' } }
    render(<UsuariosClient filtrosIniciales={f()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument()
    expect(screen.getAllByText('personas · Campus Barquisimeto · 132 con teléfono · 123 con email').length).toBeGreaterThan(0)
    // PaginaSistema lazy-loads the desktop header behind Suspense.
    expect(within(await screen.findByTestId('encabezado')).getByText('Usuarios')).toHaveAttribute('aria-current', 'page')
    expect(ultimoHook()).toEqual({ filtros: f(), campusId: 'c-1', limite: 20 })
  })

  it('the four attention metrics are filters that live in the URL', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    const metricas = within(screen.getByRole('group', { name: 'Requiere atención' }))
    expect(metricas.getAllByRole('button')).toHaveLength(4)
    expect(metricas.getByText('9 con invitación enviada')).toBeInTheDocument()
    await user.click(metricas.getByRole('button', { name: /Sin grupo/ }))

    expect(mockReplace).toHaveBeenLastCalledWith('/users?grupo=0', { scroll: false })
    expect(ultimoHook().filtros.enGrupo).toBe(false)
    expect(metricas.getByRole('button', { name: /Sin grupo/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters from the URL show as chips; removing one updates the URL', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f({ conCuenta: false, roles: ['lider'] })} />)

    expect(screen.getByRole('button', { name: /Sin cuenta/, pressed: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar Sin cuenta' }))

    expect(mockReplace).toHaveBeenLastCalledWith('/users?roles=lider', { scroll: false })
    await user.click(screen.getByRole('button', { name: 'Quitar Rol: Líder' }))
    expect(mockReplace).toHaveBeenLastCalledWith('/users', { scroll: false })
  })

  it('a row shows the contact, the neutral role, the group, the campus and the account state', () => {
    render(<UsuariosClient filtrosIniciales={f()} />)

    const tabla = screen.getByRole('table', { name: 'Personas' })
    const fila = within(tabla).getByRole('button', { name: 'Abrir Ana Pérez' }).closest('[role="row"]') as HTMLElement
    expect(within(fila).getByText('V-18.456.789')).toBeInTheDocument()
    expect(within(fila).getByText('0414 555 0101')).toBeInTheDocument()
    expect(within(fila).getByText('ana@example.com')).toBeInTheDocument()
    expect(within(fila).getAllByText('Líder').length).toBeGreaterThan(0)
    expect(within(fila).getByText('Familias Unidas')).toBeInTheDocument()
    expect(within(fila).getByText('Barquisimeto')).toBeInTheDocument()
    expect(within(fila).getByText('Invitación enviada')).toBeInTheDocument()
    const otra = within(tabla).getByRole('button', { name: 'Abrir Luis Barrios' }).closest('[role="row"]') as HTMLElement
    expect(within(otra).getAllByText('Sin cuenta').length).toBeGreaterThan(0)
    expect(within(otra).getByText('Sin grupo')).toBeInTheDocument()
  })

  it('no Campus column once a header campus is chosen', () => {
    mockCampus = { campusId: 'c-1', campusActivo: { nombre: 'Barquisimeto' } }
    render(<UsuariosClient filtrosIniciales={f()} />)
    expect(screen.queryByRole('columnheader', { name: 'Campus' })).toBeNull()
  })

  it('tapping a row opens the person panel and keeps it in the URL', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    await user.click(screen.getByRole('button', { name: 'Abrir Ana Pérez' }))

    const panel = await screen.findByRole('dialog', { name: 'Ana Pérez' })
    expect(within(panel).getByRole('link', { name: 'Ver ficha completa' })).toHaveAttribute('href', '/users/u-1')
    expect(mockReplace).toHaveBeenLastCalledWith('/users?persona=u-1', { scroll: false })
  })

  it('?persona opens that person\'s panel', async () => {
    render(<UsuariosClient filtrosIniciales={f({ persona: 'u-2' })} />)
    expect(await screen.findByRole('dialog', { name: 'Luis Barrios' })).toBeInTheDocument()
  })

  it.each(['admin', 'pastor', 'director-general', 'director-etapa'])('%s gets "Agregar persona" in the header and as the FAB', async (rol) => {
    const user = userEvent.setup()
    mockRoles = [rol]
    render(<UsuariosClient filtrosIniciales={f()} />)

    const botones = screen.getAllByRole('button', { name: 'Agregar persona' })
    expect(botones).toHaveLength(2)
    await user.click(botones[0])
    const panel = await screen.findByRole('dialog', { name: 'Agregar persona' })
    expect(within(panel).getByRole('form', { name: 'Nueva persona' })).toBeInTheDocument()
  })

  it.each([['lider'], ['miembro']])('%s gets no "Agregar persona" and no "Seleccionar"', (rol) => {
    mockRoles = [rol]
    render(<UsuariosClient filtrosIniciales={f()} />)
    expect(screen.queryByRole('button', { name: 'Agregar persona' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
  })

  it('a leader\'s hero names their groups', () => {
    mockRoles = ['lider']
    render(<UsuariosClient filtrosIniciales={f()} />)
    expect(screen.getAllByText('personas de tus grupos · 132 con teléfono · 123 con email').length).toBeGreaterThan(0)
  })

  it('while loading the frame stays and the list shows skeleton rows', () => {
    datos({ cargando: true, personas: [] })
    render(<UsuariosClient filtrosIniciales={f()} />)

    expect(screen.getByRole('searchbox', { name: 'Buscar personas' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('empty campus: says so and points at "Agregar persona"', () => {
    datos({ personas: [], total: 0, estadisticas: aEstadisticas({ total_usuarios: 0 }) })
    mockRoles = ['pastor']
    render(<UsuariosClient filtrosIniciales={f()} />)
    // The summary says it too, and there is nothing to search or measure.
    expect(screen.getAllByText('Todavía no hay personas en este campus').length).toBeGreaterThan(1)
    expect(screen.getByText('Usa «Agregar persona» para registrar a la primera.')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Buscar personas' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Requiere atención' })).toBeNull()
  })

  it('no match: says so and offers "Limpiar todo"', async () => {
    const user = userEvent.setup()
    datos({ personas: [], total: 0 })
    render(<UsuariosClient filtrosIniciales={f({ q: 'zz', nuevos: true })} />)

    expect(screen.getByText('Nadie coincide con la búsqueda o los filtros')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Limpiar todo' })[0])
    expect(mockReplace).toHaveBeenLastCalledWith('/users', { scroll: false })
  })

  it('pagination: range, Siguiente and 20/50/100 per page', async () => {
    const user = userEvent.setup()
    render(<UsuariosClient filtrosIniciales={f()} />)

    expect(screen.getByText('1–2')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(mockReplace).toHaveBeenLastCalledWith('/users?pagina=2', { scroll: false })
    expect(ultimoHook().filtros.pagina).toBe(2)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Mostrar' }), '50')
    expect(ultimoHook()).toEqual(expect.objectContaining({ limite: 50, filtros: expect.objectContaining({ pagina: 1 }) }))
  })

  it('switching the header campus goes back to page 1 and clears the selection; the first load keeps the page', async () => {
    const user = userEvent.setup()
    mockCampus = { campusId: 'c-1', campusActivo: { nombre: 'Barquisimeto' } }
    const { rerender } = render(<UsuariosClient filtrosIniciales={f({ pagina: 3 })} />)
    expect(ultimoHook().filtros.pagina).toBe(3)
    expect(mockReplace).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(screen.getByRole('button', { name: 'Seleccionar a Ana Pérez' }))
    const barra = () => screen.getByRole('region', { name: 'Personas seleccionadas' })
    expect(barra()).toHaveTextContent('1 seleccionada')

    mockCampus = { campusId: 'c-2', campusActivo: { nombre: 'Cabudare' } }
    rerender(<UsuariosClient filtrosIniciales={f({ pagina: 3 })} />)

    expect(ultimoHook()).toEqual({ filtros: f({ pagina: 1 }), campusId: 'c-2', limite: 20 })
    expect(mockReplace).toHaveBeenLastCalledWith('/users', { scroll: false })
    expect(barra()).toHaveTextContent('0 seleccionadas')
  })

  it('a page past the end (?pagina=99) goes to the last page', () => {
    datos({ personas: [], total: 25 })
    render(<UsuariosClient filtrosIniciales={f({ pagina: 99 })} />)

    expect(ultimoHook().filtros.pagina).toBe(2)
    expect(mockReplace).toHaveBeenLastCalledWith('/users?pagina=2', { scroll: false })
  })

  it('the registration date uses the short month ("sept")', () => {
    datos({ personas: aPersonas([rpcFila({ fecha_registro: '2025-09-07T12:00:00Z' })]), total: 1 })
    render(<UsuariosClient filtrosIniciales={f()} />)

    expect(screen.getByRole('table', { name: 'Personas' })).toHaveTextContent('Desde 7 sept 2025')
  })
})
