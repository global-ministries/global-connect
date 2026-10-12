import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'

import NinosReportesPage from '@/app/(auth)/ninos/reportes/page'

const rpc = jest.fn()

function consulta(data: unknown) {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  }
  return q
}

const from = jest.fn((tabla: string) =>
  consulta(
    tabla === 'ninos_salones'
      ? [{ campus_id: 'c1' }]
      : tabla === 'campus'
        ? [{ id: 'c1', nombre: 'Campus Uno' }]
        : [{ id: 't9', nombre: 'Domingo 9:00', campus_id: 'c1', orden: 1 }],
  ),
)

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-10',
}))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
jest.mock('@/components/ninos/reportes-client', () => ({
  ReportesClient: () => <p data-testid="reporte-ninos" />,
}))
jest.mock('@/components/ninos/reportes-voluntarios-client', () => ({
  ReportesVoluntariosClient: (props: { filtrosIniciales: unknown; turnos: { nombre: string }[] }) => (
    <p data-testid="reporte-voluntarios">{JSON.stringify({ filtros: props.filtrosIniciales, turnos: props.turnos.map((t) => t.nombre) })}</p>
  ),
}))

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('/ninos/reportes page', () => {
  it('shows the children report by default, with the tabs', async () => {
    render(await NinosReportesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('reporte-ninos')).toBeInTheDocument()
    expect(screen.queryByTestId('reporte-voluntarios')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Niños' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the volunteers report with the same filters on ?reporte=voluntarios', async () => {
    render(await NinosReportesPage({ searchParams: Promise.resolve({ reporte: 'voluntarios', desde: '2026-09-06', campus: 'c1' }) }))
    expect(screen.queryByTestId('reporte-ninos')).not.toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('reporte-voluntarios').textContent ?? '')).toEqual({
      filtros: { desde: '2026-09-06', hasta: '2026-10-04', campusId: 'c1', turnoId: '' },
      turnos: ['Domingo 9:00'],
    })
    expect(screen.getByRole('link', { name: 'Voluntarios' })).toHaveAttribute('aria-current', 'page')
  })

  it('is a 404 for whoever cannot see the reports', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(NinosReportesPage({ searchParams: Promise.resolve({ reporte: 'voluntarios' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
