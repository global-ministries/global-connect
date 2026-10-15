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

import UserCreateForm from '@/components/forms/UserCreateForm'
import { UserEditForm } from '@/components/forms/UserEditForm'
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

describe('UserEditForm on the design system', () => {
  function renderizar() {
    return render(
      <UserEditForm ocupaciones={[]} profesiones={[]} paises={[]} estados={[]} municipios={[]} parroquias={[]} />,
    )
  }

  it('groups the fields in labelled sections', () => {
    renderizar()

    for (const titulo of ['Foto de Perfil', 'Información Básica', 'Información de Contacto', 'Información Profesional', 'Información de Ubicación']) {
      expect(screen.getByRole('region', { name: titulo })).toBeTruthy()
    }
  })

  it('labels the phone field', () => {
    renderizar()

    expect(screen.getByLabelText('Teléfono')).toBeTruthy()
  })

  it('orders the footer actions: cancel first, save last', () => {
    const { container } = renderizar()

    const botones = within(pieDeAcciones(container)).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar Cambios'])
    expect(botones[1].getAttribute('type')).toBe('submit')
  })
})
