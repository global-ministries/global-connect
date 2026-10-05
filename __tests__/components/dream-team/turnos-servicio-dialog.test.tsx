import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'

const T9 = '00000000-0000-4000-8000-000000000009'
const T11 = '00000000-0000-4000-8000-000000000011'
const turnos = [
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
  { id: T11, campusId: 'bqt', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true },
]

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function abrir(onGuardado = jest.fn()) {
  render(
    <TurnosServicioDialog servicioId="srv-1" nombre="Ana Pérez" abierto onAbiertoChange={jest.fn()} onGuardado={onGuardado} />,
  )
  return onGuardado
}

it('loads the shifts and marks the assigned ones', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { turnos, asignados: [T11] }))
  abrir()
  expect(await screen.findByRole('checkbox', { name: /Domingo 9:00/ })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /Domingo 11:00/ })).toBeChecked()
  expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/srv-1/turnos', expect.anything())
})

it('saves the chosen shifts', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { turnos, asignados: [] }))
  fetchMock.mockReturnValueOnce(respuesta(200, { asignados: [T9, T11] }))
  const onGuardado = abrir()
  await userEvent.click(await screen.findByRole('checkbox', { name: /Domingo 9:00/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /Domingo 11:00/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toBe('/api/dream-team/servicios/srv-1/turnos')
  expect(init.method).toBe('PUT')
  expect(JSON.parse(init.body)).toEqual({ turnoIds: [T9, T11] })
})

it('shows the server message when a shift is rejected', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { turnos, asignados: [] }))
  fetchMock.mockReturnValueOnce(respuesta(422, { error: 'Ese turno no está disponible.' }))
  const onGuardado = abrir()
  await userEvent.click(await screen.findByRole('checkbox', { name: /Domingo 9:00/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ese turno no está disponible.')
  expect(onGuardado).not.toHaveBeenCalled()
})

it('says so when the team serves in no shift', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { turnos: [], asignados: [] }))
  abrir()
  expect(await screen.findByText(/no tiene turnos/i)).toBeInTheDocument()
})
