/**
 * Editar persona on design system v2 (S14 of odd/tasks/sistema-diseno-v2.md):
 * sections, the save bar that appears with changes (1), one tel field with
 * the "Revisar teléfono" notice (3), cédula notice and server duplicate on
 * the field (4), optional address (5), no future birth date (6), gendered
 * estado civil (7), change dots, error summary and Enter (8), "Asignar
 * contraseña" gone (10), género "Otro" empty (12). The leave guard and
 * /perfil live in formulario-editar-salida.test.tsx.
 */
import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: jest.fn() }), usePathname: () => '/users/u-1/edit' }))
jest.mock('@/lib/actions/user.actions', () => ({ updateUser: jest.fn() }))
jest.mock('@/lib/actions/photo.actions', () => ({ uploadUserProfilePhoto: jest.fn(), deleteUserProfilePhoto: jest.fn() }))
jest.mock('@/lib/actions/location.actions', () => ({ geocodeAddress: jest.fn(async () => ({ success: false })) }))
jest.mock('@/components/maps/LocationPicker.client', () => function MapaFalso() {
  return <div data-testid="mapa" />
})
const exito = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: exito, error: jest.fn() }) }))

import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import { updateUser } from '@/lib/actions/user.actions'
import type { UsuarioEditable } from '@/lib/platform/usuarios/editar-vista'

const USUARIO: UsuarioEditable = {
  id: 'u-1', nombre: 'María Fernanda', apellido: 'Colmenárez', cedula: '18456789', email: 'mafe@gmail.com', telefono: '04145523108',
  fecha_nacimiento: '1988-04-17', genero: 'Femenino', estado_civil: 'Casado', ocupacion_id: null, profesion_id: null, foto_perfil_url: null,
}

function renderizar(usuario: UsuarioEditable = USUARIO) {
  return render(
    <FormularioEditarPersona
      usuario={usuario}
      identidad={{ rol: 'Líder', campus: 'Barquisimeto', cuenta: 'si' }}
      ocupaciones={[]}
      profesiones={[]}
      catalogos={{ paises: [], estados: [], municipios: [], parroquias: [] }}
    />,
  )
}

const barra = () => screen.queryByRole('region', { name: 'Cambios sin guardar' })

beforeEach(() => {
  jest.mocked(updateUser).mockReset().mockResolvedValue({ ok: true })
  push.mockReset()
  refresh.mockReset()
  exito.mockReset()
})

