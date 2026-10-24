/**
 * Grupos de Vida forms put their actions in the shared action footer
 * (PieAccionesSistema, docs/design-system.md): secondary first, primary last.
 */
import { render, screen } from '@testing-library/react'

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/lib/actions/solicitudes-grupo.actions', () => ({ crearSolicitudGrupo: jest.fn() }))

import { FormNuevaSolicitud } from '@/components/grupos-vida/solicitudes/form-nueva-solicitud'

describe('FormNuevaSolicitud — actions', () => {
  it('renders Cancelar and Crear Solicitud in the action footer, primary last', () => {
    render(
      <FormNuevaSolicitud
        grupos={[{ id: 'g1', nombre: 'Grupo Uno', segmento: 'Jóvenes' }]}
        onCancelar={jest.fn()}
      />,
    )
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    const crear = screen.getByRole('button', { name: 'Crear Solicitud' })
    const pie = crear.closest('[data-slot="pie-acciones"]')
    expect(pie).not.toBeNull()
    expect(pie).toContainElement(cancelar)
    expect(pie?.lastElementChild).toBe(crear)
  })
})
