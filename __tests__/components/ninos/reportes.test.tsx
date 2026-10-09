import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ReportesClient } from '@/components/ninos/reportes-client'

const rpc = jest.fn()
const replace = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))

const reporte = {
  domingo_referencia: '2026-10-04',
  salones: [
    { fecha: '2026-10-04', turno_id: 't9', turno: 'Domingo 9:00', turno_orden: 1, salon_id: 's1', salon: 'Maternal',
      salon_orden: 1, area: 'waumba', capacidad: 20, ninos: 22, pico: 21 },
  ],
  dias: [{ fecha: '2026-10-04', ninos: 22, checkins: 22 }],
  nuevos: [{ nino_id: 'n1', nombre: 'Niño Uno', fecha: '2026-10-04', salon: 'Maternal', visita_id: 'v1', padres: ['Padre Uno'] }],
  ausentes: [],
}

const filtros = { desde: '2026-08-16', hasta: '2026-10-04', campusId: '', turnoId: '' }
const turnos = [{ id: 't9', nombre: 'Domingo 9:00', campusId: 'c1' }]
const campus = [{ id: 'c1', nombre: 'Campus Uno' }]

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  rpc.mockResolvedValue({ data: reporte, error: null })
})

describe('ReportesClient', () => {
  it('loads the report for the initial range and shows every section', async () => {
    render(<ReportesClient campus={campus} turnos={turnos} filtrosIniciales={filtros} />)
    expect(await screen.findByText('Niño Uno')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_reporte_asistencia', { p_desde: '2026-08-16', p_hasta: '2026-10-04' })
    expect(screen.getByText('Padres: Padre Uno')).toBeInTheDocument()
    expect(screen.getAllByText('21/20 · 105%').length).toBeGreaterThan(0)
    expect(screen.getByText('Nadie dejó de venir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument()
  })

  it('reloads with the service filter and keeps it in the URL', async () => {
    render(<ReportesClient campus={campus} turnos={turnos} filtrosIniciales={filtros} />)
    await screen.findByText('Niño Uno')
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 't9' } })
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('ninos_reporte_asistencia', { p_desde: '2026-08-16', p_hasta: '2026-10-04', p_turno_id: 't9' }),
    )
    expect(replace).toHaveBeenLastCalledWith('/ninos/reportes?desde=2026-08-16&hasta=2026-10-04&turno=t9')
  })

  it('explains a refused report', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'sin_autoridad' } })
    render(<ReportesClient campus={campus} turnos={turnos} filtrosIniciales={filtros} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para ver estos reportes.')
  })
})
