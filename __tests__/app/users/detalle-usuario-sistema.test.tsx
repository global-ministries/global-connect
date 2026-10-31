/**
 * /users/[id] on the design system (rewritten for the v2 ficha, S13): every
 * action keeps an accessible name (icon-only ones included), the quick actions
 * are single links to their pages, and the trash button opens the delete
 * confirmation. The Asistencia link became a tab and the 404 links "Ver
 * Familia" / "Ruta de Crecimiento" are gone.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/users/u-1',
}))
jest.mock('@/lib/actions/user.actions', () => ({ deleteFamilyRelation: jest.fn() }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/components/modals/AgregarFamiliarModal', () => ({ AgregarFamiliarModal: () => null }))
jest.mock('@/components/modals/SetPasswordModal', () => ({ SetPasswordModal: () => null }))
jest.mock('@/components/modals/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title }: { isOpen: boolean; title: string }) => (isOpen ? <div role="alertdialog">{title}</div> : null),
}))
jest.mock('@/components/cuentas/invitar-cuenta-panel', () => ({
  useEstadoInvitacion: () => ({ estado: null, error: null, recargar: jest.fn() }),
  InvitarCuentaPanel: () => null,
  fechaInvitacion: () => '',
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

import { FichaUsuario } from '@/components/users/ficha/ficha-usuario'

const persona = {
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', cedula: 'V-1', email: 'ana@example.com', telefono: '04141234567',
  fechaNacimiento: null, fechaRegistro: '2026-01-01', estadoCivil: 'Soltero', genero: 'Femenino', fotoUrl: null,
  ocupacion: null, profesion: null, direccion: null, rol: { interno: 'lider', etiqueta: 'Líder' },
  relaciones: [
    {
      id: 'rel-1', tipo_relacion: 'hermano', es_principal: false, sentido: 'directo' as const,
      familiar: { id: 'u-3', nombre: 'Luis', apellido: 'Pérez', email: null, telefono: null, genero: 'Masculino', foto_perfil_url: null },
    },
  ],
}

function renderizar(tab: 'datos' | 'familia' = 'datos') {
  return render(
    <FichaUsuario
      persona={persona}
      resumen={{ cuenta: 'si', campus: 'Barquisimeto', esDeMiGrupo: false, grupoActual: null }}
      puedeEditar
      visor={{ roles: ['admin'], usuarioId: 'u-9' }}
      tabInicial={tab}
      asistencia={null}
      grupos={[]}
      servicios={[]}
    />,
  )
}

describe('/users/[id] on the design system', () => {
  it('names every action, icon-only ones included', () => {
    renderizar('familia')
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control).toHaveAccessibleName()
    }
  })

  it('renders the quick actions as single links to their pages', () => {
    renderizar()
    const editar = screen.getAllByRole('link', { name: /Editar/ })
    expect(editar.length).toBeGreaterThan(0)
    for (const link of editar) {
      expect(link).toHaveAttribute('href', '/users/u-1/edit')
      expect(within(link).queryByRole('link')).not.toBeInTheDocument()
    }
    expect(screen.getAllByRole('link', { name: /Llamar/ })[0]).toHaveAttribute('href', expect.stringMatching(/^tel:/))
    expect(screen.getByRole('tab', { name: 'Asistencia' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ver Familia|Ruta de Crecimiento/ })).not.toBeInTheDocument()
  })

  it('opens the delete confirmation from the labelled trash button', async () => {
    const user = userEvent.setup()
    renderizar('familia')
    await user.click(screen.getByRole('button', { name: 'Quitar relación con Luis Pérez' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Confirmar Eliminación')
  })
})
