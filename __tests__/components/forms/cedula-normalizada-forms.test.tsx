/**
 * @jest-environment jsdom
 *
 * usuarios-cedula-normalizada T2 — the create form and the sign-up page show
 * the normalized cedula when the person leaves the field; so does Editar persona.
 */

import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
jest.mock('@/lib/actions/user.actions', () => ({ createUser: jest.fn(), updateUser: jest.fn() }))
jest.mock('@/lib/actions/auth.actions', () => ({ signup: jest.fn() }))
jest.mock('@/lib/actions/photo.actions', () => ({ uploadUserProfilePhoto: jest.fn(), deleteUserProfilePhoto: jest.fn() }))
jest.mock('@/lib/actions/location.actions', () => ({ geocodeAddress: jest.fn() }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn() }) }))

import UserCreateForm from '@/components/forms/UserCreateForm'
import SignupPage from '@/app/signup/page'
import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'

function escribirYSalir(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } })
  fireEvent.blur(campo)
}

describe('UserCreateForm: cedula', () => {
  it.each([
    ['22.328.215', '22328215'],
    ['V-18423291', '18423291'],
    ['e 81110494', 'E81110494'],
    ['04245136686', '04245136686'],
  ])('turns %j into %j on blur', async (escrito, esperado) => {
    render(<UserCreateForm />)
    const campo = screen.getByLabelText(/Cédula/i) as HTMLInputElement
    escribirYSalir(campo, escrito)
    expect(await screen.findByDisplayValue(esperado)).toBeTruthy()
  })
})

describe('SignupPage: cedula', () => {
  it.each([
    ['22.328.215', '22328215'],
    ['V-18423291', '18423291'],
  ])('turns %j into %j on blur', async (escrito, esperado) => {
    render(<SignupPage />)
    const campo = screen.getByLabelText(/Cédula de Identidad/i) as HTMLInputElement
    escribirYSalir(campo, escrito)
    expect(await screen.findByDisplayValue(esperado)).toBeTruthy()
  })
})

// Editar persona v2 (S14) replaced UserEditForm; it normalizes on blur the same way.
describe('Editar persona: cedula', () => {
  it.each([
    ['22.328.215', '22328215'],
    ['V-18423291', '18423291'],
  ])('turns %j into %j on blur', async (escrito, esperado) => {
    render(
      <FormularioEditarPersona
        usuario={{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez', cedula: null, email: null, telefono: null, fecha_nacimiento: null, genero: 'Femenino', estado_civil: 'Soltero', ocupacion_id: null, profesion_id: null }}
        identidad={null}
        ocupaciones={[]}
        profesiones={[]}
        catalogos={{ paises: [], estados: [], municipios: [], parroquias: [] }}
      />,
    )
    const campo = screen.getByLabelText(/Cédula/i) as HTMLInputElement
    escribirYSalir(campo, escrito)
    expect(await screen.findByDisplayValue(esperado)).toBeTruthy()
  })
})
