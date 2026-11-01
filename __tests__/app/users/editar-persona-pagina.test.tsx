/**
 * /users/[id]/edit and /perfil after S14 (odd/tasks/sistema-diseno-v2.md):
 * who may open the edit page is unchanged (signed in + puede_editar_usuario,
 * otherwise back to the ficha, before any data is read); "Asignar
 * contraseña" is not on the page, not even for admin (decision 10); /perfil
 * renders the same form as the caller's own profile (decision 11) under
 * "Mi perfil", without Usuarios breadcrumbs.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const redirect = jest.fn((ruta: string) => {
  throw new Error(`NEXT_REDIRECT ${ruta}`)
})
jest.mock('next/navigation', () => ({ redirect: (ruta: string) => redirect(ruta) }))

const getUser = jest.fn()
const rpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }))

const cargarUsuarioEditable = jest.fn()
jest.mock('@/lib/platform/usuarios/editar-carga', () => ({
  cargarUsuarioEditable: (...a: unknown[]) => cargarUsuarioEditable(...a),
  cargarCatalogosEdicion: async () => ({ ocupaciones: [], profesiones: [], catalogos: { paises: [], estados: [], municipios: [], parroquias: [] } }),
  cargarIdentidadEdicion: async () => ({ rol: 'Administrador', campus: null, cuenta: 'si' }),
}))
jest.mock('@/lib/actions/direccion-familiar.actions', () => ({ obtenerSugerenciasDireccionFamiliar: async () => ({ sugerencias: [] }) }))
jest.mock('@/components/users/editar/formulario-editar-persona', () => ({
  FormularioEditarPersona: ({ usuario, esPerfil }: { usuario: { id: string }; esPerfil?: boolean }) => (
    <form aria-label="Formulario">{`${usuario.id}${esPerfil ? ' perfil' : ''}`}</form>
  ),
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header> }))
jest.mock('@/components/perfil/mis-hijos', () => ({ MisHijos: () => <section aria-label="Mis hijos" /> }))

import EditUserPage from '@/app/(auth)/users/[id]/edit/page'
import PerfilPage from '@/app/(auth)/perfil/page'

const USUARIO = { id: 'u-1', nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '1990-01-01' }
const parametros = { params: Promise.resolve({ id: 'u-1' }) }

beforeEach(() => {
  redirect.mockClear()
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'auth-admin' } }, error: null })
  rpc.mockReset().mockImplementation(async (nombre: string) => (nombre === 'puede_editar_usuario' ? { data: true, error: null } : { data: [], error: null }))
  cargarUsuarioEditable.mockReset().mockResolvedValue({ usuario: USUARIO, error: null })
})

describe('/users/[id]/edit: who may open it (unchanged)', () => {
  it('sends a signed-out visitor home', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(EditUserPage(parametros)).rejects.toThrow('NEXT_REDIRECT /')
    expect(cargarUsuarioEditable).not.toHaveBeenCalled()
  })

  it('sends a caller without puede_editar_usuario back to the ficha before reading anything', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(EditUserPage(parametros)).rejects.toThrow('NEXT_REDIRECT /users/u-1')
    expect(rpc).toHaveBeenCalledWith('puede_editar_usuario', { p_auth_id: 'auth-admin', p_target_user_id: 'u-1' })
    expect(cargarUsuarioEditable).not.toHaveBeenCalled()
  })

  it('renders the form for an editor, with the crumbs and without "Asignar contraseña" (decision 10)', async () => {
    render(await EditUserPage(parametros))
    expect(screen.getByRole('form', { name: 'Formulario' })).toHaveTextContent('u-1')
    // The desktop header (breadcrumbs) renders after its Suspense boundary.
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users')
    expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute('href', '/users/u-1')
    expect(screen.queryByText(/Asignar contraseña/)).not.toBeInTheDocument()
  })
})

describe('/perfil "Mis datos" (decision 11)', () => {
  it('renders the same form as the profile, under "Mi perfil", with no Usuarios crumbs', async () => {
    render(await PerfilPage())
    expect(cargarUsuarioEditable).toHaveBeenCalledWith(expect.anything(), { columna: 'auth_id', valor: 'auth-admin' })
    expect(screen.getByRole('form', { name: 'Formulario' })).toHaveTextContent('u-1 perfil')
    expect(await screen.findByText('Mi perfil')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Mis hijos' })).toBeInTheDocument()
  })
})
