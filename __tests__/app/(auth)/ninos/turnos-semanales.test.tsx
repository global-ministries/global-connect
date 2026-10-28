/**
 * Niños never sees a dated Dream Team shift (S5 of odd/tasks/tlr-calendario-servicios.md):
 * check-in, salón and reportes read only weekly Sunday shifts (tipo = 'semanal'
 * on top of dia_semana = 0, as before).
 */
import type { ReactNode } from 'react'

import NinosCheckinPage from '@/app/(auth)/ninos/checkin/page'
import NinosSalonPage from '@/app/(auth)/ninos/salon/page'
import NinosReportesPage from '@/app/(auth)/ninos/reportes/page'

type Filtro = { readonly op: string; readonly args: readonly unknown[] }
const filtrosDeTurnos: Filtro[] = []

function consulta(tabla: string, data: unknown) {
  const q: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in', 'order']) {
    q[op] = (...args: unknown[]) => {
      if (tabla === 'dream_team_turnos') filtrosDeTurnos.push({ op, args })
      return q
    }
  }
  q.then = (resolve: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
  return q
}

const from = jest.fn((tabla: string) =>
  consulta(
    tabla,
    tabla === 'ninos_salones'
      ? [{ id: 's1', nombre: 'Sala', orden: 1, campus_id: 'c1', activo: true }]
      : tabla === 'campus'
        ? [{ id: 'c1', nombre: 'Campus Uno' }]
        : [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00', campus_id: 'c1', orden: 1 }],
  ),
)
const rpc = jest.fn(async () => ({ data: true, error: null }))

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
jest.mock('@/components/ninos/checkin-client', () => ({ CheckinClient: () => null }))
jest.mock('@/components/ninos/salon-client', () => ({ SalonClient: () => null }))
jest.mock('@/components/ninos/reportes-client', () => ({ ReportesClient: () => null }))
jest.mock('@/components/ninos/reportes-voluntarios-client', () => ({ ReportesVoluntariosClient: () => null }))

beforeEach(() => {
  filtrosDeTurnos.length = 0
  from.mockClear()
})

function filtraSemanalesDeDomingo(): void {
  const eqs = filtrosDeTurnos.filter((f) => f.op === 'eq').map((f) => f.args)
  expect(eqs).toEqual(expect.arrayContaining([['activo', true], ['dia_semana', 0], ['tipo', 'semanal']]))
}

it('check-in lists only weekly Sunday shifts', async () => {
  await NinosCheckinPage({ searchParams: Promise.resolve({}) })
  filtraSemanalesDeDomingo()
})

it('salón lists only weekly Sunday shifts', async () => {
  await NinosSalonPage({ searchParams: Promise.resolve({}) })
  filtraSemanalesDeDomingo()
})

it('reportes offers only weekly Sunday shifts', async () => {
  await NinosReportesPage({ searchParams: Promise.resolve({}) })
  filtraSemanalesDeDomingo()
})
