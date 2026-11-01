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
// PaginaSistema renders DesktopHeader behind React.lazy; a plain double keeps the providers out.
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

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
    const fam = await within(lista).findByTestId('llegando-p1')
    expect(fam).toHaveTextContent('Ana Pérez')
    expect(fam).toHaveTextContent('Luis Pérez')
    expect(fam).toHaveTextContent('Maternal')
    expect(fam).toHaveTextContent('Alergias: maní')
  })

  it('says nobody is on the way when the queue is empty', async () => {
    responder([])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    await waitFor(() => expect(llamadasLista()).toHaveLength(1))
    const lista = screen.getByRole('region', { name: 'Llegando' })
    expect(within(lista).getByText('Nadie en camino por ahora')).toBeInTheDocument()
    expect(within(lista).queryByRole('button', { name: /^Llegaron/ })).not.toBeInTheDocument()
  })

  it('comes first, before the pre-registrations and the search', async () => {
    responder(llegando([nino('h1', 'Luis')]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const lista = await screen.findByRole('region', { name: 'Llegando' })
    await within(lista).findByTestId('llegando-p1')
    const buscar = screen.getByLabelText('Buscar familia por teléfono o nombre')
    expect(lista.compareDocumentPosition(buscar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('resumen-checkin')).toHaveTextContent('1 familia en camino')
  })

  it('puts whoever told the table first on top', async () => {
    responder([
      { padre: { id: 'p2', nombre: 'Beto', apellido: 'Gil' }, avisado_at: '2026-10-11T12:50:00Z', hijos: [nino('h2', 'Eva')] },
      { padre: { id: 'p1', nombre: 'Ana', apellido: 'Pérez' }, avisado_at: '2026-10-11T12:40:00Z', hijos: [nino('h1', 'Luis')] },
    ])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const lista = await screen.findByRole('region', { name: 'Llegando' })
    await within(lista).findByTestId('llegando-p1')
    expect(within(lista).getAllByRole('button', { name: /^Llegaron/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Llegaron: Ana Pérez, 1 niño',
      'Llegaron: Beto Gil, 1 niño',
    ])
  })

  it('"Llegaron" checks the children in through the usual path and shows the code', async () => {
    responder(llegando([nino('h1', 'Luis')]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Llegaron: Ana Pérez/ }))

    const codigo = await screen.findByRole('region', { name: 'Ingreso registrado' })
    expect(within(codigo).getByText('4321')).toBeInTheDocument()
    expect(within(codigo).getByText('Código de retiro')).toBeInTheDocument()
    expect(within(codigo).getByRole('listitem')).toHaveTextContent('Luis PérezMaternal')
    expect(fetchMock).toHaveBeenCalledWith('/api/ninos/checkin', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ninoIds: ['h1'], salonIds: ['s1'], turnoId: 't9', fecha: '2026-10-11' })
    // Back to the screen, the list is read again and the family is gone.
    responder([])
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente familia' }))
    await waitFor(() => expect(llamadasLista().length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(screen.queryByTestId('llegando-p1')).not.toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Ingreso registrado' })).not.toBeInTheDocument()
  })

  it('a child without a suggested room opens the family to pick it by hand', async () => {
    responder(llegando([nino('h1', 'Luis'), nino('h2', 'Eva', { fecha_nacimiento: '2015-01-01' })]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Llegaron: Ana Pérez/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Eva no tiene salón: asígnalo antes de registrar.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Luis Pérez' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Eva Pérez' })).toBeChecked()
    expect(screen.getByLabelText('Salón de Eva')).toBeInTheDocument()
  })

  it('"Cambiar" on a child in a full salón opens the family at the mesa with its salón select', async () => {
    rpc.mockImplementation((nombre: string) => {
      if (nombre === 'ninos_prechecks_pendientes') return Promise.resolve({ data: llegando([nino('h1', 'Luis')]), error: null })
      if (nombre === 'ninos_ocupacion')
        return Promise.resolve({ data: [{ salon_id: 's1', nombre: 'Maternal', area: 'waumba', presentes: 12, capacidad: 12, orden: 10 }], error: null })
      return Promise.resolve({ data: null, error: null })
    })
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const fila = await screen.findByTestId('llegando-p1')
    expect(await within(fila).findByText(/^Lleno/)).toHaveTextContent('Lleno 12/12')
    // Full warns, it does not block: "Llegaron" stays available.
    expect(within(fila).getByRole('button', { name: /^Llegaron/ })).toBeEnabled()
    fireEvent.click(within(fila).getByRole('button', { name: 'Cambiar salón de Luis Pérez' }))
    expect(within(screen.getByTestId('nino-h1')).getByLabelText('Salón de Luis')).toHaveValue('s1')
    expect(screen.getByRole('checkbox', { name: 'Luis Pérez' })).toBeChecked()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the check-in error next to the family', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { code: '23505' } }) })
    responder(llegando([nino('h1', 'Luis')]))
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Llegaron: Ana Pérez/ }))
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
