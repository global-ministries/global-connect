/**
 * @jest-environment jsdom
 *
 * usuarios-cedula-normalizada T2 — the create form and the sign-up page show
 * the normalized cedula when the person leaves the field; so does the edit form.
 */

import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
jest.mock('@/lib/actions/user.actions', () => ({ createUser: jest.fn(), updateUser: jest.fn() }))
jest.mock('@/lib/actions/auth.actions', () => ({ signup: jest.fn() }))

import UserCreateForm from '@/components/forms/UserCreateForm'
import SignupPage from '@/app/signup/page'
import { UserEditForm } from '@/components/forms/UserEditForm'

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

describe('UserEditForm: cedula', () => {
  it.each([
    ['22.328.215', '22328215'],
    ['V-18423291', '18423291'],
  ])('turns %j into %j on blur', async (escrito, esperado) => {
    render(
      <UserEditForm ocupaciones={[]} profesiones={[]} paises={[]} estados={[]} municipios={[]} parroquias={[]} />,
    )
    const campo = screen.getByLabelText(/Cédula/i) as HTMLInputElement
    escribirYSalir(campo, escrito)
    expect(await screen.findByDisplayValue(esperado)).toBeTruthy()
  })
})
