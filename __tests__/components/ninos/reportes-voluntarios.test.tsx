import { fireEvent, render, screen, within } from '@testing-library/react'

import { PestanasReportes } from '@/components/ninos/reportes-pestanas'
import { ReportesVoluntariosClient } from '@/components/ninos/reportes-voluntarios-client'

const rpc = jest.fn()
const replace = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))

function servicio(parcial: Record<string, unknown>) {
  return {
    fecha: '2026-10-04',
    turno_id: 't9',
    turno: 'Domingo 9:00',
    turno_orden: 1,
    area_id: 'aw',
    area: 'Waumba Land',
    equipo_id: 'em',
    equipo: 'Maternal',
    esperados: 0,
    presentes: 0,
    avisos: 0,
    faltas: 0,
    sin_marcar: 0,
    extras: 0,
    ...parcial,
  }
}

function voluntario(parcial: Record<string, unknown>) {
  return {
    servicio_id: 's1',
    nombre: 'Ana Prueba',
    area: 'Waumba Land',
    equipo: 'Maternal',
    rol: 'Voluntario',
    esperados: 2,
    presentes: 0,
    avisos: 0,
    faltas: 0,
    sin_marcar: 0,
    extras: 0,
    faltas_seguidas: 0,
    ...parcial,
  }
}

const reporte = {
  desde: '2026-09-27',
  hasta: '2026-10-04',
  servicios: [
    servicio({ fecha: '2026-09-27', esperados: 2, presentes: 1, faltas: 1 }),
    servicio({ esperados: 2, presentes: 1, faltas: 1, extras: 1 }),
    servicio({ equipo_id: 'ep', equipo: 'Producción', esperados: 1, sin_marcar: 1 }),
  ],
  voluntarios: [
    voluntario({ servicio_id: 's1', nombre: 'Luis Prueba', faltas: 2, faltas_seguidas: 2 }),
    voluntario({ servicio_id: 's2', nombre: 'Ana Prueba', presentes: 2 }),
  ],
}

const filtros = { desde: '2026-09-27', hasta: '2026-10-04', campusId: '', turnoId: '' }
const turnos = [{ id: 't9', nombre: 'Domingo 9:00', campusId: 'c1' }]
const campus = [{ id: 'c1', nombre: 'Campus Uno' }]

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  rpc.mockResolvedValue({ data: reporte, error: null })
})

function renderReporte() {
  return render(<ReportesVoluntariosClient campus={campus} turnos={turnos} filtrosIniciales={filtros} />)
}

describe('ReportesVoluntariosClient', () => {
  it('loads the volunteer report for the range and shows the totals', async () => {
    renderReporte()
    const resumen = await screen.findByRole('region', { name: 'Resumen de voluntarios' })
    expect(rpc).toHaveBeenCalledWith('ninos_reporte_voluntarios', { p_desde: '2026-09-27', p_hasta: '2026-10-04' })
    expect(within(resumen).getByTestId('total-esperados')).toHaveTextContent('5')
    expect(within(resumen).getByTestId('total-faltas')).toHaveTextContent('2')
    expect(within(resumen).getByTestId('total-sin-marcar')).toHaveTextContent('1')
    expect(within(resumen).getByTestId('total-asistencia')).toHaveTextContent('20%')
  })

  it('lists the volunteers who missed several services in a row first', async () => {
    renderReporte()
    const alerta = await screen.findByRole('region', { name: 'Faltan seguido' })
    expect(within(alerta).getByText('Luis Prueba')).toBeInTheDocument()
    expect(within(alerta).getByText(/2 faltas seguidas/)).toBeInTheDocument()
    expect(within(alerta).queryByText('Ana Prueba')).not.toBeInTheDocument()
  })

  it('shows one row per service and per equipo', async () => {
    renderReporte()
    const servicios = await screen.findByRole('region', { name: 'Por servicio' })
    expect(within(servicios).getAllByText('Domingo 9:00').length).toBeGreaterThanOrEqual(2)
    const equipos = screen.getByRole('region', { name: 'Por equipo' })
    expect(within(equipos).getAllByText('Producción').length).toBeGreaterThan(0)
  })

  it('offers the CSV exports', async () => {
    renderReporte()
    await screen.findByRole('region', { name: 'Por servicio' })
    expect(screen.getAllByRole('button', { name: /Exportar CSV/ })).toHaveLength(2)
  })

  it('keeps the volunteers tab in the URL when a filter changes', async () => {
    renderReporte()
    await screen.findByRole('region', { name: 'Por servicio' })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-06' } })
    expect(replace).toHaveBeenLastCalledWith('/ninos/reportes?desde=2026-09-06&hasta=2026-10-04&reporte=voluntarios')
  })

  it('explains an empty range, pointing at the services without turnos', async () => {
    rpc.mockResolvedValue({ data: { servicios: [], voluntarios: [] }, error: null })
    renderReporte()
    expect(await screen.findByText('No hay asistencia de voluntarios en este rango.')).toBeInTheDocument()
    expect(screen.getByText(/sin turno asignado no cuentan/)).toBeInTheDocument()
  })

  it('explains an invalid range', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'rango_invalido' } })
    renderReporte()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Revisa las fechas/)
  })
})

describe('PestanasReportes', () => {
  it('links both tabs keeping the filters and marks the current one', () => {
    render(<PestanasReportes actual="voluntarios" filtros={filtros} />)
    const ninos = screen.getByRole('link', { name: 'Niños' })
    const voluntarios = screen.getByRole('link', { name: 'Voluntarios' })
    expect(ninos).toHaveAttribute('href', '/ninos/reportes?desde=2026-09-27&hasta=2026-10-04')
    expect(voluntarios).toHaveAttribute('href', '/ninos/reportes?desde=2026-09-27&hasta=2026-10-04&reporte=voluntarios')
    expect(voluntarios).toHaveAttribute('aria-current', 'page')
    expect(ninos).not.toHaveAttribute('aria-current')
  })
})
