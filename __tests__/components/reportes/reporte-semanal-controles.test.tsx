/**
 * The weekly report toolbar uses system buttons: the week arrows keep an
 * accessible name on mobile (where their text is hidden) and the scope toggle
 * reports its pressed state.
 */
import { fireEvent, render, screen } from '@testing-library/react'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('recharts', () => {
  const Vacio = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return new Proxy({}, { get: () => Vacio })
})

import ReporteSemanal from '@/components/reportes/ReporteSemanal.client'

const reporte = {
  semana: { inicio: '2026-10-05', fin: '2026-10-11', numero: 41 },
  kpis_globales: {
    porcentaje_asistencia_global: 80,
    variacion_semana_anterior: -5,
    total_reuniones_registradas: 10,
    total_grupos_con_reunion: 10,
    total_grupos_activos: 12,
    total_miembros_asistentes: 90,
    total_miembros_en_grupos: 110,
  },
  tendencia_asistencia_global: [],
  asistencia_por_segmento: [],
  top_5_grupos_perfectos: [],
  top_5_grupos_en_riesgo: [],
}

describe('ReporteSemanal toolbar', () => {
  beforeEach(() => push.mockClear())

  it('names the week arrows and navigates to the previous week', () => {
    render(<ReporteSemanal reporte={reporte} />)
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))
    expect(push).toHaveBeenCalledWith('/grupos-vida/reportes/asistencia-semanal?semana=2026-09-28')
  })

  it('reports the scope toggle as pressed', () => {
    render(<ReporteSemanal reporte={reporte} />)
    const alcance = screen.getByRole('button', { name: 'Todos los grupos activos' })
    expect(alcance).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(alcance)
    expect(screen.getByRole('button', { name: 'Solo grupos con reunión' })).toHaveAttribute('aria-pressed', 'false')
  })
})
