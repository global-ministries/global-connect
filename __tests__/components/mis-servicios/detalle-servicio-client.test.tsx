/**
 * `<DetalleServicioClient>` — one service of the person (odd/tasks/
 * dps-asistencia-pco.md, T15c, S13.5; artboard design/dps-avisos/05). The
 * server actions are mocked: «Tu servicio», «Quiénes sirven contigo» by área
 * with only Confirmó / Por confirmar (never another person's «No puedo» or
 * motivo), the order with the person's part, Confirmar / No puedo with the
 * optional motivo, «Agregar a mis fechas que no puedo servir», and past
 * plans read-only. Every person is fictitious.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DetalleServicioClient } from '@/components/mis-servicios/detalle-servicio-client'
import * as acciones from '@/lib/actions/dps-avisos.actions'
import { leerMiServicio, leerServicioAviso, type MiServicio } from '@/lib/platform/dps/avisos'

jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  responderServicioDps: jest.fn(),
  agregarFechaBloqueadaDps: jest.fn(),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <header>{titulo}</header>,
}))

const responder = acciones.responderServicioDps as jest.MockedFunction<typeof acciones.responderServicioDps>
const bloquear = acciones.agregarFechaBloqueadaDps as jest.MockedFunction<typeof acciones.agregarFechaBloqueadaDps>

const PLAN = '22222222-2222-4222-8222-222222222215'
const YO = '33333333-3333-4333-8333-333333333301'
const P2 = '33333333-3333-4333-8333-333333333302'
const P3 = '33333333-3333-4333-8333-333333333303'
const P4 = '33333333-3333-4333-8333-333333333304'

const rol = (nombre: string, equipo: string, direccion: string) => ({ origen: 'puesto', puesto_id: null, columna: null, nombre, equipo, direccion, automatico: false })
const COMUNICADOR = { ...rol('Comunicador', 'Producción Creativa', 'Producción Creativa'), origen: 'columna', columna: 'comunicador' }

const SERVICIO = {
  plan_id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: 4,
  serie: { nombre: 'Tu casa tiene influencers', color: 'chart-2', imagen_path: null },
  roles: [COMUNICADOR],
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
}

const companero = (persona_id: string, nombre: string, roles: unknown[], confirmo: boolean, yo = false) => ({
  persona_id,
  nombre,
  iniciales: nombre.split(' ').map((p) => p[0]).join(''),
  yo,
  roles,
  confirmo,
})

const DETALLE_JSON = {
  servicio: SERVICIO,
  pasado: false,
  personas: 4,
  confirmaron: 2,
  companeros: [
    companero(P2, 'Ximena Rangel', [rol('Productora', 'Producción Creativa', 'Producción Creativa')], true),
    companero(YO, 'Valentina Duarte', [COMUNICADOR], false, true),
    companero(P3, 'Mauricio Lara', [rol('Cantantes', 'Global Music', 'Global Music')], false),
    companero(P4, 'Rubén Carvajal', [rol('FOH', 'Audio', 'Producción Técnica')], true),
  ],
  orden: [
    { id: 'o1', posicion: 0, tipo: 'item', titulo: 'Bienvenida', duracion_seg: 300, notas: null, responsable: 'Host', fase: null },
    { id: 'o2', posicion: 1, tipo: 'item', titulo: 'Anuncios', duracion_seg: 300, notas: null, responsable: 'Comunicador', fase: null },
  ],
}

const detalle = (parche: Record<string, unknown> = {}): MiServicio => leerMiServicio({ ...DETALLE_JSON, ...parche })!

function renderDetalle(d: MiServicio = detalle(), fechaBloqueada = false) {
  return render(<DetalleServicioClient detalle={d} fechaBloqueada={fechaBloqueada} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  window.location.hash = ''
})

describe('DetalleServicioClient', () => {
  it('shows the service, who scheduled the person and the state', () => {
    renderDetalle()
    expect(screen.getByRole('heading', { level: 1, name: 'Domingo 15 de noviembre' })).toBeInTheDocument()
    expect(screen.getByText('Tu casa tiene influencers · Semana 4')).toBeInTheDocument()
    const tuServicio = screen.getByRole('region', { name: 'Tu servicio' })
    expect(tuServicio).toHaveTextContent('Comunicador')
    expect(tuServicio).toHaveTextContent('9:00 y 11:30')
    expect(tuServicio).toHaveTextContent('7:30')
    expect(tuServicio).toHaveTextContent('Andrés Valero')
    expect(screen.getAllByText('Pendiente de respuesta').length).toBeGreaterThan(0)
  })

  it('groups whom the person serves with by área, only Confirmó / Por confirmar', () => {
    renderDetalle()
    const contigo = screen.getByRole('region', { name: 'Quiénes sirven contigo' })
    expect(contigo).toHaveTextContent('4 personas · 2 confirmaron')
    const creativa = within(contigo).getByRole('list', { name: /Producción Creativa/ })
    expect(within(creativa).getByText('Ximena Rangel').closest('li')).toHaveTextContent('Confirmó')
    expect(within(creativa).getByText('Tú').closest('li')).toHaveTextContent('Por responder')
    const music = within(contigo).getByRole('list', { name: /Global Music/ })
    expect(within(music).getByText('Mauricio Lara').closest('li')).toHaveTextContent('Por confirmar')
    expect(within(contigo).getByRole('list', { name: /Producción Técnica/ })).toHaveTextContent('Audio · FOH')
    expect(contigo).not.toHaveTextContent(/No puede/)
  })

  it('never shows another person’s «No puedo» even when the person answered «No puedo»', () => {
    renderDetalle(detalle({ servicio: { ...SERVICIO, estado: 'no_puede', motivo: 'Viaje' } }))
    const contigo = screen.getByRole('region', { name: 'Quiénes sirven contigo' })
    expect(within(contigo).getByText('Mauricio Lara').closest('li')).toHaveTextContent('Por confirmar')
    expect(within(contigo).getByText('Tú').closest('li')).toHaveTextContent('No puedes')
  })

  it('highlights the person’s part in the order', async () => {
    renderDetalle()
    const orden = screen.getByRole('region', { name: 'Orden del servicio' })
    await userEvent.click(within(orden).getByText(/2 momentos/))
    const anuncios = within(orden).getByText('Anuncios').closest('li')
    expect(anuncios).toHaveTextContent('Tú')
    expect(within(orden).getByText('Bienvenida').closest('li')).not.toHaveTextContent('Tú')
    expect(orden).toHaveTextContent('Tu parte: Anuncios a las 9:05 y a las 11:35.')
  })

  it('confirms through the action and offers «Cambiar respuesta»', async () => {
    responder.mockResolvedValue({ ok: true, data: leerServicioAviso({ ...SERVICIO, estado: 'confirmo' })! })
    renderDetalle()
    const barra = screen.getByRole('region', { name: 'Tu respuesta' })

    await userEvent.click(within(barra).getByRole('button', { name: 'Confirmar' }))

    expect(responder).toHaveBeenCalledWith({ planId: PLAN, respuesta: 'confirmo' })
    expect(barra).toHaveTextContent('Confirmaste. Tu equipo ya lo ve.')
    expect(screen.getByRole('region', { name: 'Quiénes sirven contigo' })).toHaveTextContent('4 personas · 3 confirmaron')
    await userEvent.click(within(barra).getByRole('button', { name: 'Cambiar respuesta' }))
    expect(within(barra).getByRole('button', { name: 'No puedo' })).toBeInTheDocument()
  })

  it('answers «No puedo» with motivo and blocks the date when asked', async () => {
    responder.mockResolvedValue({ ok: true, data: leerServicioAviso({ ...SERVICIO, estado: 'no_puede', motivo: 'Viaje' })! })
    bloquear.mockResolvedValue({ ok: true, data: { id: '44444444-4444-4444-8444-444444444444', desde: '2026-11-15', hasta: '2026-11-15', nota: null, conflictos: [] } })
    renderDetalle()

    await userEvent.click(within(screen.getByRole('region', { name: 'Tu respuesta' })).getByRole('button', { name: 'No puedo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'No puedo servir' })
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), 'Viaje')
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: /Agregar a mis fechas que no puedo servir/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar respuesta' }))

    expect(responder).toHaveBeenCalledWith({ planId: PLAN, respuesta: 'no_puede', motivo: 'Viaje' })
    expect(bloquear).toHaveBeenCalledWith({ desde: '2026-11-15', hasta: '2026-11-15', nota: null })
    expect(screen.getByRole('region', { name: 'Tu respuesta' })).toHaveTextContent('Avisamos a quien planifica: «Viaje». También bloqueamos esta fecha.')
  })

  it('does not offer to block a date that is already blocked', async () => {
    renderDetalle(detalle(), true)
    await userEvent.click(within(screen.getByRole('region', { name: 'Tu respuesta' })).getByRole('button', { name: 'No puedo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'No puedo servir' })
    expect(within(dialogo).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('opens «No puedo» when arriving from a blocked date (#no-puedo)', async () => {
    window.location.hash = '#no-puedo'
    renderDetalle()
    expect(await screen.findByRole('dialog', { name: 'No puedo servir' })).toBeInTheDocument()
    expect(responder).not.toHaveBeenCalled()
  })

  it('keeps a past plan read-only', () => {
    renderDetalle(detalle({ pasado: true, servicio: { ...SERVICIO, estado: 'confirmo' } }))
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'No puedo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar respuesta' })).not.toBeInTheDocument()
    expect(screen.getByText('Este servicio ya pasó.')).toBeInTheDocument()
  })
})
