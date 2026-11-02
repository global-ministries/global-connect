/**
 * `<DetallePersona>` — the invitation to register in the person drawer (T4 of
 * odd/tasks/invitaciones-pendientes.md, S2 and S7; artboard
 * design/invitaciones/05-mezcla-escritorio.html, `bloqueInvitacion`).
 *
 * With invitation data the plain "No tiene cuenta" callout gives way to the
 * state of the invitation: vencida ("Todavía no creó su cuenta"), enviada,
 * registrada; sin invitar keeps today's callout. The actions (Reenviar,
 * Cambiar correo, Avisar por WhatsApp, Cancelar invitación) show only to who
 * may invite; the history shows to everyone who sees the invitation.
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the desktop side panel.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DetallePersona, type DetallePersonaProps, type ServicioDetalle } from '@/components/dream-team/detalle-persona'
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'

const user = userEvent.setup({ delay: null })

const DIA = 24 * 60 * 60 * 1000
const haceMs = (ms: number) => new Date(Date.now() - ms).toISOString()
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })

const CON_INVITAR = { cambiarEtapa: false, turnos: false, editarFicha: true, invitar: true }
const SIN_INVITAR = { cambiarEtapa: false, turnos: false, editarFicha: false, invitar: false }

const servicio = (acciones: ServicioDetalle['acciones']): ServicioDetalle => ({
  clave: 's-dhah',
  equipoLabel: 'De Hombre a Hombre',
  equipoRuta: 'Conexión',
  rolLabel: 'Facilitador',
  estado: 'activo',
  turnoTexto: '—',
  desde: '2026-01-10T12:00:00Z',
  origen: 'dream_team',
  acciones,
})

const PRIMER_ENVIO = haceMs(20 * DIA)
const REENVIO = haceMs(10 * DIA)

const VENCIDA: ResumenInvitacion = {
  usuarioId: 'p-1',
  estado: 'vencida',
  email: 'fernando.ramos@gmail.com',
  enviadaEl: REENVIO,
  aceptadaEl: null,
  invitadoPor: 'Edith Pérez',
  envios: 2,
  historial: [
    { estado: 'cancelada', email: 'fernando.ramos@gmail.com', fecha: PRIMER_ENVIO, invitadoPor: 'Edmir Muñoz' },
    { estado: 'enviada', email: 'fernando.ramos@gmail.com', fecha: REENVIO, invitadoPor: 'Edith Pérez' },
  ],
}

const ENVIADA_EL = haceMs(3 * 60 * 60 * 1000 + 60 * 1000)
const ENVIADA: ResumenInvitacion = {
  ...VENCIDA,
  estado: 'enviada',
  enviadaEl: ENVIADA_EL,
  envios: 1,
  historial: [{ estado: 'enviada', email: 'fernando.ramos@gmail.com', fecha: ENVIADA_EL, invitadoPor: 'Edith Pérez' }],
}

const ACEPTADA_EL = haceMs(5 * DIA)
const REGISTRADA: ResumenInvitacion = {
  ...VENCIDA,
  estado: 'registrada',
  enviadaEl: haceMs(6 * DIA),
  aceptadaEl: ACEPTADA_EL,
  envios: 1,
  historial: [{ estado: 'aceptada', email: 'fernando.ramos@gmail.com', fecha: haceMs(6 * DIA), invitadoPor: 'Edith Pérez' }],
}

function base(invitacion: ResumenInvitacion | null, over: Partial<DetallePersonaProps> = {}, tieneCuenta = false): DetallePersonaProps {
  return {
    persona: { nombre: 'Fernando Ramos', telefono: '04125457346', tieneCuenta, soloGruposVida: false, invitacion },
    servicios: [servicio(CON_INVITAR)],
    abierto: true,
    onCambioAbierto: jest.fn(),
    onCambiarEtapa: jest.fn(),
    onTurnos: jest.fn(),
    onEditarFicha: jest.fn(),
    onInvitar: jest.fn(),
    onReenviarInvitacion: jest.fn(),
    onCancelarInvitacion: jest.fn(),
    ...over,
  }
}

const panel = () => within(screen.getByRole('dialog', { name: 'Fernando Ramos' }))
const AVISO_WHATSAPP =
  'https://wa.me/584125457346?text=' +
  encodeURIComponent('Hola, te envié a tu correo la invitación para crear tu cuenta en Global Connect. Revisa también spam')
const NOTA =
  'El correo llega con el asunto «Te invitamos a GlobalConnect» y el botón «Aceptar invitación», que lleva a elegir su contraseña.'

describe('DetallePersona — invitación vencida', () => {
  it('says the link expired, with the email and how long ago, and replaces the plain callout', () => {
    render(<DetallePersona {...base(VENCIDA)} />)
    expect(panel().getByText('Todavía no creó su cuenta')).toBeInTheDocument()
    expect(
      panel().getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'La invitación para registrarse en Global Connect le llegó a fernando.ramos@gmail.com hace 10 días y el enlace ya venció. Reenvíala y avísale que revise también la carpeta de spam.',
      ),
    ).toBeInTheDocument()
    expect(panel().getByText(NOTA)).toBeInTheDocument()
    expect(panel().queryByText('No tiene cuenta en la plataforma')).not.toBeInTheDocument()
    expect(panel().queryByRole('button', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
  })

  it('lists the history: sent to the email with date and who, resent, expired', () => {
    render(<DetallePersona {...base(VENCIDA)} />)
    const historial = within(panel().getByRole('list', { name: 'Historial de la invitación a la plataforma' }))
    const items = historial.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      `Invitación para crear su cuenta enviada a fernando.ramos@gmail.com${fechaCorta(PRIMER_ENVIO)} · por Edmir Muñoz`,
      `Reenviada${fechaCorta(REENVIO)} · por Edith Pérez`,
      'El enlace venció sin abrirse24 h después del último envío',
    ])
  })

  it('offers Reenviar, Cambiar correo, Avisar por WhatsApp and Cancelar invitación to who may invite', async () => {
    const props = base(VENCIDA)
    render(<DetallePersona {...props} />)
    expect(panel().getByRole('link', { name: 'Avisar por WhatsApp' })).toHaveAttribute('href', AVISO_WHATSAPP)

    await user.click(panel().getByRole('button', { name: 'Reenviar invitación' }))
    expect(props.onReenviarInvitacion).toHaveBeenCalledTimes(1)
    expect(props.onCambioAbierto).not.toHaveBeenCalled()

    await user.click(panel().getByRole('button', { name: 'Cambiar correo' }))
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(props.onInvitar).toHaveBeenCalledTimes(1)
  })

  it('"Cancelar invitación" closes the drawer and calls back', async () => {
    const props = base(VENCIDA)
    render(<DetallePersona {...props} />)
    await user.click(panel().getByRole('button', { name: 'Cancelar invitación' }))
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(props.onCancelarInvitacion).toHaveBeenCalledTimes(1)
  })

  it('without a usable phone there is no "Avisar por WhatsApp"', () => {
    const props = base(VENCIDA)
    render(<DetallePersona {...props} persona={{ ...props.persona, telefono: null }} />)
    expect(panel().queryByRole('link', { name: 'Avisar por WhatsApp' })).not.toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Reenviar invitación' })).toBeInTheDocument()
  })

  it('hides every action from who may not invite, but keeps the state and the history', () => {
    render(<DetallePersona {...base(VENCIDA, { servicios: [servicio(SIN_INVITAR)] })} />)
    expect(panel().getByText('Todavía no creó su cuenta')).toBeInTheDocument()
    expect(panel().getByRole('list', { name: 'Historial de la invitación a la plataforma' })).toBeInTheDocument()
    for (const nombre of ['Reenviar invitación', 'Cambiar correo', 'Cancelar invitación']) {
      expect(panel().queryByRole('button', { name: nombre })).not.toBeInTheDocument()
    }
    expect(panel().queryByRole('link', { name: 'Avisar por WhatsApp' })).not.toBeInTheDocument()
  })
})

describe('DetallePersona — invitación enviada', () => {
  it('says it was sent hours ago and still works, with Cambiar correo, WhatsApp and Cancelar (no Reenviar)', async () => {
    const props = base(ENVIADA)
    render(<DetallePersona {...props} />)
    expect(panel().getByText('Invitación para registrarse enviada hace 3 horas')).toBeInTheDocument()
    expect(
      panel().getByText('Todavía no creó su cuenta. El enlace sigue vigente unas horas más; si no le llegó, revisa el correo.'),
    ).toBeInTheDocument()
    expect(panel().queryByRole('button', { name: 'Reenviar invitación' })).not.toBeInTheDocument()
    expect(panel().getByRole('link', { name: 'Avisar por WhatsApp' })).toHaveAttribute('href', AVISO_WHATSAPP)
    await user.click(panel().getByRole('button', { name: 'Cancelar invitación' }))
    expect(props.onCancelarInvitacion).toHaveBeenCalledTimes(1)
    const historial = within(panel().getByRole('list', { name: 'Historial de la invitación a la plataforma' }))
    expect(historial.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `Invitación para crear su cuenta enviada a fernando.ramos@gmail.com${fechaCorta(ENVIADA_EL)} · por Edith Pérez`,
    ])
  })
})

describe('DetallePersona — ya se registró', () => {
  it('says when and with which email, and the history ends in "Eligió su contraseña y entró"; no actions', () => {
    render(<DetallePersona {...base(REGISTRADA, {}, true)} />)
    expect(panel().getByText('Ya se registró en la plataforma')).toBeInTheDocument()
    expect(
      panel().getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === `Entró el ${fechaCorta(ACEPTADA_EL)} con fernando.ramos@gmail.com. Ve sus turnos y recibe recordatorios.`,
      ),
    ).toBeInTheDocument()
    const historial = within(panel().getByRole('list', { name: 'Historial de la invitación a la plataforma' }))
    expect(historial.getAllByRole('listitem').at(-1)?.textContent).toBe(`Eligió su contraseña y entró${fechaCorta(ACEPTADA_EL)}`)
    expect(panel().queryByRole('button', { name: 'Cancelar invitación' })).not.toBeInTheDocument()
    expect(panel().queryByText('No tiene cuenta en la plataforma')).not.toBeInTheDocument()
  })
})

describe('DetallePersona — sin invitar', () => {
  it('keeps the "No tiene cuenta" callout with "Invitar a la plataforma"', async () => {
    const props = base(null)
    render(<DetallePersona {...props} />)
    expect(panel().getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(panel().queryByRole('list', { name: 'Historial de la invitación a la plataforma' })).not.toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Invitar a la plataforma' }))
    expect(props.onInvitar).toHaveBeenCalledTimes(1)
  })

  it('a cancelled latest invitation reads as sin invitar, says when it was cancelled and lists the history', async () => {
    const cancelada: ResumenInvitacion = {
      ...VENCIDA,
      estado: 'sin_invitar',
      historial: [VENCIDA.historial[0], { ...VENCIDA.historial[1], estado: 'cancelada' }],
    }
    const props = base(cancelada)
    render(<DetallePersona {...props} />)
    expect(panel().getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(panel().getByText(`Invitación cancelada el ${fechaCorta(REENVIO)}`)).toBeInTheDocument()
    expect(panel().queryByText('Todavía no creó su cuenta')).not.toBeInTheDocument()
    const historial = within(panel().getByRole('list', { name: 'Historial de la invitación a la plataforma' }))
    expect(historial.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `Invitación para crear su cuenta enviada a fernando.ramos@gmail.com${fechaCorta(PRIMER_ENVIO)} · por Edmir Muñoz`,
      `Invitación cancelada${fechaCorta(REENVIO)}`,
    ])
    expect(panel().queryByRole('button', { name: 'Cancelar invitación' })).not.toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Invitar a la plataforma' }))
    expect(props.onInvitar).toHaveBeenCalledTimes(1)
  })

  it('without invitation data (Mi equipo passes none) keeps the plain callout', () => {
    const props = base(null)
    const { invitacion: _sin, ...persona } = props.persona
    render(<DetallePersona {...props} persona={persona} />)
    expect(panel().getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(panel().queryByText(/Invitación cancelada/)).not.toBeInTheDocument()
    expect(panel().queryByRole('list', { name: 'Historial de la invitación a la plataforma' })).not.toBeInTheDocument()
  })
})
