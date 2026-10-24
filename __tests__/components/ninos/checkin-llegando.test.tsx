import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => {
      const chain = { select: () => chain, update: () => chain, eq: () => chain, in: () => Promise.resolve({ data: [], error: null }) }
      return chain
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
]
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const servicio = { turnoId: 't9', fecha: '2026-10-11' }

const nino = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, nombre, apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', tiene_ficha: true, grado: null,
  alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, desde_casa: false, autorizados: [],
  ...extra,
})

const llegando = (hijos: unknown[]) => [
  { padre: { id: 'p1', nombre: 'Ana', apellido: 'Pérez' }, avisado_at: '2026-10-11T12:40:00Z', hijos },
]

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

function responder(lista: unknown) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_prechecks_pendientes') return Promise.resolve({ data: lista, error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

const llamadasLista = () => rpc.mock.calls.filter(([n]) => n === 'ninos_prechecks_pendientes')

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ filas: [{ nino_id: 'h1', salon_id: 's1', codigo: '4321', ocupacion: 4, capacidad: 20, sobre_capacidad: false }] }),
  })
})

afterEach(() => jest.useRealTimers())

describe('Llegando (pre-check-in at the table)', () => {
  it('lists the arriving families of the selected service with rooms and alerts', async () => {
    responder(llegando([nino('h1', 'Luis', { alergias: 'maní' })]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)

    const lista = await screen.findByRole('region', { name: 'Llegando' })
    expect(rpc).toHaveBeenCalledWith('ninos_prechecks_pendientes', { p_turno_id: 't9', p_fecha: '2026-10-11' })
    const fam = within(lista).getByTestId('llegando-p1')
    expect(fam).toHaveTextContent('Ana Pérez')
    expect(fam).toHaveTextContent('Luis Pérez')
    expect(fam).toHaveTextContent('Maternal')
    expect(fam).toHaveTextContent('Alergias: maní')
  })

  it('is hidden when nobody is on the way', async () => {
    responder([])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    await waitFor(() => expect(llamadasLista()).toHaveLength(1))
    expect(screen.queryByRole('region', { name: 'Llegando' })).not.toBeInTheDocument()
  })

  it('"Llegaron" checks the children in through the usual path and shows the code', async () => {
    responder(llegando([nino('h1', 'Luis')]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Llegaron: Ana Pérez' }))

    expect(await screen.findByText('4321')).toBeInTheDocument()
    expect(screen.getByText('escríbelo en ambas etiquetas')).toBeInTheDocument()
    expect(screen.getByText('Luis Pérez → Maternal')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/ninos/checkin', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ninoIds: ['h1'], salonIds: ['s1'], turnoId: 't9', fecha: '2026-10-11' })
    // Back to the screen, the list is read again and the family is gone.
    responder([])
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente familia' }))
    await waitFor(() => expect(llamadasLista().length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Llegando' })).not.toBeInTheDocument())
  })

  it('a child without a suggested room opens the family to pick it by hand', async () => {
    responder(llegando([nino('h1', 'Luis'), nino('h2', 'Eva', { fecha_nacimiento: '2015-01-01' })]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Llegaron: Ana Pérez' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Eva no tiene salón: asígnalo antes de registrar.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Luis Pérez' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Eva Pérez' })).toBeChecked()
    expect(screen.getByLabelText('Salón de Eva')).toBeInTheDocument()
  })

  it('shows the check-in error next to the family', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { code: '23505' } }) })
    responder(llegando([nino('h1', 'Luis')]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Llegaron: Ana Pérez' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Uno de los niños ya ingresó en este servicio.')
  })

  it('refreshes the list every 30 seconds while open', async () => {
    jest.useFakeTimers()
    responder([])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    await act(async () => {
      await Promise.resolve()
    })
    const antes = llamadasLista().length
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    expect(llamadasLista().length).toBeGreaterThan(antes)
  })
})
