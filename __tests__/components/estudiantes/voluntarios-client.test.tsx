/**
 * `<VoluntariosClient>` — volunteer attendance of Transit, Inside Out and The
 * Living Room (C5 of odd/tasks/estudiantes-fase-b.md) in the planning style
 * (E4a of odd/tasks/estudiantes-estilo-dps.md, S6; artboards 06 / 07 of
 * design/estudiantes-dps). The server actions are mocked: each flow checks
 * what is sent, the optimistic mark and its rollback, "Marcar el resto como
 * Faltó", the read-only view, the filters and their counts, the summary, the
 * Equipos bar, the service picker and the date pill. Every person is
 * fictitious.
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
const marca = (nombre: string, texto: 'Presente' | 'Avisó' | 'Faltó') => within(filaDe(nombre)).getByRole('button', { name: `${texto}: ${nombre} Rivas` })
const filtros = () => within(screen.getByRole('group', { name: 'Mostrar' }))
const cuentas = () => filtros().getAllByRole('button').map((b) => b.textContent)
const resumen = () => screen.getAllByText((_, el) => el?.tagName === 'P' && el.getAttribute('aria-live') === 'polite')[0]

beforeEach(() => {
  jest.clearAllMocks()
  marcar.mockResolvedValue({ ok: true, data: { cambiados: 1 } })
  cargar.mockResolvedValue({ ok: true, data: PLANILLA })
})

describe('VoluntariosClient', () => {
  it('shows the service, the summary, the filters and the expected volunteers by equipo', () => {
    render(<VoluntariosClient {...props()} />)
    expect(screen.getAllByRole('heading', { name: 'Voluntarios' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Servicio')).toHaveValue('t1')
    expect(screen.getByRole('group', { name: 'Fecha' })).toHaveTextContent('Domingo 25 oct')
    // «esperados» so it does not read as the count of a filter (S6).
    expect(resumen()).toHaveTextContent('2 esperados sin marcar · 2 de 4 marcados')
    expect(filtros().getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true')
    const logistica = screen.getByRole('region', { name: /Logística/ })
    expect(logistica).toHaveTextContent(/^Logística\s*1\/3 marcados/)
    expect(marca('Ana', 'Presente')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: /Sin turno asignado/ })).toHaveTextContent('Elena Rivas')
  })

  it('each filter count equals the rows it shows (S6)', async () => {
    render(<VoluntariosClient {...props()} />)
    expect(cuentas()).toEqual(['Todos 5', 'Sin marcar 3', 'Presentes 1', 'Avisó 0', 'Faltó 1'])
    await userEvent.click(filtros().getByRole('button', { name: /Sin marcar/ }))
    expect(screen.getAllByRole('group', { name: /^Asistencia de / })).toHaveLength(3)
    expect(filaDe('Elena')).toBeInTheDocument()
    await userEvent.click(filtros().getByRole('button', { name: /Todos/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar voluntario' }), 'diego')
    expect(cuentas()).toEqual(['Todos 1', 'Sin marcar 0', 'Presentes 0', 'Avisó 0', 'Faltó 1'])
  })

  it('narrows to an equipo from the Equipos bar; the counts follow it', async () => {
    render(<VoluntariosClient {...props()} />)
    const equipos = within(screen.getByRole('group', { name: 'Equipos' }))
    expect(equipos.getByRole('button', { name: /Todos los equipos/ })).toHaveAttribute('aria-pressed', 'true')
    expect(equipos.getByRole('button', { name: /Logística/ })).toHaveTextContent('1/32 sin marcar')
    await userEvent.click(equipos.getByRole('button', { name: /Producción/ }))
    expect(screen.queryByRole('region', { name: /Logística/ })).not.toBeInTheDocument()
    expect(cuentas()).toEqual(['Todos 1', 'Sin marcar 0', 'Presentes 0', 'Avisó 0', 'Faltó 1'])
  })

  it('marks on tap and sends the servicio', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(marca('Bruno', 'Avisó'))
    expect(marca('Bruno', 'Avisó')).toHaveAttribute('aria-pressed', 'true')
    expect(marcar).toHaveBeenCalledWith({ turnoId: 't1', fecha: '2026-10-25', servicioIds: ['s2'], estado: 'justificado', soloSinMarcar: false })
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
  })

  it('clears the mark with a second tap on the pressed state', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(marca('Ana', 'Presente'))
    expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ servicioIds: ['s1'], estado: null }))
    expect(marca('Ana', 'Presente')).toHaveAttribute('aria-pressed', 'false')
  })

  it('rolls the mark back and explains when saving fails', async () => {
    marcar.mockResolvedValueOnce({ ok: false, message: 'No tienes permiso para marcar a este voluntario.' })
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(marca('Bruno', 'Faltó'))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tienes permiso para marcar a este voluntario.'))
    expect(marca('Bruno', 'Faltó')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('estado-guardado')).toHaveTextContent('No se pudo guardar')
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
    expect(marca('Bruno', 'Presente')).toBeDisabled()
    expect(marca('Bruno', 'Avisó')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Marcar el resto/ })).not.toBeInTheDocument()
  })

  it('filters by the pressed filter and by name', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.click(filtros().getByRole('button', { name: /Sin marcar/ }))
    expect(filtros().getByRole('button', { name: /Sin marcar/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Asistencia de Ana Rivas' })).not.toBeInTheDocument()
    expect(filaDe('Bruno')).toBeInTheDocument()
    await userEvent.click(filtros().getByRole('button', { name: /Todos/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar voluntario' }), 'diego')
    expect(filaDe('Diego')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Asistencia de Bruno Rivas' })).not.toBeInTheDocument()
  })

  it('opens another service or date through the URL', async () => {
    render(<VoluntariosClient {...props()} />)
    await userEvent.selectOptions(screen.getByLabelText('Servicio'), 't3')
    expect(replace).toHaveBeenLastCalledWith('/estudiantes/voluntarios?turno=t3&fecha=2026-10-28', { scroll: false })
    const fecha = within(screen.getByRole('group', { name: 'Fecha' }))
    await userEvent.click(fecha.getByRole('button', { name: 'Fecha anterior, domingo 18 oct' }))
    expect(replace).toHaveBeenLastCalledWith('/estudiantes/voluntarios?turno=t1&fecha=2026-10-18', { scroll: false })
    expect(fecha.getByRole('button', { name: 'Es la fecha más reciente' })).toBeDisabled()
  })

  it('steps through the planned dates of a dated service, and says when there are none', () => {
    const { unmount } = render(<VoluntariosClient {...props({ servicio: { turnoId: 't3', fecha: '2026-10-28' } })} />)
    const fecha = within(screen.getByRole('group', { name: 'Fecha' }))
    expect(screen.getByRole('group', { name: 'Fecha' })).toHaveTextContent('Miércoles 28 oct')
    expect(fecha.getByRole('button', { name: 'Fecha anterior, miércoles 14 oct' })).toBeEnabled()
    expect(fecha.getByRole('button', { name: 'Es la fecha más reciente' })).toBeDisabled()
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
