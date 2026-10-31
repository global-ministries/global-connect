/**
 * The ficha /users/[id] on design system v2 (S13): header actions per
 * permission, tabs synced to ?tab=, Familia (editors add and remove, with a
 * confirmation; relatives open their ficha), Cuenta (admin-only password and
 * role change) and the removed 404 links.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace: jest.fn() }),
  usePathname: () => '/users/u-2',
}))
jest.mock('@/lib/actions/user.actions', () => ({ deleteFamilyRelation: jest.fn() }))
jest.mock('@/components/maps/LocationPicker.client', () => () => null)
jest.mock('@/components/modals/AgregarFamiliarModal', () => ({
  AgregarFamiliarModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Agregar familiar</div> : null),
}))
jest.mock('@/components/modals/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title }: { isOpen: boolean; title: string }) => (isOpen ? <div role="alertdialog">{title}</div> : null),
}))
jest.mock('@/components/modals/SetPasswordModal', () => ({
  SetPasswordModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Asignar contraseña</div> : null),
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal }: { accionPrincipal?: React.ReactNode }) => <header>{accionPrincipal}</header>,
}))
let estadoInvitacion: unknown = null
jest.mock('@/components/cuentas/invitar-cuenta-panel', () => ({
  useEstadoInvitacion: () => ({ estado: estadoInvitacion, error: null, recargar: jest.fn() }),
  InvitarCuentaPanel: () => null,
  fechaInvitacion: () => '25 de octubre de 2026',
}))

import { FichaUsuario, type FichaUsuarioProps } from '@/components/users/ficha/ficha-usuario'

const persona: FichaUsuarioProps['persona'] = {
  id: 'u-2', nombre: 'Ana', apellido: 'Pérez', cedula: 'V-18.456.789', email: 'ana@example.com', telefono: '04141234567',
  fechaNacimiento: '1988-04-17', fechaRegistro: '2021-03-14', estadoCivil: 'Casada', genero: 'Femenino', fotoUrl: null,
  ocupacion: 'Empleada', profesion: null, direccion: null, rol: { interno: 'lider', etiqueta: 'Líder' },
  relaciones: [
    {
      id: 'rel-1', tipo_relacion: 'hermano', es_principal: true, sentido: 'directo',
      familiar: { id: 'u-3', nombre: 'Luis', apellido: 'Pérez', email: null, telefono: null, genero: 'Masculino', foto_perfil_url: null },
    },
  ],
}

function renderizar(parcial: Partial<FichaUsuarioProps> = {}) {
  const props: FichaUsuarioProps = {
    persona,
    resumen: { cuenta: 'si', campus: 'Barquisimeto', esDeMiGrupo: false, grupoActual: 'Mujeres de Fe' },
    puedeEditar: true,
    visor: { roles: ['admin'], usuarioId: 'u-1' },
    tabInicial: 'datos',
    asistencia: { desde: '2026-08-01', hasta: '2026-10-29', grupos: [] },
    grupos: [],
    servicios: [],
    authIdPersona: 'auth-2',
    ...parcial,
  }
  return render(<FichaUsuario {...props} />)
}

beforeEach(() => {
  estadoInvitacion = null
  window.history.replaceState(null, '', '/users/u-2')
})

describe('ficha header', () => {
  it('shows identity: name, neutral role tag, campus, cédula, account state', () => {
    renderizar()
    expect(screen.getAllByRole('heading', { name: 'Ana Pérez' }).length).toBeGreaterThan(0)
    const linea = screen.getByTestId('linea-identidad')
    expect(linea).toHaveTextContent('Líder')
    expect(linea).toHaveTextContent('Barquisimeto')
    expect(linea).toHaveTextContent('V-18.456.789')
    expect(linea).toHaveTextContent('Con cuenta')
  })

  it('gives a campus role Llamar, WhatsApp, Email and Editar', () => {
    renderizar()
    expect(screen.getAllByRole('link', { name: /Llamar/ })[0]).toHaveAttribute('href', 'tel:04141234567')
    expect(screen.getAllByRole('link', { name: /WhatsApp/ })[0]).toHaveAttribute('href', 'https://wa.me/584141234567')
    expect(screen.getAllByRole('link', { name: /Email/ })[0]).toHaveAttribute('href', 'mailto:ana@example.com')
    expect(screen.getAllByRole('link', { name: /Editar/ })[0]).toHaveAttribute('href', '/users/u-2/edit')
  })

  it('hides Llamar and WhatsApp from a leader outside the group, and Editar without permission', () => {
    renderizar({ visor: { roles: ['lider'], usuarioId: 'u-1' }, puedeEditar: false })
    expect(screen.queryByRole('link', { name: /Llamar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Email/ }).length).toBeGreaterThan(0)
  })

  it('lets a leader call the people of their own group', () => {
    renderizar({ visor: { roles: ['lider'], usuarioId: 'u-1' }, resumen: { cuenta: 'si', campus: null, esDeMiGrupo: true, grupoActual: null } })
    expect(screen.getAllByRole('link', { name: /Llamar/ }).length).toBeGreaterThan(0)
  })

  it('warns about a phone to review and offers the invitation when there is no account', () => {
    estadoInvitacion = { sinCuenta: true, emailFicha: 'ana@example.com', invitacion: null }
    renderizar({ persona: { ...persona, telefono: '123' }, resumen: { cuenta: 'no', campus: null, esDeMiGrupo: false, grupoActual: null } })
    expect(screen.getByText('Revisar teléfono')).toBeInTheDocument()
    expect(screen.getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invitar a la plataforma' }).length).toBeGreaterThan(0)
  })

  it('no longer links to the missing Familia and Ruta de Crecimiento pages', () => {
    renderizar()
    expect(screen.queryByRole('link', { name: /Ver Familia/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ruta de Crecimiento/ })).not.toBeInTheDocument()
  })
})

describe('ficha tabs', () => {
  it('opens the tab from the URL and writes ?tab= when switching', async () => {
    const user = userEvent.setup()
    renderizar({ tabInicial: 'familia' })
    expect(screen.getByRole('tab', { name: /Familia/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: /Cuenta/ }))
    expect(window.location.search).toBe('?tab=cuenta')
    expect(screen.getByRole('tab', { name: /Cuenta/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: /Datos/ }))
    expect(window.location.search).toBe('')
  })
})

describe('Familia tab', () => {
  it('lets an editor add and remove (with confirmation) and opens the relative’s ficha', async () => {
    const user = userEvent.setup()
    renderizar({ tabInicial: 'familia' })
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Principal')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Luis Pérez' })).toHaveAttribute('href', '/users/u-3')
    // A 44px touch target on touch screens (pointer-coarse), as the other small controls.
    expect(within(panel).getByRole('link', { name: 'Luis Pérez' })).toHaveClass('pointer-coarse:min-h-11')
    await user.click(within(panel).getByRole('button', { name: 'Quitar relación con Luis Pérez' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Confirmar Eliminación')
    await user.click(within(panel).getByRole('button', { name: /Agregar familiar/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Agregar familiar')
  })

  it('is read-only without edit permission', () => {
    renderizar({ tabInicial: 'familia', puedeEditar: false })
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).queryByRole('button', { name: /Agregar familiar/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Quitar relación/ })).not.toBeInTheDocument()
  })
})

describe('Cuenta tab', () => {
  it('gives admin "Asignar contraseña" and the single-person role change', async () => {
    const user = userEvent.setup()
    renderizar({ tabInicial: 'cuenta' })
    await user.click(screen.getByRole('button', { name: 'Asignar contraseña' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Asignar contraseña')
    expect(screen.getByLabelText('Cambiar rol')).toHaveValue('lider')
    expect(screen.getByRole('button', { name: 'Guardar rol' })).toBeInTheDocument()
  })

  it('keeps both for admin only', () => {
    renderizar({ tabInicial: 'cuenta', visor: { roles: ['pastor'], usuarioId: 'u-1' }, authIdPersona: undefined })
    expect(screen.queryByRole('button', { name: 'Asignar contraseña' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cambiar rol')).not.toBeInTheDocument()
    expect(screen.getByText('Solo un administrador del sistema cambia roles.')).toBeInTheDocument()
  })
})
