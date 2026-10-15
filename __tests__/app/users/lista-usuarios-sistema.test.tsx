/**
 * /users on the design system: labelled row checkboxes, the bulk role change
 * reachable on mobile (inline) as well as in the desktop header, and the
 * "Agregar Miembro" call to action as a single link.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/components/users/vinculos-pendientes-card', () => ({ VinculosPendientesCard: () => null }))
jest.mock('@/hooks/use-usuarios-con-permisos', () => ({
  useUsuariosConPermisos: () => ({
    usuarios: [
      {
        id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.com', telefono: null,
        cedula: null, fecha_registro: '2026-01-01', rol_nombre_interno: 'miembro',
        rol_nombre_visible: 'Miembro', puede_ver: true, foto_perfil_url: null,
      },
    ],
    estadisticas: { total_usuarios: 1, con_email: 1, con_telefono: 0, registrados_hoy: 0 },
    cargando: false,
    filtros: { busqueda: '', roles: [], con_email: null, con_telefono: null, en_grupo: null, limite: 20 },
    paginaActual: 1,
    totalPaginas: 1,
    actualizarFiltros: jest.fn(),
    recargarDatos: jest.fn(),
    limpiarFiltros: jest.fn(),
    cambiarPagina: jest.fn(),
  }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ roles: ['admin'] }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal }: { titulo?: string; accionPrincipal?: React.ReactNode }) => (
    <header data-testid="encabezado">
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))

import PaginaUsuarios from '@/app/(auth)/users/page'

describe('/users on the design system', () => {
  it('labels row checkboxes and offers the role change in the header and inline', async () => {
    const user = userEvent.setup()
    render(<PaginaUsuarios />)

    // Mobile and desktop rows each carry a labelled checkbox.
    const casillas = screen.getAllByRole('checkbox', { name: 'Seleccionar a Ana Pérez' })
    expect(casillas).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Cambiar Rol/ })).toBeNull()

    await user.click(casillas[0])

    const botones = screen.getAllByRole('button', { name: 'Cambiar Rol (1)' })
    expect(botones).toHaveLength(2)
    expect(within(screen.getByTestId('encabezado')).getByRole('combobox', { name: 'Nuevo rol' })).toBeInTheDocument()
  })

  it('renders "Agregar Miembro" as one link to the create page', () => {
    render(<PaginaUsuarios />)

    const enlace = screen.getByRole('link', { name: /Agregar Miembro/ })
    expect(enlace).toHaveAttribute('href', '/users/create')
    // BotonSistema asChild renders the link itself: one tab stop, no nested button.
    expect(within(enlace).queryByRole('button', { hidden: true })).not.toBeInTheDocument()
  })
})
