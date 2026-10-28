/**
 * Estructura — dated shifts (T2 of odd/tasks/tlr-calendario-servicios.md, A3):
 * a new shift is "Semanal" or "Por fechas", the list shows the tipo, and a team
 * lists a dated shift explicitly (it is never inherited by default).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosCampus } from '@/components/dream-team/estructura/turnos-campus'
import { TurnosEquipo } from '@/components/dream-team/estructura/turnos-equipo'
import { crearTurno, guardarTurnosEquipo } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import type { Turno } from '@/lib/platform/dream-team/turnos'

jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({
  crearTurno: jest.fn(),
  cambiarActivoTurno: jest.fn(),
  guardarTurnosEquipo: jest.fn(),
}))

const crear = crearTurno as jest.Mock
const guardarEquipo = guardarTurnosEquipo as jest.Mock

const T9 = '00000000-0000-4000-8000-000000000009'
const T11 = '00000000-0000-4000-8000-000000000011'
const TLR = '00000000-0000-4000-8000-000000000010'
const turnos: Turno[] = [
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true, tipo: 'semanal' },
  { id: T11, campusId: 'bqt', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true, tipo: 'semanal' },
  { id: TLR, campusId: 'bqt', nombre: 'The Living Room', diaSemana: 0, hora: '10:00', orden: 3, activo: true, tipo: 'fechas' },
]
const campus = [{ id: 'bqt', nombre: 'Barquisimeto' }]
const toast = () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) as never

beforeEach(() => {
  jest.clearAllMocks()
  crear.mockResolvedValue({ ok: true })
  guardarEquipo.mockResolvedValue({ ok: true })
})

describe('TurnosCampus', () => {
  it('shows a dated shift as "Por fechas"', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />)
    expect(screen.getByText('Por fechas · 10:00')).toBeInTheDocument()
    expect(screen.getByText('Domingo · 09:00')).toBeInTheDocument()
  })

  it('creates a dated shift without a weekday', async () => {
    const onActualizado = jest.fn()
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={onActualizado} toast={toast()} />)
    await userEvent.type(screen.getByLabelText('Nombre del turno'), 'Living Room')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'fechas')
    expect(screen.queryByLabelText('Día')).not.toBeInTheDocument()
    expect(screen.getByText(/Sólo lo sirven los equipos que lo eligen/)).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Hora'))
    await userEvent.type(screen.getByLabelText('Hora'), '10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar turno' }))
    await waitFor(() => expect(onActualizado).toHaveBeenCalled())
    expect(crear).toHaveBeenCalledWith({ campusId: 'bqt', nombre: 'Living Room', diaSemana: 0, hora: '10:00', orden: 4, tipo: 'fechas' })
  })

  it('offers "Semanal" by default with the weekday', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={jest.fn()} toast={toast()} />)
    expect(screen.getByLabelText('Tipo')).toHaveValue('semanal')
    expect(screen.getByLabelText('Día')).toBeInTheDocument()
  })
})

describe('TurnosEquipo', () => {
  const base = { equipoLabel: 'TLR', turnos, onActualizado: jest.fn() }

  it('lists dated shifts apart and explains they must be chosen', () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar toast={toast()} />)
    const region = screen.getByRole('group', { name: 'Turnos por fechas' })
    expect(region).toHaveTextContent('Un turno por fechas sólo lo sirven los equipos que lo eligen aquí')
    expect(screen.getByRole('checkbox', { name: /The Living Room/ })).not.toBeChecked()
  })

  it('choosing a dated shift on an inheriting team keeps the weekly ones inherited', async () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar toast={toast()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /The Living Room/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [TLR] }))
  })

  it('keeps the previous save of an inheriting team when no dated shift is chosen', async () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar toast={toast()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [T9, T11] }))
  })

  it('names the dated shift the team serves', () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[TLR]} efectivos={[T9, T11, TLR]} puedeEditar={false} toast={toast()} />)
    expect(screen.getByText('Domingo 9:00 · Domingo 11:00 · The Living Room')).toBeInTheDocument()
  })
})
