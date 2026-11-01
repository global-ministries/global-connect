/**
 * `<VoluntariosClient>` — volunteer attendance of Transit, Inside Out and The
 * Living Room (C5 of odd/tasks/estudiantes-fase-b.md). The server actions are
 * mocked: each flow checks what is sent, the optimistic mark and its
 * rollback, "Marcar el resto como Faltó", the read-only view, the filters and
 * the service pickers. Every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { VoluntariosClient, type VoluntariosClientProps } from '@/components/estudiantes/voluntarios/voluntarios-client'
import * as acciones from '@/lib/actions/estudiantes-voluntarios.actions'
import type { TurnoVoluntariosEstudiantes } from '@/lib/platform/estudiantes/voluntarios'
import type { FilaVoluntario, Planilla } from '@/lib/platform/ninos/voluntarios'

jest.mock('@/lib/actions/estudiantes-voluntarios.actions', () => ({ cargarPlanillaVoluntarios: jest.fn(), marcarVoluntarios: jest.fn() }))

const toastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: toastError, info: jest.fn() }),
}))

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/estudiantes/voluntarios',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const marcar = acciones.marcarVoluntarios as jest.MockedFunction<typeof acciones.marcarVoluntarios>
const cargar = acciones.cargarPlanillaVoluntarios as jest.MockedFunction<typeof acciones.cargarPlanillaVoluntarios>

const T1: TurnoVoluntariosEstudiantes = {
  id: 't1',
  nombre: 'Domingo 9:00',
  hora: '09:00:00',
  orden: 1,
  diaSemana: 0,
  campusId: 'c1',
  campus: 'Barquisimeto',
  tipo: 'semanal',
  fechas: [],
}
const T3: TurnoVoluntariosEstudiantes = { ...T1, id: 't3', nombre: 'The Living Room', orden: 3, tipo: 'fechas', fechas: ['2026-10-28', '2026-10-14'] }

const fila = (parche: Partial<FilaVoluntario>): FilaVoluntario => ({
  servicio_id: 's',
  nombre: 'Ana',
  apellido: 'Rivas',
  area_id: 'transit',
  area: 'Transit',
  equipo_id: 'log',
  equipo: 'Logística',
  rol: 'voluntario',
  esperado: true,
  sin_turno: false,
  estado: null,
  ...parche,
})

const PLANILLA: Planilla = {
  turno: 'Domingo 9:00',
  fecha: '2026-10-25',
  editable: true,
  areas: [{ id: 'transit', nombre: 'Transit' }],
  voluntarios: [
    fila({ servicio_id: 's1', nombre: 'Ana', estado: 'presente' }),
    fila({ servicio_id: 's2', nombre: 'Bruno' }),
    fila({ servicio_id: 's3', nombre: 'Carla' }),
    fila({ servicio_id: 's4', nombre: 'Diego', equipo_id: 'prod', equipo: 'Producción', estado: 'ausente' }),
    fila({ servicio_id: 's5', nombre: 'Elena', esperado: false, sin_turno: true }),
  ],
}

const props = (parche: Partial<VoluntariosClientProps> = {}): VoluntariosClientProps => ({
  turnos: [T1, T3],
  servicio: { turnoId: 't1', fecha: '2026-10-25' },
  planilla: PLANILLA,
  error: null,
  ambitoInicial: null,
  hoy: '2026-10-31',
  ...parche,
})

const filaDe = (nombre: string) => screen.getByRole('group', { name: `Asistencia de ${nombre} Rivas` })

beforeEach(() => {
  jest.clearAllMocks()
  marcar.mockResolvedValue({ ok: true, data: { cambiados: 1 } })
  cargar.mockResolvedValue({ ok: true, data: PLANILLA })
})

describe('VoluntariosClient', () => {
  it('shows the service, the metrics and the expected volunteers by equipo', () => {
    render(<VoluntariosClient {...props()} />)
    expect(screen.getAllByRole('heading', { name: 'Voluntarios' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Servicio')).toHaveValue('t1')
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-25')
    expect(screen.getByRole('button', { name: /Sin marcar\s*2/ })).toHaveAttribute('aria-pressed', 'false')
    const logistica = screen.getByRole('region', { name: /Logística/ })
    expect(within(logistica).getByText('1 de 3 marcados')).toBeInTheDocument()
    expect(within(filaDe('Ana')).getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: /Sin turno asignado/ })).toHaveTextContent('Elena Rivas')
  })

  it('marks on tap and sends the servicio', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(within(filaDe('Bruno')).getByRole('button', { name: 'Avisó' }))
    expect(within(filaDe('Bruno')).getByRole('button', { name: 'Avisó' })).toHaveAttribute('aria-pressed', 'true')
    expect(marcar).toHaveBeenCalledWith({ turnoId: 't1', fecha: '2026-10-25', servicioIds: ['s2'], estado: 'justificado', soloSinMarcar: false })
  })

  it('clears the mark with a second tap on the pressed state', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(within(filaDe('Ana')).getByRole('button', { name: 'Presente' }))
    expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ servicioIds: ['s1'], estado: null }))
    expect(within(filaDe('Ana')).getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('rolls the mark back and explains when saving fails', async () => {
    marcar.mockResolvedValueOnce({ ok: false, message: 'No tienes permiso para marcar a este voluntario.' })
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(within(filaDe('Bruno')).getByRole('button', { name: 'Faltó' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tienes permiso para marcar a este voluntario.'))
    expect(within(filaDe('Bruno')).getByRole('button', { name: 'Faltó' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the rest of an equipo as Faltó after confirming, keeping the existing marks', async () => {
    render(<VoluntariosClient {...props()} />)
    const logistica = screen.getByRole('region', { name: /Logística/ })
    await userEvent.click(within(logistica).getByRole('button', { name: 'Marcar el resto como Faltó (2)' }))
    expect(marcar).not.toHaveBeenCalled()
    await userEvent.click(within(logistica).getByRole('button', { name: 'Sí, marcar' }))
    expect(marcar).toHaveBeenCalledWith({ turnoId: 't1', fecha: '2026-10-25', servicioIds: ['s2', 's3'], estado: 'ausente', soloSinMarcar: true })
    await waitFor(() => expect(cargar).toHaveBeenCalledWith({ turnoId: 't1', fecha: '2026-10-25' }))
  })

  it('is read-only outside the marking window', () => {
    render(<VoluntariosClient {...props({ planilla: { ...PLANILLA, editable: false } })} />)
    expect(screen.getByText(/Solo se puede marcar hoy o hasta 14 días atrás/)).toBeInTheDocument()
    expect(within(filaDe('Bruno')).getByRole('button', { name: 'Presente' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Marcar el resto/ })).not.toBeInTheDocument()
  })

  it('filters by the pressed metric and by name', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /Sin marcar\s*2/ }))
    expect(screen.getByRole('button', { name: /Sin marcar\s*2/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Asistencia de Ana Rivas' })).not.toBeInTheDocument()
    expect(filaDe('Bruno')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Sin marcar\s*2/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar voluntario' }), 'diego')
    expect(filaDe('Diego')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Asistencia de Bruno Rivas' })).not.toBeInTheDocument()
  })

  it('opens another service or date through the URL', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.selectOptions(screen.getByLabelText('Servicio'), 't3')
    expect(replace).toHaveBeenLastCalledWith('/estudiantes/voluntarios?turno=t3&fecha=2026-10-28', { scroll: false })
    await userEvent.selectOptions(screen.getByLabelText('Fecha'), '2026-10-18')
    expect(replace).toHaveBeenLastCalledWith('/estudiantes/voluntarios?turno=t1&fecha=2026-10-18', { scroll: false })
  })

  it('offers the planned dates of a dated service, and says when there are none', () => {
    const { unmount } = render(<VoluntariosClient {...props({ servicio: { turnoId: 't3', fecha: '2026-10-28' } })} />)
    expect(within(screen.getByLabelText('Fecha')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Miércoles 28 oct', 'Miércoles 14 oct'])
    unmount()
    render(<VoluntariosClient {...props({ turnos: [{ ...T3, fechas: [] }], servicio: { turnoId: 't3', fecha: null }, planilla: null })} />)
    expect(screen.getByText('Todavía no hay fechas de servicio')).toBeInTheDocument()
  })

  it('shows the error of the roster and the empty state without services', () => {
    const { unmount } = render(<VoluntariosClient {...props({ planilla: null, error: 'Esa fecha no es día de este servicio. Elige otra fecha.' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Esa fecha no es día de este servicio.')
    unmount()
    render(<VoluntariosClient {...props({ turnos: [], servicio: { turnoId: null, fecha: null }, planilla: null })} />)
    expect(screen.getByText('No hay servicios con voluntarios para marcar')).toBeInTheDocument()
  })
})
