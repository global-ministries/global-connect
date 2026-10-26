/**
 * Turnos of a servicio — a dated shift (T2 of odd/tasks/tlr-calendario-servicios.md, S3):
 * it reads "Por fechas" and offers no weekly/biweekly choice; it is always saved weekly.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'

const T9 = '00000000-0000-4000-8000-000000000009'
const TLR = '00000000-0000-4000-8000-000000000010'
const turnos = [
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true, tipo: 'semanal' },
  { id: TLR, campusId: 'bqt', nombre: 'The Living Room', diaSemana: 0, hora: '10:00', orden: 2, activo: true, tipo: 'fechas' },
]

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

it('shows a dated shift as "Por fechas" with no frequency selector, and saves it weekly', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { turnos, asignados: [T9, TLR] }))
  fetchMock.mockReturnValueOnce(respuesta(200, { asignados: [T9, TLR] }))
  const onGuardado = jest.fn()
  render(<TurnosServicioDialog servicioId="srv-1" nombre="Ana" abierto onAbiertoChange={jest.fn()} onGuardado={onGuardado} />)

  expect(await screen.findByRole('checkbox', { name: /The Living Room/ })).toBeChecked()
  expect(screen.getByText('Por fechas · 10:00')).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Frecuencia de The Living Room' })).not.toBeInTheDocument()
  // The weekly shift keeps its selector.
  expect(screen.getByRole('combobox', { name: 'Frecuencia de Domingo 9:00' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    turnoIds: [T9, TLR],
    frecuencias: { [T9]: { frecuencia: 'semanal', fechaAncla: null }, [TLR]: { frecuencia: 'semanal', fechaAncla: null } },
  })
})
