/**
 * Editar persona (S14): leaving with changes asks "¿Descartar los cambios?"
 * (decision 9: any in-app link, "‹ Ficha", Cancelar, plus beforeunload), and
 * Mi perfil (decision 11: same form, saving stays on /perfil with a toast,
 * Cancelar discards in place, no "‹ Ficha").
 */
import React from 'react'
import Link from 'next/link'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: jest.fn() }), usePathname: () => '/users/u-1/edit' }))
jest.mock('@/lib/actions/user.actions', () => ({ updateUser: jest.fn() }))
jest.mock('@/lib/actions/photo.actions', () => ({ uploadUserProfilePhoto: jest.fn(), deleteUserProfilePhoto: jest.fn() }))
jest.mock('@/lib/actions/location.actions', () => ({ geocodeAddress: jest.fn(async () => ({ success: false })) }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
const exito = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: exito, error: jest.fn() }) }))

import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import { updateUser } from '@/lib/actions/user.actions'
import type { UsuarioEditable } from '@/lib/platform/usuarios/editar-vista'

const USUARIO: UsuarioEditable = {
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', cedula: null, email: null, telefono: null,
  fecha_nacimiento: null, genero: 'Femenino', estado_civil: 'Soltero', ocupacion_id: null, profesion_id: null,
}

function renderizar(esPerfil = false) {
  return render(
    <>
      {/* Stands in for the shell: sidebar and tab bar links. */}
      <Link href="/grupos-vida">Grupos de Vida</Link>
      <FormularioEditarPersona
        usuario={USUARIO}
        identidad={null}
        ocupaciones={[]}
        profesiones={[]}
        catalogos={{ paises: [], estados: [], municipios: [], parroquias: [] }}
        esPerfil={esPerfil}
      />
    </>,
  )
}

const dialogo = () => screen.queryByRole('alertdialog', { name: '¿Descartar los cambios?' })
const editarNombre = () => userEvent.type(screen.getByLabelText(/^Nombre/), 'a')

beforeEach(() => {
  jest.mocked(updateUser).mockReset().mockResolvedValue({ ok: true })
  push.mockReset()
  refresh.mockReset()
  exito.mockReset()
})

describe('decision 9: leaving with changes', () => {
  it('leaves through a shell link at once when nothing changed', async () => {
    renderizar()
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    screen.getByRole('link', { name: 'Grupos de Vida' }).dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
    expect(dialogo()).not.toBeInTheDocument()
  })

  it('asks before following a shell link, and goes there after "Descartar"', async () => {
    renderizar()
    await editarNombre()
    await userEvent.click(screen.getByRole('link', { name: 'Grupos de Vida' }))
    expect(dialogo()).toHaveTextContent('Tienes 1 cambio sin guardar. Si sales ahora, se pierden.')
    expect(push).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Descartar' }))
    expect(push).toHaveBeenCalledWith('/grupos-vida')
  })

  it('"Seguir editando" keeps the changes', async () => {
    renderizar()
    await editarNombre()
    await userEvent.click(screen.getByRole('link', { name: 'Volver a Ficha' }))
    await userEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Seguir editando' }))
    expect(dialogo()).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Anaa')
  })

  it('Cancelar asks, then goes to the ficha', async () => {
    renderizar()
    await editarNombre()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Descartar' }))
    expect(push).toHaveBeenCalledWith('/users/u-1')
  })

  it('guards reloads and closing the tab with beforeunload only while there are changes', async () => {
    renderizar()
    const antes = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(antes)
    expect(antes.defaultPrevented).toBe(false)
    await editarNombre()
    const despues = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(despues)
    expect(despues.defaultPrevented).toBe(true)
  })
})

describe('decision 11: Mi perfil', () => {
  it('has no "‹ Ficha" and reads "Mis datos"', () => {
    renderizar(true)
    expect(screen.queryByRole('link', { name: 'Volver a Ficha' })).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Mis datos' })).toBeInTheDocument()
  })

  it('saves as the profile, stays on /perfil with a toast, and the bar goes away', async () => {
    renderizar(true)
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'a{Enter}')
    expect(updateUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ nombre: 'Anaa' }), true)
    expect(exito).toHaveBeenCalledWith('Tus datos están al día.')
    expect(push).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Anaa')
  })

  it('Cancelar discards in place after asking', async () => {
    renderizar(true)
    await editarNombre()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Descartar' }))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Ana')
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument()
  })
})
