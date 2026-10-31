/**
 * The Usuarios person panel (S13 of odd/tasks/sistema-diseno-v2.md; prototype
 * 01-lista-escritorio.html, `openPerson`): summary, quick actions and
 * "Ver ficha completa". WhatsApp and Llamar follow lib/platform/usuarios/
 * contacto.ts (decision 6: a leader only for the people of their own group),
 * Email needs an email, Editar asks puede_editar_usuario, and the account and
 * group callouts say what is missing.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DetalleUsuario } from '@/components/users/lista/detalle-usuario'
import { aPersonas, filasDeVista, type FilaUsuarioRpc } from '@/lib/platform/usuarios/lista-vista'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ authUserId: 'auth-1' }) }))
jest.mock('@/components/cuentas/invitar-cuenta-panel', () => ({
  InvitarCuentaPanel: ({ abierto, nombre }: { abierto: boolean; nombre: string }) =>
    abierto ? <div role="dialog" aria-label={`Invitar a ${nombre}`} /> : null,
}))

const rpcFila = (cambios: Partial<FilaUsuarioRpc> = {}): FilaUsuarioRpc => ({
  id: 'u-1', nombre: 'Luis', apellido: 'Barrios', email: 'luis@example.com', telefono: '04245550101', cedula: '27112430',
  fecha_registro: '2026-10-26T12:00:00Z', rol_nombre_interno: 'miembro', rol_nombre_visible: 'Miembro',
  foto_perfil_url: null, total_count: 1, puede_ver: true, cuenta: 'si', grupo_id: 'g-1',
  grupo_nombre: 'Familias Unidas', campus_nombre: 'Barquisimeto', es_de_mi_grupo: false, ...cambios,
})

const filaPara = (roles: string[], cambios: Partial<FilaUsuarioRpc> = {}) =>
  filasDeVista(aPersonas([rpcFila(cambios)]), { roles, usuarioId: 'yo' })[0]

function Panel({ fila, puedeInvitar }: { fila: ReturnType<typeof filaPara>; puedeInvitar: boolean }) {
  const [abierto, setAbierto] = React.useState(true)
  return <DetalleUsuario fila={fila} abierto={abierto} onCambioAbierto={setAbierto} puedeInvitar={puedeInvitar} />
}

function abrir(roles: string[], cambios: Partial<FilaUsuarioRpc> = {}, puedeInvitar = false) {
  return render(<Panel fila={filaPara(roles, cambios)} puedeInvitar={puedeInvitar} />)
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: false, error: null })
})

describe('DetalleUsuario', () => {
  it('a pastor gets WhatsApp, Llamar and Email, and the links to the ficha', async () => {
    abrir(['pastor'])

    expect(await screen.findByRole('dialog', { name: 'Luis Barrios' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/584245550101')
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:04245550101')
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:luis@example.com')
    expect(screen.getByRole('link', { name: 'Ver ficha completa' })).toHaveAttribute('href', '/users/u-1')
    expect(screen.getByRole('link', { name: 'Asistencia' })).toHaveAttribute('href', '/users/u-1/asistencia')
    expect(screen.getByText('Miembro · Barquisimeto')).toBeInTheDocument()
  })

  it('a leader calls and WhatsApps the people of their own group (decision 6)', async () => {
    abrir(['lider'], { es_de_mi_grupo: true })

    expect(await screen.findByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/584245550101')
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:04245550101')
  })

  it('a leader gets no WhatsApp or Llamar for somebody outside their group; Email stays', async () => {
    abrir(['lider'], { es_de_mi_grupo: false })

    await screen.findByRole('dialog', { name: 'Luis Barrios' })
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Llamar/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Email/ })).toBeInTheDocument()
  })

  it('without a number WhatsApp and Llamar are disabled and the panel says why', async () => {
    abrir(['pastor'], { telefono: null, email: null })

    expect(await screen.findByRole('button', { name: /WhatsApp/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Llamar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Email/ })).toBeDisabled()
    expect(screen.getByText('Sin teléfono registrado: WhatsApp y Llamar no están disponibles.')).toBeInTheDocument()
  })

  it('a landline: Llamar works, WhatsApp is disabled and the panel says why (as the ficha)', async () => {
    abrir(['pastor'], { telefono: '02125551234' })

    expect(await screen.findByRole('button', { name: /WhatsApp/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:02125551234')
    expect(screen.getByText('Es un teléfono fijo, así que WhatsApp no está disponible.')).toBeInTheDocument()
    expect(screen.queryByText('Revisar teléfono')).toBeNull()
  })

  it('a number to check: the reason and a warning "Revisar teléfono" notice, as in the ficha', async () => {
    abrir(['pastor'], { telefono: '123' })

    expect(await screen.findByText('El teléfono necesita revisión, así que WhatsApp no está disponible.')).toBeInTheDocument()
    const aviso = screen.getByText('Revisar teléfono').closest('[role="note"]')
    expect(aviso).toHaveClass('border-warning/40', 'bg-warning/10')
    expect(aviso).toHaveTextContent('«123» no parece un número válido, así que WhatsApp no funciona.')
  })

  it('Editar shows only when puede_editar_usuario allows it', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    abrir(['lider'], { es_de_mi_grupo: true })

    expect(await screen.findByRole('link', { name: /Editar/ })).toHaveAttribute('href', '/users/u-1/edit')
    expect(rpc).toHaveBeenCalledWith('puede_editar_usuario', { p_auth_id: 'auth-1', p_target_user_id: 'u-1' })
  })

  it('no Editar when the server says no', async () => {
    abrir(['director-etapa'])

    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull()
  })

  it('without an account: the callout, and "Invitar a la plataforma" for who may add people', async () => {
    const user = userEvent.setup()
    abrir(['pastor'], { cuenta: 'no' }, true)

    expect(await screen.findByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Invitar a la plataforma' }))
    expect(await screen.findByRole('dialog', { name: 'Invitar a Luis Barrios' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Luis Barrios' })).toBeNull())
  })

  it('with an open invitation the callout offers to send it again; a leader gets no invite button', async () => {
    const { unmount } = abrir(['pastor'], { cuenta: 'invitada' }, true)
    expect(await screen.findByText('Invitación enviada, todavía sin cuenta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar invitación' })).toBeInTheDocument()
    unmount()

    abrir(['lider'], { cuenta: 'no', es_de_mi_grupo: true }, false)
    expect(await screen.findByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invitar a la plataforma' })).toBeNull()
  })

  it('without a group it says so', async () => {
    abrir(['pastor'], { grupo_id: null, grupo_nombre: null })

    expect(await screen.findByText('No está en un Grupo de Vida')).toBeInTheDocument()
  })
})
