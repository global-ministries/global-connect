/**
 * S15 decision 1: on /perfil the identity (photo, name, rol, campus, cuenta)
 * sits above the tabs, so Mis datos (FormularioEditarPersona esPerfil) must
 * not repeat it; /users/[id]/edit keeps its header unchanged.
 */
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }), usePathname: () => '/perfil' }))
jest.mock('@/lib/actions/user.actions', () => ({ updateUser: jest.fn() }))
jest.mock('@/lib/actions/photo.actions', () => ({ uploadUserProfilePhoto: jest.fn(), deleteUserProfilePhoto: jest.fn() }))
jest.mock('@/lib/actions/location.actions', () => ({ geocodeAddress: jest.fn(async () => ({ success: false })) }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn() }) }))

import { CabeceraEditar } from '@/components/users/editar/cabecera-editar'
import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import type { UsuarioEditable } from '@/lib/platform/usuarios/editar-vista'

const USUARIO: UsuarioEditable = {
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', cedula: null, email: null, telefono: null,
  fecha_nacimiento: null, genero: 'Femenino', estado_civil: 'Soltero', ocupacion_id: null, profesion_id: null,
}
const IDENTIDAD = { rol: 'Líder', campus: 'Barquisimeto', cuenta: 'si' as const }

function formulario(esPerfil: boolean) {
  return render(
    <FormularioEditarPersona
      usuario={USUARIO}
      identidad={IDENTIDAD}
      ocupaciones={[]}
      profesiones={[]}
      catalogos={{ paises: [], estados: [], municipios: [], parroquias: [] }}
      esPerfil={esPerfil}
    />,
  )
}

describe('identity above the tabs on /perfil', () => {
  it('Mis datos keeps the required-field note but not the identity', () => {
    formulario(true)
    expect(screen.queryByRole('region', { name: 'Identidad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar foto de Ana Pérez' })).not.toBeInTheDocument()
    expect(screen.getByText(/son obligatorios/)).toBeInTheDocument()
  })

  it('/users/[id]/edit keeps its header with the eyebrow and the photo', () => {
    formulario(false)
    expect(screen.getByRole('region', { name: 'Identidad' })).toBeInTheDocument()
    expect(screen.getByText('Editar persona')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar foto de Ana Pérez' })).toBeInTheDocument()
    expect(screen.getByText(/son obligatorios/)).toBeInTheDocument()
  })

  it('the /perfil identity shows rol, campus and cuenta, without eyebrow or note', () => {
    render(<CabeceraEditar usuarioId="u-1" nombre="Ana" apellido="Pérez" fotoUrl={null} identidad={IDENTIDAD} esPerfil />)
    expect(screen.getByRole('region', { name: 'Identidad' })).toHaveTextContent('Líder')
    expect(screen.getByText('Barquisimeto')).toBeInTheDocument()
    expect(screen.getByText('Con cuenta')).toBeInTheDocument()
    expect(screen.queryByText('Mis datos')).not.toBeInTheDocument()
    expect(screen.queryByText(/son obligatorios/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar foto de Ana Pérez' })).toBeInTheDocument()
  })
})
