/**
 * «Enviar avisos» with the e-mail channel (odd/tasks/dps-asistencia-pco.md,
 * T16b; S14.1; artboard design/dps-avisos-correo/06): the note says the
 * notices go by e-mail and to the panel, the summary «N por correo · M solo
 * en el panel», that replies reach the planner, each person's channel
 * («Correo y panel» / «Solo panel · sin correo en su ficha», panel-only
 * first), and the toast «Enviamos N avisos: X por correo y Y solo en el
 * panel». Server actions mocked; every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PanelAvisos, textoEnvio } from '@/components/dps/avisos-panel'
import * as avisos from '@/lib/actions/dps-avisos.actions'
import { leerEnvioAvisos, leerPendientesAvisos } from '@/lib/platform/dps/avisos'

jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  cargarAvisosPendientesDps: jest.fn(),
  enviarAvisosDps: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const cargarPendientes = mock(avisos.cargarAvisosPendientesDps)
const enviar = mock(avisos.enviarAvisosDps)

const PLAN = '11111111-1111-4111-8111-111111111111'
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const rol = (nombre: string, equipo: string) => ({ origen: 'puesto', puesto_id: null, columna: null, nombre, equipo, direccion: equipo, automatico: false })
const persona = (n: number, nombre: string, tieneCorreo: boolean) => ({
  plan_id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  serie: null,
  persona_id: id(n),
  nombre,
  iniciales: 'XX',
  tiene_cuenta: true,
  tiene_correo: tieneCorreo,
})

const PENDIENTES = leerPendientesAvisos({
  total: 4,
  por_correo: 3,
  solo_panel: 1,
  remitente: { nombre: 'Elena Garrido', email: 'elena@example.test' },
  nuevas: [
    { ...persona(1, 'Simón Arrieta', true), roles: [rol('Streaming', 'Audio')], automatico: false, reemplaza: [] },
    { ...persona(2, 'Ximena Rangel', false), roles: [rol('Stage manager', 'Producción Creativa')], automatico: false, reemplaza: [] },
  ],
  cambios: [
    {
      ...persona(3, 'Lorena Ibarra', true),
      roles: [rol('Escenario', 'Audio')],
      reinicia: true,
      estado: 'pendiente',
      horarios: ['09:00'],
      llegada: '07:30',
      roles_antes: [rol('Monitores', 'Audio')],
    },
  ],
  quitados: [{ ...persona(4, 'Hugo Pacheco', true), roles: [rol('Escenario', 'Audio')] }],
  no_reciben: { ya_respondieron: [], sin_cuenta: [], sin_cambios: 0 },
})

beforeEach(() => {
  jest.clearAllMocks()
  cargarPendientes.mockResolvedValue({ ok: true, data: PENDIENTES })
  enviar.mockResolvedValue({ ok: true, data: leerEnvioAvisos({ enviados: 4, nuevas: 2, cambios: 1, quitados: 1, cerrados: 0, por_correo: 3, solo_panel: 1 }) })
})

function abrir(onEnviado = jest.fn()) {
  render(<PanelAvisos abierto onCerrar={jest.fn()} planIds={[PLAN]} descripcion="Domingo 15 nov 2026" onEnviado={onEnviado} />)
  return screen.findByRole('dialog', { name: 'Enviar avisos' })
}

describe('the channel of each notice (06)', () => {
  it('says the notices go by e-mail and to the panel, and how to answer', async () => {
    const panel = await abrir()
    expect(within(panel).getByText('Les llega por correo y a su panel en Global Connect.')).toBeInTheDocument()
    expect(panel).toHaveTextContent('Desde el correo confirman con un toque, sin iniciar sesión. Para «No puedo» entran a la app y escriben el motivo.')
  })

  it('sums up the channels and says replies reach the planner', async () => {
    const panel = await abrir()
    const resumen = await within(panel).findByRole('group', { name: 'Cómo llegan los avisos' })
    expect(resumen).toHaveTextContent('3 por correo · 1 solo en el panel')
    expect(resumen).toHaveTextContent('Las respuestas al correo te llegan a ti (elena@example.test). Si alguien dice que no puede, también te llega un correo con el motivo.')
  })

  it('marks each person «Correo y panel» or «Solo panel · sin correo en su ficha», panel-only first', async () => {
    const panel = await abrir()
    const nuevas = await within(panel).findByRole('region', { name: /Nuevas invitaciones/ })
    const filas = within(nuevas).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Ximena Rangel')
    expect(filas[0]).toHaveTextContent('Solo panel · sin correo en su ficha')
    expect(filas[1]).toHaveTextContent('Simón Arrieta')
    expect(filas[1]).toHaveTextContent('Correo y panel')
    expect(within(panel).getByRole('region', { name: /Cambios para quien ya sabía/ })).toHaveTextContent('Correo y panel')
    expect(within(panel).getByRole('region', { name: /Ya no estás programado/ })).toHaveTextContent('Correo y panel')
  })

  it('says replies do not reach a planner without an e-mail', async () => {
    cargarPendientes.mockResolvedValue({ ok: true, data: { ...PENDIENTES, remitente: { nombre: 'Elena Garrido', email: null } } })
    const panel = await abrir()
    const resumen = await within(panel).findByRole('group', { name: 'Cómo llegan los avisos' })
    expect(resumen).toHaveTextContent('No tienes correo en tu ficha: las respuestas al correo no te llegarán.')
  })

  it('hands the send with its channels to the caller', async () => {
    const onEnviado = jest.fn()
    const panel = await abrir(onEnviado)
    await userEvent.click(await within(panel).findByRole('button', { name: 'Enviar 4 avisos' }))
    await waitFor(() => expect(onEnviado).toHaveBeenCalledWith(expect.objectContaining({ enviados: 4, porCorreo: 3, soloPanel: 1 })))
  })
})

describe('textoEnvio (the toast)', () => {
  it('says how many went by e-mail and how many only to the panel', () => {
    expect(textoEnvio(leerEnvioAvisos({ enviados: 14, nuevas: 12, cambios: 1, quitados: 1, por_correo: 12, solo_panel: 2 }))).toBe(
      'Enviamos 14 avisos: 12 por correo y 2 solo en el panel.',
    )
    expect(textoEnvio(leerEnvioAvisos({ enviados: 1, nuevas: 1, por_correo: 1, solo_panel: 0 }))).toBe('Enviamos 1 aviso: 1 por correo y 0 solo en el panel.')
  })

  it('keeps the closures-only and nothing-to-send sentences', () => {
    expect(textoEnvio(leerEnvioAvisos({ enviados: 0, cerrados: 1 }))).toBe('Listo: 1 persona que dijo «No puedo» salió del plan, sin otro aviso.')
    expect(textoEnvio(leerEnvioAvisos({ enviados: 0 }))).toBe('No había avisos por enviar.')
  })
})
