/**
 * `<FechasBloqueadasClient>` — «Fechas que no puedo servir» (odd/tasks/
 * dps-asistencia-pco.md, T15c, S13.5, S13.6; artboard
 * design/dps-avisos/06). The server actions are mocked: the list with nota
 * and delete, «Agregar fecha» with Sundays or a range and an optional nota
 * (up to 200), the empty state, and the services already inside a blocked
 * date shown as a warning with a link, never answered for the person.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FechasBloqueadasClient } from '@/components/mis-servicios/fechas-bloqueadas-client'
import * as acciones from '@/lib/actions/dps-avisos.actions'
import { leerFechaBloqueada, leerServicioAviso, type FechaBloqueada, type ServicioAviso } from '@/lib/platform/dps/avisos'
import { MENSAJE_NOTA_BLOQUEO } from '@/lib/platform/dps/errores'

jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  agregarFechaBloqueadaDps: jest.fn(),
  quitarFechaBloqueadaDps: jest.fn(),
  responderServicioDps: jest.fn(),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <header>{titulo}</header>,
}))

const agregar = acciones.agregarFechaBloqueadaDps as jest.MockedFunction<typeof acciones.agregarFechaBloqueadaDps>
const quitar = acciones.quitarFechaBloqueadaDps as jest.MockedFunction<typeof acciones.quitarFechaBloqueadaDps>
const responder = acciones.responderServicioDps as jest.MockedFunction<typeof acciones.responderServicioDps>

const B1 = '55555555-5555-4555-8555-555555555501'
const B2 = '55555555-5555-4555-8555-555555555502'
const B3 = '55555555-5555-4555-8555-555555555503'
const PLAN_15 = '66666666-6666-4666-8666-666666666615'

const SERVICIO_15 = {
  plan_id: PLAN_15,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  roles: [{ origen: 'columna', puesto_id: null, columna: 'host', nombre: 'Host', equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'confirmo',
  motivo: null,
  respondido_at: null,
  cambio: false,
  quitado: false,
  visto_at: null,
  antes: null,
  enviado_at: '2026-11-09T14:00:00+00:00',
  enviado_por: 'Andrés Valero',
}

const fecha = (json: Record<string, unknown>): FechaBloqueada => leerFechaBloqueada(json)!
const PROGRAMADOS: ServicioAviso[] = [leerServicioAviso(SERVICIO_15)!]

const FECHAS = [
  fecha({ id: B1, desde: '2026-11-22', hasta: '2026-11-22', nota: 'Viaje a Mérida', conflictos: [] }),
  fecha({ id: B2, desde: '2026-12-20', hasta: '2027-01-03', nota: 'Vacaciones en familia', conflictos: [] }),
]

function renderFechas(fechas: FechaBloqueada[] = FECHAS) {
  return render(<FechasBloqueadasClient fechas={fechas} programados={PROGRAMADOS} hoy="2026-11-09" />)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('FechasBloqueadasClient', () => {
  it('lists the blocked dates with their nota', () => {
    renderFechas()
    const lista = screen.getByRole('list', { name: 'Próximas' })
    expect(within(lista).getByText('Domingo 22 de noviembre').closest('li')).toHaveTextContent('Viaje a Mérida')
    expect(within(lista).getByText('Del 20 dic al 3 ene').closest('li')).toHaveTextContent('3 domingos · Vacaciones en familia')
  })

  it('shows the empty state', () => {
    renderFechas([])
    expect(screen.getByText('No tienes fechas bloqueadas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar fecha' })).toBeInTheDocument()
  })

  it('removes a date through the action', async () => {
    quitar.mockResolvedValue({ ok: true, data: null })
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar domingo 22 de noviembre' }))

    expect(quitar).toHaveBeenCalledWith({ id: B1 })
    expect(screen.queryByText('Domingo 22 de noviembre')).not.toBeInTheDocument()
  })

  it('keeps the date and explains when removing fails', async () => {
    quitar.mockResolvedValue({ ok: false, message: 'No pudimos identificarte. Vuelve a iniciar sesión.', codigo: 'sin_autoridad' })
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar domingo 22 de noviembre' }))

    expect(screen.getByText('Domingo 22 de noviembre')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos identificarte. Vuelve a iniciar sesión.')
  })

  it('adds a Sunday with a nota and warns about the service inside without answering it', async () => {
    agregar.mockResolvedValue({
      ok: true,
      data: fecha({ id: B3, desde: '2026-11-15', hasta: '2026-11-15', nota: 'Guardia', conflictos: [SERVICIO_15] }),
    })
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar fecha' })
    const domingo = within(dialogo).getByRole('button', { name: /domingo 15 de noviembre, ya estás programado como Host/ })
    await userEvent.click(domingo)
    expect(domingo).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo).getByText(/Ya estás programado el domingo 15 de noviembre/)).toBeInTheDocument()
    await userEvent.type(within(dialogo).getByLabelText(/Nota/), 'Guardia')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(agregar).toHaveBeenCalledWith({ desde: '2026-11-15', hasta: '2026-11-15', nota: 'Guardia' })
    const fila = screen.getByText('Domingo 15 de noviembre').closest('li')!
    expect(fila).toHaveTextContent('Ya estás programado como Host el domingo 15')
    expect(within(fila).getByRole('link', { name: /Responder «No puedo»/ })).toHaveAttribute('href', `/mis-servicios/${PLAN_15}#no-puedo`)
    expect(responder).not.toHaveBeenCalled()
  })

  it('adds a range of dates', async () => {
    agregar.mockResolvedValue({ ok: true, data: fecha({ id: B3, desde: '2027-02-01', hasta: '2027-02-14', nota: null, conflictos: [] }) })
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar fecha' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Un rango de fechas' }))
    await userEvent.type(within(dialogo).getByLabelText('Desde'), '2027-02-01')
    await userEvent.type(within(dialogo).getByLabelText('Hasta'), '2027-02-14')
    expect(within(dialogo).getByText(/Incluye/)).toHaveTextContent('Incluye 2 domingos.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(agregar).toHaveBeenCalledWith({ desde: '2027-02-01', hasta: '2027-02-14', nota: null })
    expect(screen.getByText('Del 1 feb al 14 feb')).toBeInTheDocument()
  })

  it('refuses a nota over 200 characters without calling the action', async () => {
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar fecha' })
    await userEvent.click(within(dialogo).getByRole('button', { name: /domingo 29 de noviembre/ }))
    await userEvent.click(within(dialogo).getByLabelText(/Nota/))
    await userEvent.paste('a'.repeat(201))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(within(dialogo).getByText(MENSAJE_NOTA_BLOQUEO)).toBeInTheDocument()
    expect(agregar).not.toHaveBeenCalled()
  })

  it('shows the action’s message when saving fails', async () => {
    agregar.mockResolvedValue({ ok: false, message: 'Tienes demasiadas fechas bloqueadas (máximo 100). Quita alguna antes de agregar otra.', codigo: 'demasiados' })
    renderFechas()

    await userEvent.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar fecha' })
    await userEvent.click(within(dialogo).getByRole('button', { name: /domingo 29 de noviembre/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Tienes demasiadas fechas bloqueadas (máximo 100).')
  })
})
