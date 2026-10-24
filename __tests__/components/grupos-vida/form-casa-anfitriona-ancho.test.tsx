/**
 * @jest-environment jsdom
 *
 * The host-home form fills the page: each section is a card on the sections
 * grid and its fields sit on the fields grid (docs/design-system.md).
 */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  obtenerDireccionUsuario: jest.fn(),
  obtenerRelacionesFamiliares: jest.fn().mockResolvedValue({ success: true, data: [] }),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ error: jest.fn(), exito: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/components/maps/LocationPicker.client', () => function LocationPickerMock() {
  return <div>Mapa</div>
})
jest.mock('@/components/grupos-vida/selector-propietario-casa', () => ({
  SelectorPropietarioCasa: function SelectorPropietarioMock() {
    return <div>Selector de propietario</div>
  },
}))

import { FormCasaAnfitriona } from '@/components/grupos-vida/form-casa-anfitriona'

function seccion(titulo: string) {
  const encabezado = screen.getByRole('heading', { name: titulo })
  return encabezado.closest('[data-slot="secciones"] > *')
}

it('lays out each section as a card on the sections grid and its fields on the fields grid', () => {
  render(
    <FormCasaAnfitriona
      estados={[{ value: 'e1', label: 'Lara' }]}
      municipios={[]}
      parroquias={[]}
      mostrarSelectorUsuario
      onSubmit={jest.fn()}
      onCancelar={jest.fn()}
    />
  )

  for (const titulo of ['Propietario de la casa', 'Información del lugar', 'Dirección', 'Ubicación en el mapa', 'Disponibilidad semanal']) {
    expect(seccion(titulo)).not.toBeNull()
  }
  for (const campo of ['Nombre del lugar', 'Capacidad máxima', 'Calle / Avenida', 'Barrio / Urbanización', 'Referencia']) {
    expect(screen.getByLabelText(campo).closest('[data-slot="campos"]')).not.toBeNull()
  }
  const guardar = screen.getByRole('button', { name: 'Registrar casa' })
  expect(guardar.closest('[data-slot="secciones"]')).toBeNull()
})
