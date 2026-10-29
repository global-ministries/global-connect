/**
 * Estructura — dated shifts (T2 of odd/tasks/tlr-calendario-servicios.md, A3):
 * a new shift is "Semanal" or "Por fechas", the list shows the tipo, and a team
 * lists a dated shift explicitly (it is never inherited by default). On design
 * system v2 the campus list is turnos-campus.tsx ("Agregar turno" is a sheet)
 * and a team's shifts are the node panel's Turnos tab (panel-nodo-turnos.tsx).
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosCampus } from '@/components/dream-team/estructura/turnos-campus'
import { PanelNodoTurnos } from '@/components/dream-team/estructura/panel-nodo-turnos'
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

async function abrirAgregarTurno() {
  await userEvent.click(screen.getByRole('button', { name: 'Agregar turno' }))
  return within(screen.getByRole('dialog', { name: 'Agregar turno' }))
}

describe('TurnosCampus', () => {
  it('shows a dated shift as "Por fechas", in its own card', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />)
    const porFechas = within(screen.getByRole('region', { name: 'Por fechas' }))
    expect(porFechas.getByText('Por fechas · 10:00')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Semanales' })).getByText('Domingo · 09:00')).toBeInTheDocument()
  })

  it('creates a dated shift without a weekday', async () => {
    const onActualizado = jest.fn()
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={onActualizado} toast={toast()} />)
    const hoja = await abrirAgregarTurno()
    await userEvent.type(hoja.getByLabelText('Nombre del turno'), 'Living Room')
    await userEvent.selectOptions(hoja.getByLabelText('Tipo'), 'fechas')
    expect(hoja.queryByLabelText('Día')).not.toBeInTheDocument()
    expect(hoja.getByText(/Sólo lo sirven los equipos que lo eligen/)).toBeInTheDocument()
    await userEvent.clear(hoja.getByLabelText('Hora'))
    await userEvent.type(hoja.getByLabelText('Hora'), '10:00')
    await userEvent.click(hoja.getByRole('button', { name: 'Agregar turno' }))
    await waitFor(() => expect(onActualizado).toHaveBeenCalled())
    expect(crear).toHaveBeenCalledWith({ campusId: 'bqt', nombre: 'Living Room', diaSemana: 0, hora: '10:00', orden: 4, tipo: 'fechas' })
  })

  it('offers "Semanal" by default with the weekday', async () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={jest.fn()} toast={toast()} />)
    const hoja = await abrirAgregarTurno()
    expect(hoja.getByLabelText('Tipo')).toHaveValue('semanal')
    expect(hoja.getByLabelText('Día')).toBeInTheDocument()
  })
})

describe('the Turnos tab of a node', () => {
  const base = {
    equipoId: 'e1',
    equipoLabel: 'TLR',
    onEditando: jest.fn(),
    onActualizado: jest.fn(),
  }
  const datos = (propios: readonly string[], efectivos: readonly string[]) => ({ turnos, campusId: null, propios, efectivos })

  it('lists dated shifts apart and explains they must be chosen', () => {
    render(<PanelNodoTurnos {...base} datos={datos([], [T9, T11])} puedeEditar editando toast={toast()} />)
    const grupo = screen.getByRole('group', { name: 'Por fechas' })
    expect(grupo).toHaveTextContent('Solo lo sirven los equipos que lo eligen aquí')
    expect(screen.getByRole('checkbox', { name: /The Living Room/ })).not.toBeChecked()
  })

  it('choosing a dated shift on an inheriting team keeps the weekly ones inherited', async () => {
    render(<PanelNodoTurnos {...base} datos={datos([], [T9, T11])} puedeEditar editando toast={toast()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /The Living Room/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [TLR] }))
  })

  it('keeps the previous save of an inheriting team when no dated shift is chosen', async () => {
    render(<PanelNodoTurnos {...base} datos={datos([], [T9, T11])} puedeEditar editando toast={toast()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [T9, T11] }))
  })

  it('names the dated shift the team serves', () => {
    render(<PanelNodoTurnos {...base} datos={datos([TLR], [T9, T11, TLR])} puedeEditar={false} editando={false} toast={toast()} />)
    const lista = within(screen.getByRole('list', { name: 'Turnos de TLR' }))
    expect(lista.getAllByRole('listitem').map((item) => item.firstChild?.textContent)).toEqual([
      'Domingo 9:00',
      'Domingo 11:00',
      'The Living Room',
    ])
  })
})
