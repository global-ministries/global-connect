/**
 * Estructura — campus service shifts (T8, D12 of odd/tasks/ninos-voluntarios-waumba.md),
 * on design system v2 (S12 of odd/tasks/sistema-diseno-v2.md):
 * - "Turnos del campus" (turnos-campus.tsx): the campus list in Semanales /
 *   Por fechas / Desactivados, an Interruptor per shift and "Agregar turno"
 *   in a sheet, only for whoever manages the structure.
 * - The node panel's Turnos tab (panel-nodo-turnos.tsx, which replaced the
 *   old TurnosEquipo card): the shifts a team serves in, its own restriction
 *   or the inherited one, and saving either.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TurnosCampus } from '@/components/dream-team/estructura/turnos-campus'
import { PanelNodoTurnos, type PanelNodoTurnosProps } from '@/components/dream-team/estructura/panel-nodo-turnos'
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
  it('lists the shifts of the campus with their day and hour, the deactivated ones apart', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />)
    const semanales = within(screen.getByRole('region', { name: 'Semanales' }))
    expect(semanales.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(semanales.getByText('Domingo · 09:00')).toBeInTheDocument()
    expect(semanales.queryByText('Sábado 17:00')).not.toBeInTheDocument()
    expect(screen.getByText('Sábado · 17:00 · Desactivado')).toBeInTheDocument()
    expect(screen.getByText(/Desactivados/)).toBeInTheDocument()
  })

  it('gives a read-only viewer a status per shift and nothing to change', () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />)
    expect(screen.queryByRole('button', { name: 'Agregar turno' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getAllByText('Activo')).toHaveLength(2)
  })

  it('adds a weekly shift to the campus from the "Agregar turno" sheet', async () => {
    const onActualizado = jest.fn()
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={onActualizado} toast={toast()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar turno' }))
    const hoja = within(screen.getByRole('dialog', { name: 'Agregar turno' }))
    expect(hoja.getByLabelText('Tipo')).toHaveValue('semanal')
    await userEvent.type(hoja.getByLabelText('Nombre del turno'), 'Miércoles 19:00')
    await userEvent.selectOptions(hoja.getByLabelText('Día'), '3')
    await userEvent.clear(hoja.getByLabelText('Hora'))
    await userEvent.type(hoja.getByLabelText('Hora'), '19:00')
    await userEvent.click(hoja.getByRole('button', { name: 'Agregar turno' }))
    await waitFor(() => expect(onActualizado).toHaveBeenCalled())
    expect(crear).toHaveBeenCalledWith({ campusId: 'bqt', nombre: 'Miércoles 19:00', diaSemana: 3, hora: '19:00', orden: 4 })
  })

  it('disables a shift with its switch, and enables a deactivated one', async () => {
    render(<TurnosCampus campus={campus} turnos={turnos} puedeEditar onActualizado={jest.fn()} toast={toast()} />)
    const interruptor = screen.getByRole('switch', { name: 'Turno Domingo 9:00' })
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(interruptor)
    await waitFor(() => expect(cambiarActivo).toHaveBeenCalledWith({ id: T9, activo: false }))
    await userEvent.click(screen.getByRole('switch', { name: 'Turno Sábado 17:00' }))
    await waitFor(() => expect(cambiarActivo).toHaveBeenCalledWith({ id: T17, activo: true }))
  })

  it('opens "Agregar turno" from the page when the page controls it', async () => {
    const onNuevoAbierto = jest.fn()
    const { rerender } = render(
      <TurnosCampus campus={campus} turnos={turnos} puedeEditar nuevoAbierto={false} onNuevoAbierto={onNuevoAbierto} onActualizado={jest.fn()} toast={toast()} />,
    )
    expect(screen.queryByRole('button', { name: 'Agregar turno' })).not.toBeInTheDocument()
    rerender(
      <TurnosCampus campus={campus} turnos={turnos} puedeEditar nuevoAbierto onNuevoAbierto={onNuevoAbierto} onActualizado={jest.fn()} toast={toast()} />,
    )
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Agregar turno' })).getByRole('button', { name: 'Cancelar' }))
    expect(onNuevoAbierto).toHaveBeenCalledWith(false)
  })
})

describe('the Turnos tab of a node (PanelNodoTurnos)', () => {
  function renderTurnos(props: Partial<PanelNodoTurnosProps> & { readonly propios: readonly string[]; readonly efectivos: readonly string[]; readonly campusId?: string | null; readonly lista?: readonly Turno[] }) {
    const { propios, efectivos, campusId = null, lista = turnos, ...resto } = props
    return render(
      <PanelNodoTurnos
        equipoId="e1"
        equipoLabel="Sala 3"
        datos={{ turnos: lista, campusId, propios, efectivos }}
        puedeEditar
        editando={false}
        onEditando={jest.fn()}
        onActualizado={jest.fn()}
        toast={toast()}
        {...resto}
      />,
    )
  }

  it('shows the inherited shifts of a team without its own restriction', () => {
    renderTurnos({ propios: [], efectivos: [T9, T11], puedeEditar: false })
    expect(screen.getByText(/Heredados del equipo superior/)).toBeInTheDocument()
    const lista = within(screen.getByRole('list', { name: 'Turnos de Sala 3' }))
    expect(lista.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(lista.getByText('Domingo 11:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar turnos' })).not.toBeInTheDocument()
  })

  it('saves an own restriction', async () => {
    renderTurnos({ propios: [], efectivos: [T9, T11], editando: true })
    await userEvent.click(screen.getByRole('checkbox', { name: /Domingo 9:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [T11] }))
  })

  it('goes back to inheriting', async () => {
    const { unmount } = renderTurnos({ propios: [T9], efectivos: [T9] })
    expect(screen.getByText(/Elegidos para este equipo/)).toBeInTheDocument()
    unmount()
    renderTurnos({ propios: [T9], efectivos: [T9], editando: true })
    await userEvent.click(screen.getByRole('button', { name: 'Heredar del superior' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [] }))
  })

  it('offers only active shifts to choose from', () => {
    renderTurnos({ propios: [], efectivos: [T9, T11], editando: true })
    expect(screen.queryByRole('checkbox', { name: /Sábado 17:00/ })).not.toBeInTheDocument()
  })
})

describe('shifts of the campus selected in the app', () => {
  const TCCS = '00000000-0000-4000-8000-000000000021'
  const conOtroCampus: Turno[] = [
    ...turnos,
    { id: TCCS, campusId: 'ccs', nombre: 'Sábado 18:00', diaSemana: 6, hora: '18:00', orden: 1, activo: true },
  ]
  const dosCampus = [...campus, { id: 'ccs', nombre: 'Caracas' }]

  it('TurnosCampus lists only the selected campus, and every campus when none is selected', () => {
    const { rerender } = render(
      <TurnosCampus campus={dosCampus} turnos={conOtroCampus} campusId="bqt" puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />,
    )
    expect(screen.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(screen.queryByText('Sábado 18:00')).not.toBeInTheDocument()
    rerender(
      <TurnosCampus campus={dosCampus} turnos={conOtroCampus} campusId={null} puedeEditar={false} onActualizado={jest.fn()} toast={toast()} />,
    )
    expect(screen.getByText('Sábado 18:00')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Caracas' })).toBeInTheDocument()
  })

  function renderPanel(editando: boolean) {
    return render(
      <PanelNodoTurnos
        equipoId="e1"
        equipoLabel="Sala 3"
        datos={{ turnos: conOtroCampus, campusId: 'bqt', propios: [T9, TCCS], efectivos: [T9, TCCS] }}
        puedeEditar
        editando={editando}
        onEditando={jest.fn()}
        onActualizado={jest.fn()}
        toast={toast()}
      />,
    )
  }

  it('the Turnos tab offers only the selected campus and keeps the restriction of other campuses when saving', async () => {
    renderPanel(true)
    expect(screen.queryByRole('checkbox', { name: /Sábado 18:00/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Sábado 18:00/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Domingo 11:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [TCCS, T9, T11] }))
  })

  it('the Turnos tab goes back to inheriting only for the selected campus', async () => {
    renderPanel(true)
    await userEvent.click(screen.getByRole('button', { name: 'Heredar del superior' }))
    await waitFor(() => expect(guardarEquipo).toHaveBeenCalledWith({ equipoId: 'e1', turnoIds: [TCCS] }))
  })
})
