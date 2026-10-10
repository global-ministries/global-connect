import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { ReportesClient } from '@/components/ninos/reportes-client'

const rpc = jest.fn()
const replace = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))

const t9 = { turno_id: 't9', turno: 'Domingo 9:00', turno_orden: 1 }
const t11 = { turno_id: 't11', turno: 'Domingo 11:00', turno_orden: 2 }

// Synthetic data. 27/09: A came to both services (UpStreet), B and C to the
// 9:00 (Waumba). 04/10: B came back and D came for the first time.
const reporte = {
  domingo_referencia: '2026-10-04',
  salones: [
    { fecha: '2026-10-04', turno_id: 't9', turno: 'Domingo 9:00', turno_orden: 1, salon_id: 's1', salon: 'Maternal',
      salon_orden: 1, area: 'waumba', capacidad: 20, ninos: 22, checkins: 22, pico: 21 },
  ],
  dias: [
    { fecha: '2026-09-27', ninos: 3, checkins: 4,
      turnos: [{ ...t9, ninos: 3, checkins: 3 }, { ...t11, ninos: 1, checkins: 1 }],
      areas: [{ area: 'upstreet', ninos: 1, checkins: 2 }, { area: 'waumba', ninos: 2, checkins: 2 }] },
    { fecha: '2026-10-04', ninos: 2, checkins: 2,
      turnos: [{ ...t9, ninos: 2, checkins: 2 }],
      areas: [{ area: 'waumba', ninos: 2, checkins: 2 }] },
  ],
  meses: [
    { mes: '2026-08-01', desde: '2026-08-16', hasta: '2026-08-31', parcial: true, ninos: 0, checkins: 0, dias: 0,
      promedio: null, nuevos: 0, familias_nuevas: 0, turnos: [], areas: [] },
    { mes: '2026-09-01', desde: '2026-09-01', hasta: '2026-09-30', parcial: false, ninos: 3, checkins: 4, dias: 1,
      promedio: 3, nuevos: 3, familias_nuevas: 2,
      turnos: [{ ...t9, ninos: 3, checkins: 3 }, { ...t11, ninos: 1, checkins: 1 }],
      areas: [{ area: 'upstreet', ninos: 1, checkins: 2 }, { area: 'waumba', ninos: 2, checkins: 2 }] },
    { mes: '2026-10-01', desde: '2026-10-01', hasta: '2026-10-04', parcial: true, ninos: 2, checkins: 2, dias: 1,
      promedio: 2, nuevos: 1, familias_nuevas: 1,
      turnos: [{ ...t9, ninos: 2, checkins: 2 }], areas: [{ area: 'waumba', ninos: 2, checkins: 2 }] },
  ],
  totales: {
    ninos: 4, checkins: 6, dias: 2, promedio: 2.5, nuevos: 4, familias_nuevas: 3,
    turnos: [{ ...t9, ninos: 4, checkins: 5 }, { ...t11, ninos: 1, checkins: 1 }],
    areas: [{ area: 'upstreet', ninos: 1, checkins: 2 }, { area: 'waumba', ninos: 3, checkins: 4 }],
  },
  nuevos: [
    { nino_id: 'a', nombre: 'Niño Uno', fecha: '2026-09-27', salon: '1º grado', visita_id: 'v1', padres: ['Padre Uno'],
      estado: 'no_volvio', estado_familia: 'no_volvio', visitas: 1, ultima_fecha: '2026-09-27' },
    { nino_id: 'b', nombre: 'Niña Dos', fecha: '2026-09-27', salon: 'Maternal', visita_id: 'v2', padres: ['Madre Dos'],
      estado: 'volvio', estado_familia: 'volvio', visitas: 2, ultima_fecha: '2026-10-04' },
    { nino_id: 'c', nombre: 'Niño Tres', fecha: '2026-09-27', salon: 'Maternal', visita_id: 'v2', padres: ['Madre Dos'],
      estado: 'no_volvio', estado_familia: 'volvio', visitas: 1, ultima_fecha: '2026-09-27' },
    { nino_id: 'd', nombre: 'Niña Cuatro', fecha: '2026-10-04', salon: 'Maternal', visita_id: 'v3', padres: [],
      estado: 'pendiente', estado_familia: 'pendiente', visitas: 1, ultima_fecha: '2026-10-04' },
  ],
  ausentes: [],
}

const filtros = { desde: '2026-08-16', hasta: '2026-10-04', campusId: '', turnoId: '' }
const turnos = [{ id: 't9', nombre: 'Domingo 9:00', campusId: 'c1' }]
const campus = [{ id: 'c1', nombre: 'Campus Uno' }]
const HOY = '2026-10-10'

/** The data cells of the row whose header is `cabecera` (the row header itself is not a cell). */
function celdas(cabecera: RegExp): string[] {
  const fila = screen.getByRole('rowheader', { name: cabecera }).closest('tr') as HTMLElement
  return within(fila)
    .getAllByRole('cell')
    .map((c) => c.textContent ?? '')
}

function renderizar(props: Partial<Parameters<typeof ReportesClient>[0]> = {}) {
  return render(<ReportesClient campus={campus} turnos={turnos} filtrosIniciales={filtros} hoy={HOY} {...props} />)
}

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  rpc.mockResolvedValue({ data: reporte, error: null })
})

