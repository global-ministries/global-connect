/**
 * `<TarjetaMisServicios>` — «Mis servicios» at the top of the panel
 * (odd/tasks/dps-asistencia-pco.md, T15c, S13.5; artboards
 * design/dps-avisos/04 and 07). The server actions are mocked: the card
 * hides without services or notices, answers Confirmar / No puedo (motivo
 * up to 300) through responderServicioDps and applies the answer in place,
 * dismisses «Cambió tu servicio» / «Ya no estás programado» through
 * marcarAvisoVistoDps and lists the upcoming services. Every person is
 * fictitious.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TarjetaMisServicios } from '@/components/mis-servicios/tarjeta-mis-servicios'
import * as acciones from '@/lib/actions/dps-avisos.actions'
import { leerMisServicios, leerServicioAviso, type ServicioAviso } from '@/lib/platform/dps/avisos'
import { MENSAJE_MOTIVO } from '@/lib/platform/dps/errores'

jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  responderServicioDps: jest.fn(),
  marcarAvisoVistoDps: jest.fn(),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))

const responder = acciones.responderServicioDps as jest.MockedFunction<typeof acciones.responderServicioDps>
const marcarVisto = acciones.marcarAvisoVistoDps as jest.MockedFunction<typeof acciones.marcarAvisoVistoDps>

const PLAN_15 = '11111111-1111-4111-8111-111111111115'
const PLAN_22 = '11111111-1111-4111-8111-111111111122'
const PLAN_29 = '11111111-1111-4111-8111-111111111129'
const PLAN_13 = '11111111-1111-4111-8111-111111111213'

const rol = (nombre: string) => ({ origen: 'columna', puesto_id: null, columna: 'comunicador', nombre, equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false })

const servicioJson = (planId: string, fecha: string, parche: Record<string, unknown> = {}) => ({
  plan_id: planId,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: 4,
  serie: { nombre: 'Tu casa tiene influencers', color: 'chart-2', imagen_path: null },
  roles: [rol('Comunicador')],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'pendiente',
  motivo: null,
  respondido_at: null,
  cambio: false,
  quitado: false,
  visto_at: null,
  antes: { roles: null, fecha: null, horarios: null, llegada: null },
  enviado_at: '2026-11-09T14:00:00+00:00',
  enviado_por: 'Andrés Valero',
  ...parche,
})

const servicio = (json: Record<string, unknown>): ServicioAviso => leerServicioAviso(json)!

const PENDIENTE = servicioJson(PLAN_15, '2026-11-15')
const CAMBIO = servicioJson(PLAN_29, '2026-11-29', {
  estado: 'confirmo',
  cambio: true,
  horarios: ['11:30'],
  llegada: '10:00',
  antes: { roles: null, fecha: null, horarios: ['09:00', '11:30'], llegada: '07:30' },
})
const QUITADO = servicioJson(PLAN_22, '2026-11-22', { roles: [rol('Host')], quitado: true, estado: 'confirmo' })
const CONFIRMADO = servicioJson(PLAN_13, '2026-12-13', { roles: [rol('Host')], estado: 'confirmo' })

const DATOS = leerMisServicios({
  servicios: [PENDIENTE, CAMBIO, CONFIRMADO],
  avisos: [CAMBIO, QUITADO],
  por_responder: 1,
  fechas_bloqueadas: 3,
})

function renderTarjeta(datos = DATOS) {
  return render(<TarjetaMisServicios inicial={datos} hoy="2026-11-09" />)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('TarjetaMisServicios', () => {
  it('renders nothing without services nor notices', () => {
    const { container } = renderTarjeta(leerMisServicios({ servicios: [], avisos: [], por_responder: 0, fechas_bloqueadas: 2 }))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending service with its date, roles, horarios and llegada', () => {
    renderTarjeta()
    expect(screen.getByRole('heading', { name: 'Mis servicios' })).toBeInTheDocument()
    const pendiente = screen.getByRole('article', { name: 'Domingo 15 de noviembre' })
    expect(within(pendiente).getByText('Pendiente de respuesta')).toBeInTheDocument()
    expect(within(pendiente).getByText('Comunicador')).toBeInTheDocument()
    expect(within(pendiente).getByText('9:00 y 11:30')).toBeInTheDocument()
    expect(within(pendiente).getByText('7:30')).toBeInTheDocument()
    expect(within(pendiente).getByRole('link', { name: /Ver el servicio/ })).toHaveAttribute('href', `/mis-servicios/${PLAN_15}`)
    expect(screen.getByText(/servicio por responder/)).toHaveTextContent('Tienes 1 servicio por responder.')
  })

  it('confirms through the action and applies the answer in place', async () => {
    responder.mockResolvedValue({ ok: true, data: servicio({ ...PENDIENTE, estado: 'confirmo', respondido_at: '2026-11-09T15:00:00+00:00' }) })
    renderTarjeta()
    const pendiente = screen.getByRole('article', { name: 'Domingo 15 de noviembre' })

    await userEvent.click(within(pendiente).getByRole('button', { name: 'Confirmar' }))

    expect(responder).toHaveBeenCalledWith({ planId: PLAN_15, respuesta: 'confirmo' })
    expect(within(pendiente).getByText('Confirmado')).toBeInTheDocument()
    expect(within(pendiente).getByText('Gracias. Tu equipo ya lo ve.')).toBeInTheDocument()
    expect(within(pendiente).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(within(pendiente).getByRole('button', { name: 'Cambiar respuesta' })).toBeInTheDocument()
    expect(screen.getByText(/Respondiste todos tus servicios/)).toBeInTheDocument()
  })

  it('answers «No puedo» with the optional motivo', async () => {
    responder.mockResolvedValue({ ok: true, data: servicio({ ...PENDIENTE, estado: 'no_puede', motivo: 'Estaré de viaje' }) })
    renderTarjeta()
    const pendiente = screen.getByRole('article', { name: 'Domingo 15 de noviembre' })

    await userEvent.click(within(pendiente).getByRole('button', { name: 'No puedo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'No puedo servir' })
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), '  Estaré de viaje ')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar respuesta' }))

    expect(responder).toHaveBeenCalledWith({ planId: PLAN_15, respuesta: 'no_puede', motivo: 'Estaré de viaje' })
    expect(within(pendiente).getByText('No puedo')).toBeInTheDocument()
    expect(within(pendiente).getByText('Avisamos a quien planifica: «Estaré de viaje».')).toBeInTheDocument()
  })

  it('refuses a motivo over 300 characters without calling the action', async () => {
    renderTarjeta()
    const pendiente = screen.getByRole('article', { name: 'Domingo 15 de noviembre' })

    await userEvent.click(within(pendiente).getByRole('button', { name: 'No puedo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'No puedo servir' })
    const campo = within(dialogo).getByLabelText(/Motivo/)
    await userEvent.click(campo)
    await userEvent.paste('a'.repeat(301))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar respuesta' }))

    expect(within(dialogo).getByText(MENSAJE_MOTIVO)).toBeInTheDocument()
    expect(responder).not.toHaveBeenCalled()
  })

  it('keeps the item pending and explains when the action fails', async () => {
    responder.mockResolvedValue({ ok: false, message: 'Ya no estás programado en este servicio. Actualiza la página.', codigo: 'sin_autoridad' })
    renderTarjeta()
    const pendiente = screen.getByRole('article', { name: 'Domingo 15 de noviembre' })

    await userEvent.click(within(pendiente).getByRole('button', { name: 'Confirmar' }))

    expect(within(pendiente).getByRole('alert')).toHaveTextContent('Ya no estás programado en este servicio. Actualiza la página.')
    expect(within(pendiente).getByText('Pendiente de respuesta')).toBeInTheDocument()
    expect(within(pendiente).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('shows «Cambió tu servicio» before and after, and «Ya no estás programado»', () => {
    renderTarjeta()
    const cambio = screen.getByRole('article', { name: 'Cambió tu servicio del domingo 29 de noviembre' })
    expect(cambio).toHaveTextContent('Ahora sirves a las 11:30 (antes 9:00 y 11:30).')
    expect(cambio).toHaveTextContent('Llegada 10:00 (antes 7:30).')
    expect(cambio).toHaveTextContent('Sigues confirmado.')
    const quitado = screen.getByRole('article', { name: 'Ya no estás programado el domingo 22 de noviembre · Host' })
    expect(quitado).toHaveTextContent('Quien planifica cambió el equipo. No tienes que hacer nada.')
  })

  it('dismisses a notice through marcarAvisoVistoDps', async () => {
    marcarVisto.mockResolvedValue({ ok: true, data: null })
    renderTarjeta()
    const quitado = screen.getByRole('article', { name: /Ya no estás programado el domingo 22/ })

    await userEvent.click(within(quitado).getByRole('button', { name: 'Entendido' }))

    expect(marcarVisto).toHaveBeenCalledWith({ planId: PLAN_22 })
    expect(screen.queryByRole('article', { name: /Ya no estás programado/ })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Cambió tu servicio/ })).toBeInTheDocument()
  })

  it('keeps the notice when dismissing fails', async () => {
    marcarVisto.mockResolvedValue({ ok: false, message: 'No se pudo guardar.', codigo: null })
    renderTarjeta()
    const quitado = screen.getByRole('article', { name: /Ya no estás programado el domingo 22/ })

    await userEvent.click(within(quitado).getByRole('button', { name: 'Entendido' }))

    expect(screen.getByRole('article', { name: /Ya no estás programado/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.')
  })

  it('hides itself once the last notice is dismissed and nothing is left', async () => {
    marcarVisto.mockResolvedValue({ ok: true, data: null })
    const { container } = renderTarjeta(leerMisServicios({ servicios: [], avisos: [QUITADO], por_responder: 0, fechas_bloqueadas: 0 }))

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('lists the upcoming services with their state and links «Fechas que no puedo servir»', () => {
    renderTarjeta()
    const proximos = screen.getByRole('list', { name: 'Próximos' })
    const fila = within(proximos).getByRole('link', { name: /Host/ })
    expect(fila).toHaveAttribute('href', `/mis-servicios/${PLAN_13}`)
    expect(fila).toHaveTextContent('Domingo 13 dic · 9:00 y 11:30 · llegada 7:30')
    expect(fila).toHaveTextContent('Confirmado')
    expect(screen.getAllByRole('link', { name: /Fechas que no puedo servir/ })[0]).toHaveAttribute('href', '/mis-servicios/fechas')
  })
})
