/**
 * /users/[id] on the design system: the icon-only actions keep an accessible
 * name (Asistencia, Editar, Llamar, remove a relation) and the quick actions
 * are single links to their pages.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const usuario = {
  id: 'u-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  email: 'ana@example.com',
  telefono: '04141234567',
  cedula: 'V-1',
  fecha_registro: '2026-01-01',
  fecha_nacimiento: null,
  estado_civil: 'Soltero',
  genero: 'Femenino',
  roles: [{ nombre_visible: 'Líder', nombre_interno: 'lider' }],
  direccion: null,
  relaciones: [
    {
      id: 'rel-1',
      tipo_relacion: 'hermano',
      es_principal: false,
      sentido: 'directo',
      familiar: { nombre: 'Luis', apellido: 'Pérez', email: null, telefono: null, genero: 'Masculino', foto_perfil_url: null },
    },
  ],
}

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'u-1' }) }))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    rpc: (nombre: string) => {
      if (nombre === 'puede_editar_usuario') return Promise.resolve({ data: true, error: null })
      return { single: async () => ({ data: usuario, error: null }) }
    },
  }),
}))
jest.mock('@/lib/actions/user.actions', () => ({ deleteFamilyRelation: jest.fn() }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ roles: ['admin'] }) }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/components/modals/AgregarFamiliarModal', () => ({ AgregarFamiliarModal: () => null }))
jest.mock('@/components/modals/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title }: { isOpen: boolean; title: string }) => (isOpen ? <div role="alertdialog">{title}</div> : null),
}))
jest.mock('@/components/cuentas/invitar-cuenta-panel', () => ({ InvitarCuentaBoton: () => null }))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

import PaginaDetalleUsuario from '@/app/(auth)/users/[id]/page'

describe('/users/[id] on the design system', () => {
  it('names every icon-only action', async () => {
    render(<PaginaDetalleUsuario />)

    expect(await screen.findByRole('link', { name: 'Asistencia' })).toHaveAttribute('href', '/users/u-1/asistencia')
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/users/u-1/edit')
    expect(screen.getByRole('link', { name: 'Llamar a Ana Pérez' })).toHaveAttribute('href', expect.stringMatching(/^tel:/))
  })

  it('opens the delete confirmation from the labelled trash button', async () => {
    const user = userEvent.setup()
    render(<PaginaDetalleUsuario />)

    await user.click(await screen.findByRole('button', { name: 'Eliminar relación con Luis Pérez' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Confirmar Eliminación')
  })

  it('renders the quick actions as links to their pages', async () => {
    render(<PaginaDetalleUsuario />)

    expect(await screen.findByRole('link', { name: /Editar Perfil/ })).toHaveAttribute('href', '/users/u-1/edit')
    expect(screen.getByRole('link', { name: /Ver Familia/ })).toHaveAttribute('href', '/users/u-1/familia')
    expect(screen.getByRole('link', { name: /Ruta de Crecimiento/ })).toHaveAttribute('href', '/users/u-1/ruta-crecimiento')
  })
})
