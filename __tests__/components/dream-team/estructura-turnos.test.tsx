/**
 * Estructura — campus service shifts (T8, D12 of odd/tasks/ninos-voluntarios-waumba.md):
 * the campus list (add, enable/disable) and the shifts a team serves in
 * (own restriction or inherited).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosCampus } from '@/components/dream-team/estructura/turnos-campus'
import { TurnosEquipo } from '@/components/dream-team/estructura/turnos-equipo'
import {
  cambiarActivoTurno,
  crearTurno,
  guardarTurnosEquipo,
} from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import type { Turno } from '@/lib/platform/dream-team/turnos'

jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({
  crearTurno: jest.fn(),
  cambiarActivoTurno: jest.fn(),
  guardarTurnosEquipo: jest.fn(),
}))

const crear = crearTurno as jest.Mock
const cambiarActivo = cambiarActivoTurno as jest.Mock
const guardarEquipo = guardarTurnosEquipo as jest.Mock

const T9 = '00000000-0000-4000-8000-000000000009'
const T11 = '00000000-0000-4000-8000-000000000011'
const T17 = '00000000-0000-4000-8000-000000000017'
const turnos: Turno[] = [
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
  { id: T11, campusId: 'bqt', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true },
  { id: T17, campusId: 'bqt', nombre: 'Sábado 17:00', diaSemana: 6, hora: '17:00', orden: 3, activo: false },
]
const campus = [{ id: 'bqt', nombre: 'Barquisimeto' }]

function toast() {
  return { success: jest.fn(), error: jest.fn(), info: jest.fn() } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  crear.mockResolvedValue({ ok: true })
  cambiarActivo.mockResolvedValue({ ok: true })
  guardarEquipo.mockResolvedValue({ ok: true })
})

describe('TurnosCampus', () => {
  it('lists the shifts of the campus with their day and hour', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />)
    expect(screen.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(screen.getByText('Sábado · 17:00 · Desactivado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar turno' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('adds a shift to the campus', async () => {
    const onActualizado = jest.fn()
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={onActualizado} toast={toast()} />)
    await userEvent.type(screen.getByLabelText('Nombre del turno'), 'Miércoles 19:00')
    await userEvent.selectOptions(screen.getByLabelText('Día'), '3')
    await userEvent.clear(screen.getByLabelText('Hora'))
    await userEvent.type(screen.getByLabelText('Hora'), '19:00')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar turno' }))
    await waitFor(() => expect(onActualizado).toHaveBeenCalled())
    expect(crear).toHaveBeenCalledWith({ campusId: 'bqt', nombre: 'Miércoles 19:00', diaSemana: 3, hora: '19:00', orden: 4 })
  })

  it('disables a shift with its switch', async () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={jest.fn()} toast={toast()} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Turno Domingo 9:00' }))
    await waitFor(() => expect(cambiarActivo).toHaveBeenCalledWith({ id: T9, activo: false }))
  })
})

describe('TurnosEquipo', () => {
  const base = { equipoLabel: 'Sala 3', turnos, onActualizado: jest.fn() }

  it('shows the inherited shifts of a team without its own restriction', () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar={false} toast={toast()} />)
    expect(screen.getByText(/Heredados del equipo superior/)).toBeInTheDocument()
    expect(screen.getByText('Domingo 9:00 · Domingo 11:00')).toBeInTheDocument()
  })

  it('saves an own restriction', async () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar toast={toast()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Domingo 9:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [T11] }))
  })

  it('goes back to inheriting', async () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[T9]} efectivos={[T9]} puedeEditar toast={toast()} />)
    expect(screen.getByText(/Elegidos para este equipo/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Heredar del equipo superior' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [] }))
  })

  it('offers only active shifts to choose from', () => {
    render(<TurnosEquipo {...base} equipoId="e1" propios={[]} efectivos={[T9, T11]} puedeEditar toast={toast()} />)
    expect(screen.queryByRole('checkbox', { name: /Sábado 17:00/ })).not.toBeInTheDocument()
  })
})