describe('Editar persona: sections and header', () => {
  it('shows the ficha sections and the identity line, without "Cuenta y acceso" or "Asignar contraseña" (decision 10)', () => {
    renderizar()
    for (const t of ['Información personal', 'Contacto', 'Ubicación']) expect(screen.getByRole('region', { name: t })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuenta y acceso' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Asignar contraseña/ })).not.toBeInTheDocument()
    expect(screen.getByText('Barquisimeto')).toBeInTheDocument()
    expect(screen.getByText('Con cuenta')).toBeInTheDocument()
  })

  it('decision 2: the photo is changed from the header (camera button and "Cambiar foto")', () => {
    renderizar()
    expect(screen.getByRole('button', { name: 'Cambiar foto de María Fernanda Colmenárez' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
  })

  it('decision 3: one tel field, no country select', () => {
    renderizar()
    const tel = screen.getByLabelText('Teléfono')
    expect(tel).toHaveAttribute('type', 'tel')
    expect(tel).toHaveValue('0414 552 3108')
    expect(within(screen.getByRole('region', { name: 'Contacto' })).queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('decision 1 and 8: changes, dots and the save bar', () => {
  it('shows no bar until something changes, then "1 cambio" and the brand dot; undoing hides both', async () => {
    renderizar()
    expect(barra()).not.toBeInTheDocument()
    const nombre = screen.getByLabelText(/^Nombre/)
    await userEvent.type(nombre, 'x')
    expect(within(barra() as HTMLElement).getByRole('status')).toHaveTextContent('1 cambio')
    expect(screen.getByTestId('modificado-nombre')).toBeInTheDocument()
    await userEvent.type(nombre, '{backspace}')
    expect(barra()).not.toBeInTheDocument()
    expect(screen.queryByTestId('modificado-nombre')).not.toBeInTheDocument()
  })

  it('saves with the bar button and with Enter in a field', async () => {
    renderizar()
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'x{Enter}')
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(jest.mocked(updateUser).mock.calls[0][1]).toEqual(expect.objectContaining({ nombre: 'María Fernandax' }))
  })

  it('lists the errors in a summary that takes the focus, and does not save', async () => {
    renderizar()
    const apellido = screen.getByLabelText(/^Apellido/)
    await userEvent.clear(apellido)
    await userEvent.type(apellido, 'C')
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2999-01-01' } })
    await userEvent.click(within(barra() as HTMLElement).getByRole('button', { name: /Guardar/ }))
    await act(() => new Promise((r) => requestAnimationFrame(r)))
    const titulo = screen.getByRole('heading', { name: 'Revisa 2 campos antes de guardar' })
    expect(titulo).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Apellido: El apellido debe tener al menos 2 caracteres' })).toHaveAttribute('href', '#f-apellido')
    expect(screen.getByRole('link', { name: 'Fecha de nacimiento: La fecha de nacimiento no puede ser posterior a hoy' })).toBeInTheDocument()
    expect(within(barra() as HTMLElement).getByRole('status')).toHaveTextContent('Revisa 2 campos')
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('notices never block (decisions 3 and 4)', () => {
  it('shows "Revisar teléfono" for an unrecognized number and still saves it', async () => {
    renderizar()
    const tel = screen.getByLabelText('Teléfono')
    await userEvent.clear(tel)
    await userEvent.type(tel, '0414 552 310')
    await userEvent.tab()
    expect(screen.getByText(/no parece un número venezolano/)).toBeInTheDocument()
    expect(tel).toHaveAttribute('aria-invalid', 'false')
    await userEvent.click(within(barra() as HTMLElement).getByRole('button', { name: /Guardar/ }))
    expect(jest.mocked(updateUser).mock.calls[0][1]).toEqual(expect.objectContaining({ telefono: '0414 552 310' }))
  })

  it('normalizes the cédula on blur (PRESERVE of the legacy form)', async () => {
    renderizar({ ...USUARIO, cedula: null })
    const cedula = screen.getByLabelText('Cédula')
    await userEvent.type(cedula, 'V-22.328.215')
    await userEvent.tab()
    expect(cedula).toHaveValue('22328215')
  })

  it('places a duplicated cédula from the server on the field and focuses it', async () => {
    jest.mocked(updateUser).mockResolvedValue({ ok: false, campo: 'cedula', error: 'Esta cédula ya pertenece a otra persona.' })
    renderizar()
    const cedula = screen.getByLabelText('Cédula')
    await userEvent.clear(cedula)
    await userEvent.type(cedula, '16330981{Enter}')
    await act(() => new Promise((r) => requestAnimationFrame(r)))
    expect(cedula).toHaveFocus()
    expect(cedula).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(cedula.getAttribute('aria-describedby') as string)).toHaveTextContent('Esta cédula ya pertenece a otra persona.')
    // Not a general error: no separate alert besides the field summary.
    expect(screen.queryByText('Esta cédula ya pertenece a otra persona.', { selector: '[role="alert"]' })).not.toBeInTheDocument()
  })
})

describe('decision 5: the address is optional', () => {
  it('saves a person without address and sends no direccion', async () => {
    renderizar()
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'x{Enter}')
    expect(jest.mocked(updateUser).mock.calls[0][1].direccion).toBeUndefined()
  })

  it('asks for calle once another address field is filled', async () => {
    renderizar()
    await userEvent.type(screen.getByLabelText('Referencia'), 'Frente a la plaza{Enter}')
    expect(updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Calle: Escribe la calle para guardar la dirección' })).toBeInTheDocument()
  })
})

describe('decisions 7 and 12', () => {
  it('labels estado civil by género, keeping the stored value', () => {
    renderizar()
    const civil = screen.getByLabelText('Estado civil') as HTMLSelectElement
    expect(civil.value).toBe('Casado')
    expect(civil.selectedOptions[0].textContent).toBe('Casada')
  })

  it('leaves a stored "Otro" género empty and required', async () => {
    renderizar({ ...USUARIO, genero: 'Otro' })
    expect((screen.getByLabelText(/^Género/) as HTMLSelectElement).value).toBe('')
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'x{Enter}')
    expect(updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Género: Elige el género' })).toBeInTheDocument()
  })
})
