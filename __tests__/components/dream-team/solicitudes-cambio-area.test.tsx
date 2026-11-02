/**
 * `<SolicitudesCambioArea>` (odd/tasks/dream-team-cambiar-area.md, T2, S5):
 * the requests a director of both áreas resolves (Aprobar / Rechazar with an
 * optional answer) and the viewer's own with their estado. Nothing when empty.
 * The list comes from the server page (dream_team_solicitudes_cambio_area());
 * after a decision the screen refreshes it.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SolicitudesCambioArea } from '@/components/dream-team/solicitudes-cambio-area'
import type { SolicitudCambioArea } from '@/lib/platform/dream-team/cambiar-area'

const PENDIENTE: SolicitudCambioArea = {
  id: 'sol-1',
  estado: 'pendiente',
  puedeResolver: true,
  esMia: false,
  personaNombre: 'Ana Pérez',
  origenRuta: 'DPS › Producción Técnica › Cámaras',
  rolOrigen: 'Voluntario',
  destinoRuta: 'DPS › Operaciones › Estacionamiento',
  rolDestino: 'Voluntario',
  motivo: 'traslado',
  nota: 'Pasa a estacionamiento',
  solicitanteNombre: 'Pedro Técnico',
  respuesta: null,
  resueltoPorNombre: null,
  creadaEn: '2026-11-02T10:00:00Z',
  resueltaEn: null,
}
const MIA: SolicitudCambioArea = {
  ...PENDIENTE,
  id: 'sol-2',
  estado: 'rechazada',
  puedeResolver: false,
  esMia: true,
  personaNombre: 'Luis Gómez',
  motivo: 'correccion',
  nota: null,
  respuesta: 'No hay cupo',
  resueltoPorNombre: 'Rosaura Díaz',
  resueltaEn: '2026-11-02T12:00:00Z',
}

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  fetchMock.mockReset()
  toast.success.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  user = userEvent.setup({ delay: null })
})

function montar(solicitudes: readonly SolicitudCambioArea[] = [PENDIENTE]) {
  const onResuelta = jest.fn()
  const vista = render(<SolicitudesCambioArea solicitudes={solicitudes} onResuelta={onResuelta} toast={toast} />)
  return { onResuelta, ...vista }
}

const fila = (nombre: string) => within(screen.getByRole('listitem', { name: nombre }))

it('lists the request to resolve and the own one with its estado', () => {
  montar([PENDIENTE, MIA])
  expect(screen.getByRole('heading', { name: 'Solicitudes de cambio de área' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()

  const pendiente = fila('Ana Pérez')
  expect(pendiente.getByText(/Cámaras \(Voluntario\)/)).toBeInTheDocument()
  expect(pendiente.getByText(/Estacionamiento \(Voluntario\)/)).toBeInTheDocument()
  expect(pendiente.getByText(/Traslado · Pidió Pedro Técnico/)).toBeInTheDocument()
  expect(pendiente.getByText('«Pasa a estacionamiento»')).toBeInTheDocument()
  expect(pendiente.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
  expect(pendiente.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()

  const mia = fila('Luis Gómez')
  expect(mia.getByText('Rechazada')).toBeInTheDocument()
  expect(mia.getByText(/Rosaura Díaz: «No hay cupo»/)).toBeInTheDocument()
  expect(mia.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
})

it('approves without an answer, then refreshes', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { id: 'nuevo' }))
  const { onResuelta } = montar()
  await user.click(screen.getByRole('button', { name: 'Aprobar' }))
  const dialogo = within(screen.getByRole('dialog', { name: 'Aprobar el cambio de área' }))
  await user.click(dialogo.getByRole('button', { name: 'Aprobar cambio' }))
  await waitFor(() => expect(onResuelta).toHaveBeenCalled())
  expect(fetchMock.mock.calls[0][0]).toBe('/api/dream-team/solicitudes-cambio-area/sol-1')
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ aprobar: true, respuesta: null })
  expect(toast.success).toHaveBeenCalledWith('Ana Pérez pasó a Estacionamiento.')
  expect(screen.queryByRole('dialog', { name: 'Aprobar el cambio de área' })).not.toBeInTheDocument()
})

it('rejects with an optional answer', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { id: null }))
  const { onResuelta } = montar()
  await user.click(screen.getByRole('button', { name: 'Rechazar' }))
  const dialogo = within(screen.getByRole('dialog', { name: 'Rechazar la solicitud' }))
  await user.type(dialogo.getByRole('textbox', { name: 'Respuesta (opcional)' }), 'No hay cupo')
  await user.click(dialogo.getByRole('button', { name: 'Rechazar solicitud' }))
  await waitFor(() => expect(onResuelta).toHaveBeenCalled())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ aprobar: false, respuesta: 'No hay cupo' })
  expect(toast.success).toHaveBeenCalledWith('Solicitud rechazada.')
})

it('shows the Spanish error of the database inside the dialog', async () => {
  const mensaje = 'El servicio cambió desde que se envió la solicitud (fue retirado o ya no está en esa área); no se puede aprobar.'
  fetchMock.mockReturnValueOnce(respuesta(422, { error: mensaje }))
  const { onResuelta } = montar()
  await user.click(screen.getByRole('button', { name: 'Aprobar' }))
  const dialogo = within(screen.getByRole('dialog', { name: 'Aprobar el cambio de área' }))
  await user.click(dialogo.getByRole('button', { name: 'Aprobar cambio' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent(mensaje)
  expect(onResuelta).not.toHaveBeenCalled()
})

it('renders nothing without requests', () => {
  const { container } = montar([])
  expect(container).toBeEmptyDOMElement()
})
