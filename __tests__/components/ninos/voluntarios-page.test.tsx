import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'

import NinosVoluntariosPage from '@/app/(auth)/ninos/voluntarios/page'

const rpc = jest.fn()

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-10',
}))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
jest.mock('@/components/ninos/voluntarios-client', () => ({
  VoluntariosClient: (props: {
    turnos: { nombre: string }[]
    servicio: { turnoId: string | null; fecha: string }
    areaId: string | null
    hoy: string
  }) => (
    <p data-testid="cliente">
      {JSON.stringify({ turnos: props.turnos.map((t) => t.nombre), servicio: props.servicio, areaId: props.areaId, hoy: props.hoy })}
    </p>
  ),
}))

const turnos = [
  { id: 't11', nombre: 'Domingo 11:00', hora: '11:00:00', orden: 2, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
]

function conFlag(flag: unknown) {
  rpc.mockImplementation((nombre: string) =>
    Promise.resolve(
      nombre === 'ninos_puede_marcar_voluntarios_algun_area' ? { data: flag, error: null } : { data: turnos, error: null },
    ),
  )
}

beforeEach(() => rpc.mockReset())

describe('/ninos/voluntarios page', () => {
  it('is a 404 for whoever cannot mark volunteers', async () => {
    conFlag(false)
    await expect(NinosVoluntariosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).toHaveBeenCalledWith('ninos_puede_marcar_voluntarios_algun_area')
    expect(rpc).not.toHaveBeenCalledWith('ninos_voluntarios_turnos')
  })

  it('fails closed when the flag cannot be read', async () => {
    conFlag(null)
    await expect(NinosVoluntariosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('hands the services and the last service date to the screen', async () => {
    conFlag(true)
    render(await NinosVoluntariosPage({ searchParams: Promise.resolve({ area: 'aw' }) }))
    expect(JSON.parse(screen.getByTestId('cliente').textContent ?? '')).toEqual({
      turnos: ['Domingo 11:00', 'Domingo 9:00'],
      servicio: { turnoId: 't9', fecha: '2026-10-04' },
      areaId: 'aw',
      hoy: '2026-10-10',
    })
  })
})
