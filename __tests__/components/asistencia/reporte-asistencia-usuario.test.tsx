/**
 * @jest-environment jsdom
 *
 * ui-areas-formularios — the personal attendance report on the design system:
 * the date filter reports its state and keeps its actions in the system footer
 * (clear first, apply last) while building the same URLs as before.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import ReporteAsistenciaUsuarioClient from '@/components/asistencia/ReporteAsistenciaUsuario.client'

const reporteBase = {
  kpis: {
    porcentaje_asistencia_general: 75,
    total_grupos_activos: 2,
    grupo_mas_frecuente: { id: 'g1', nombre: 'Grupo Norte' },
    ultima_asistencia_fecha: '2026-10-01T00:00:00Z',
  },
  series_temporales: [],
  historial_eventos: [
    { fecha: '2026-10-01T00:00:00Z', grupo_nombre: 'Grupo Norte', grupo_id: 'g1', tema: 'Fe', estado: 'Presente' as const },
  ],
}

function renderizar(reporte = reporteBase) {
  return render(<ReporteAsistenciaUsuarioClient usuarioId="u1" reporte={reporte} fechaInicio="2026-01-01" />)
}

describe('ReporteAsistenciaUsuario on the design system', () => {
  beforeEach(() => mockPush.mockClear())

  it('toggles the filter panel and reports it with aria-expanded', () => {
    renderizar()
    const alternar = screen.getByRole('button', { name: 'Mostrar' })
    expect(alternar.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Fecha Inicio')).toBeNull()

    fireEvent.click(alternar)

    expect(screen.getByRole('button', { name: 'Ocultar' }).getAttribute('aria-expanded')).toBe('true')
    expect((screen.getByLabelText('Fecha Inicio') as HTMLInputElement).value).toBe('2026-01-01')
    expect(screen.getByLabelText('Fecha Fin')).toBeTruthy()
  })

  it('orders the filter actions clear first, apply last, and keeps their URLs', () => {
    const { container } = renderizar()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))

    const pie = container.querySelector('[data-slot="pie-acciones"]') as HTMLElement
    const botones = within(pie).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Limpiar', 'Aplicar Filtros'])

    fireEvent.change(screen.getByLabelText('Fecha Fin'), { target: { value: '2026-06-30' } })
    fireEvent.click(botones[1])
    expect(mockPush).toHaveBeenLastCalledWith('/users/u1/asistencia?fecha_inicio=2026-01-01&fecha_fin=2026-06-30')

    fireEvent.click(botones[0])
    expect(mockPush).toHaveBeenLastCalledWith('/users/u1/asistencia')
    expect((screen.getByLabelText('Fecha Inicio') as HTMLInputElement).value).toBe('')
  })

  it('shows the KPIs and links the most frequent group', () => {
    renderizar()

    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('01-10-2026', { selector: 'div' })).toBeTruthy()
    const enlaces = screen.getAllByRole('link', { name: 'Grupo Norte' })
    expect(enlaces[0].getAttribute('href')).toBe('/grupos-vida/g1')
  })

  it('shows an empty state without events or chart data', () => {
    renderizar({ ...reporteBase, historial_eventos: [] })

    expect(screen.getByText('No hay eventos en este período')).toBeTruthy()
    expect(screen.getByText('No hay datos suficientes para mostrar el gráfico')).toBeTruthy()
  })
})
