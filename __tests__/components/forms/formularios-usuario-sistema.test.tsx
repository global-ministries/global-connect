/**
 * @jest-environment jsdom
 *
 * ui-areas-formularios — the user create and edit forms are built from labelled
 * system sections, every field has a label, and the actions sit in the system
 * action footer with the secondary action first and the primary action last.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/lib/actions/user.actions', () => ({ createUser: jest.fn(), updateUser: jest.fn() }))
jest.mock('@/lib/actions/photo.actions', () => ({ uploadUserProfilePhoto: jest.fn(), deleteUserProfilePhoto: jest.fn() }))
jest.mock('@/lib/actions/location.actions', () => ({ geocodeAddress: jest.fn() }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn() }) }))

import UserCreateForm from '@/components/forms/UserCreateForm'
import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import userEvent from '@testing-library/user-event'
import { createUser } from '@/lib/actions/user.actions'

function pieDeAcciones(container: HTMLElement) {
  const pie = container.querySelector('[data-slot="pie-acciones"]')
  if (!(pie instanceof HTMLElement)) throw new Error('Missing action footer')
  return pie
}

describe('UserCreateForm on the design system', () => {
  it('groups the fields in labelled sections', () => {
    render(<UserCreateForm />)

    for (const titulo of ['Información Personal', 'Contacto', 'Información Adicional']) {
      expect(screen.getByRole('region', { name: titulo })).toBeTruthy()
    }
  })

  it('labels every field', () => {
    render(<UserCreateForm />)

    for (const etiqueta of ['Nombre *', 'Apellido *', 'Cédula', 'Fecha de Nacimiento', 'Email', 'Teléfono', 'Género *', 'Estado Civil *']) {
      expect(screen.getByLabelText(etiqueta)).toBeTruthy()
    }
  })

  it('puts the submit action in the action footer', () => {
    const { container } = render(<UserCreateForm />)

    const botones = within(pieDeAcciones(container)).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Crear y Continuar'])
    expect(botones[0].getAttribute('type')).toBe('submit')
  })

  it('announces a server error', async () => {
    jest.mocked(createUser).mockResolvedValueOnce({ ok: false, error: 'No se pudo crear el usuario' } as never)
    render(<UserCreateForm />)

    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido *'), { target: { value: 'Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear y Continuar' }))

    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo crear el usuario')
  })
})

// Editar persona v2 (S14) replaced UserEditForm; same intent: labelled sections, a
// labelled phone, and actions ordered secondary first, primary last (now in the
// save bar that appears with changes).
describe('Editar persona on the design system', () => {
  function renderizar() {
    return render(
      <FormularioEditarPersona
        usuario={{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez', cedula: null, email: null, telefono: null, fecha_nacimiento: null, genero: 'Femenino', estado_civil: 'Soltero', ocupacion_id: null, profesion_id: null }}
        identidad={null}
        ocupaciones={[]}
        profesiones={[]}
        catalogos={{ paises: [], estados: [], municipios: [], parroquias: [] }}
      />,
    )
  }

  it('groups the fields in labelled sections', () => {
    renderizar()

    for (const titulo of ['Información personal', 'Contacto', 'Ubicación']) {
      expect(screen.getByRole('region', { name: titulo })).toBeTruthy()
    }
  })

  it('labels the phone field', () => {
    renderizar()

    expect(screen.getByLabelText('Teléfono')).toBeTruthy()
  })

  it('orders the save bar actions: cancel first, save last', async () => {
    renderizar()
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'a')

    const barra = screen.getByRole('region', { name: 'Cambios sin guardar' })
    expect(within(barra).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar cambiosGuardar'])
  })
})