describe('ReportesClient', () => {
  it('loads the report for the initial range and shows every section', async () => {
    renderizar()
    expect(await screen.findByText('Niño Uno')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_reporte_asistencia', { p_desde: '2026-08-16', p_hasta: '2026-10-04' })
    expect(screen.getByText('Padres: Padre Uno')).toBeInTheDocument()
    expect(screen.getAllByText('21/20 · 105%').length).toBeGreaterThan(0)
    expect(screen.getByText('Nadie dejó de venir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument()
  })

  it('reloads with the service filter and keeps it in the URL', async () => {
    renderizar()
    await screen.findByText('Niño Uno')
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 't9' } })
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('ninos_reporte_asistencia', { p_desde: '2026-08-16', p_hasta: '2026-10-04', p_turno_id: 't9' }),
    )
    expect(replace).toHaveBeenLastCalledWith('/ninos/reportes?desde=2026-08-16&hasta=2026-10-04&turno=t9')
  })

  it('explains a refused report', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'sin_autoridad' } })
    renderizar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para ver estos reportes.')
  })

  it('shows the distinct children of the server per Sunday, service and area, never summed rooms', async () => {
    renderizar()
    await screen.findByText('Niño Uno')
    const tabla = screen.getByRole('table', { name: /Asistencia por domingo/ })
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Fecha', 'Niños', 'Domingo 9:00', 'Domingo 11:00', 'Waumba Land', 'UpStreet', 'Check-ins',
    ])
    // A came to both services: 3 children, once per service, once in UpStreet, 4 check-ins.
    expect(celdas(/27\/09\/2026/)).toEqual(['3', '3', '1', '2', '1', '4'])
    expect(celdas(/04\/10\/2026/)).toEqual(['2', '2', '0', '2', '0', '2'])
    // The whole range is distinct too: 4 children, not 3 + 2.
    expect(celdas(/Todo el rango/)).toEqual(['4', '4', '1', '3', '1', '6'])
  })

  it('shows the summary figures computed by the server', async () => {
    renderizar()
    await screen.findByText('Niño Uno')
    expect(within(screen.getByRole('group', { name: 'Niños distintos' })).getByText('4')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Promedio por domingo' })).getByText('2,5')).toBeInTheDocument()
    const familias = within(screen.getByRole('group', { name: 'Familias nuevas' }))
    expect(familias.getByText('3')).toBeInTheDocument()
    expect(familias.getByText('4 niños nuevos · 1 familia volvió')).toBeInTheDocument()
  })

  it('switches to the monthly view without reloading and keeps it in the URL', async () => {
    renderizar()
    await screen.findByText('Niño Uno')
    fireEvent.click(screen.getByRole('button', { name: 'Por mes' }))

    const tabla = screen.getByRole('table', { name: /Asistencia por mes/ })
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Mes', 'Niños', 'Domingo 9:00', 'Domingo 11:00', 'Waumba Land', 'UpStreet',
      'Domingos', 'Promedio', 'Nuevos', 'Familias nuevas', 'Check-ins',
    ])
    expect(celdas(/Septiembre 2026/)).toEqual(['3', '3', '1', '2', '1', '1', '3', '3', '2', '4'])
    expect(celdas(/Agosto 2026/)).toEqual(['0', '0', '0', '0', '0', '0', '—', '0', '0', '0'])
    expect(celdas(/Todo el rango/)).toEqual(['4', '4', '1', '3', '1', '2', '2,5', '4', '3', '6'])
    // Partial months are marked; the full month is not.
    expect(screen.getByRole('rowheader', { name: /Agosto 2026/ })).toHaveTextContent('Parcial')
    expect(screen.getByRole('rowheader', { name: /Octubre 2026/ })).toHaveTextContent('Parcial')
    expect(screen.getByRole('rowheader', { name: /Septiembre 2026/ })).not.toHaveTextContent('Parcial')

    expect(screen.getByRole('button', { name: 'Por mes' })).toHaveAttribute('aria-pressed', 'true')
    expect(replace).toHaveBeenLastCalledWith('/ninos/reportes?desde=2026-08-16&hasta=2026-10-04&vista=mes')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('says so when nobody came in the range', async () => {
    rpc.mockResolvedValue({ data: { ...reporte, dias: [], meses: [], nuevos: [], salones: [], totales: {} }, error: null })
    renderizar()
    expect(await screen.findByText('No hay asistencia en este rango.')).toBeInTheDocument()
    expect(screen.getByText('No hubo familias nuevas en este rango.')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Promedio por domingo' })).getByText('—')).toBeInTheDocument()
  })

  it('opens in the monthly view when the URL asks for it', async () => {
    renderizar({ vistaInicial: 'mes' })
    await screen.findByText('Niño Uno')
    expect(screen.getByRole('table', { name: /Asistencia por mes/ })).toBeInTheDocument()
  })

  it('quick ranges set desde and hasta in the URL and reload', async () => {
    renderizar()
    await screen.findByText('Niño Uno')
    // The initial range is the default one.
    expect(screen.getByRole('button', { name: 'Últimos 8 domingos' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('ninos_reporte_asistencia', { p_desde: '2026-09-01', p_hasta: '2026-09-30' }),
    )
    expect(replace).toHaveBeenLastCalledWith('/ninos/reportes?desde=2026-09-01&hasta=2026-09-30')
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Últimos 8 domingos' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-01')
  })
})
