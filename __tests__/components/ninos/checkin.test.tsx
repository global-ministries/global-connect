import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
const checkinsAbiertos = jest.fn()
const replace = jest.fn()
const actualizar = jest.fn()
const filtro = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        update: (v: unknown) => {
          actualizar(v)
          return chain
        },
        eq: (...a: unknown[]) => {
          filtro(...a)
          return chain
        },
        in: () => checkinsAbiertos(),
      }
      return chain
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
  { id: 's2', nombre: '1º grado', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, es_necesidades_especiales: false, activo: true, orden: 20 },
]
const turnos: TurnoFila[] = [
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 },
  { id: 't11', nombre: 'Domingo 11:00', hora: '11:00:00', orden: 2 },
]

function hijo(h: Partial<HijoEncontrado> & { id: string; nombre: string }): HijoEncontrado {
  return {
    apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, autorizados: [], ...h,
  }
}

const familia = {
  id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null,
  hijos: [
    hijo({ id: 'h1', nombre: 'Luis', alergias: 'maní' }),
    hijo({ id: 'h2', nombre: 'Eva', fecha_nacimiento: '2015-01-01' }),
    hijo({ id: 'h3', nombre: 'Teo' }),
  ],
}

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

/** Check-in and check-out go through /api/ninos/{checkin,checkout} (N9); the rest is RPC. */
const RUTAS: Record<string, string> = { '/api/ninos/checkin': 'ninos_checkin', '/api/ninos/checkout': 'ninos_checkout' }

/** The body a route sent, as the RPC arguments it stands for. */
function llamadaRuta(nombre: string): unknown {
  const llamada = fetchMock.mock.calls.find(([url]) => RUTAS[url as string] === nombre)
  if (!llamada) return undefined
  const b = JSON.parse((llamada[1] as { body: string }).body)
  return nombre === 'ninos_checkin'
    ? { p_nino_ids: b.ninoIds, p_salon_ids: b.salonIds, p_turno_id: b.turnoId, p_fecha: b.fecha }
    : { p_codigo: b.codigo, p_turno_id: b.turnoId, p_fecha: b.fecha, p_retirado_por: b.retiradoPor }
}

function responder(overrides: Record<string, unknown> = {}) {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    const r = (overrides[RUTAS[url]] ?? { data: [], error: null }) as { data: unknown; error: { code?: string } | null }
    return Promise.resolve({
      ok: !r.error,
      status: r.error ? 409 : 200,
      json: async () => (r.error ? { error: { code: r.error.code } } : { filas: r.data }),
    })
  })
  rpc.mockImplementation((nombre: string) => {
    if (nombre in overrides) return Promise.resolve(overrides[nombre])
    if (nombre === 'ninos_buscar_familias') return Promise.resolve({ data: [familia], error: null })
    if (nombre === 'ninos_ocupacion')
      return Promise.resolve({
        data: [{ salon_id: 's1', nombre: 'Maternal', area: 'waumba', presentes: 3, capacidad: 20, orden: 10 }],
        error: null,
      })
    return Promise.resolve({ data: null, error: null })
  })
}

async function buscarFamilia() {
  fireEvent.change(screen.getByLabelText('Buscar familia'), { target: { value: 'Pérez' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  return screen.findByText('Ana Pérez')
}

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  checkinsAbiertos.mockReset()
  checkinsAbiertos.mockResolvedValue({ data: [{ nino_id: 'h3', codigo: '1234' }], error: null })
})

describe('CheckinClient', () => {
  it('shows the occupancy of the chosen service', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    expect(await screen.findByText('3/20')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_ocupacion', { p_turno_id: 't9', p_fecha: '2026-10-11' })
  })

  it('keeps the service in the URL', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    fireEvent.change(screen.getByLabelText('Servicio'), { target: { value: 't11' } })
    expect(replace).toHaveBeenCalledWith('/ninos/checkin?turno=t11&fecha=2026-10-11')
  })

  it('lists the children with room, alerts and who already came in', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    await buscarFamilia()

    const luis = screen.getByTestId('nino-h1')
    expect(within(luis).getByLabelText('Salón de Luis')).toHaveValue('s1')
    expect(within(luis).getByText('Alergias: maní')).toBeInTheDocument()

    expect(within(screen.getByTestId('nino-h2')).getByText('Sin salón sugerido: asígnalo manualmente')).toBeInTheDocument()

    const teo = screen.getByTestId('nino-h3')
    expect(await within(teo).findByText('Ya ingresó (código 1234)')).toBeInTheDocument()
    expect(within(teo).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a child without a room blocks the check-in until one is chosen', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    await buscarFamilia()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Eva Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))
    expect(await screen.findByText('Eva no tiene salón: asígnalo antes de registrar.')).toBeInTheDocument()
    expect(llamadaRuta('ninos_checkin')).toBeUndefined()
  })

  it('registers the check-in and shows the code very large with the rooms and warnings', async () => {
    responder({
      ninos_checkin: {
        data: [
          { nino_id: 'h1', salon_id: 's1', codigo: '4821', ocupacion: 21, capacidad: 20, sobre_capacidad: true },
          { nino_id: 'h2', salon_id: 's2', codigo: '4821', ocupacion: 5, capacidad: 20, sobre_capacidad: false },
        ],
        error: null,
      },
    })
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    await buscarFamilia()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Luis Pérez' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Eva Pérez' }))
    fireEvent.change(screen.getByLabelText('Salón de Eva'), { target: { value: 's2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    expect(await screen.findByText('4821')).toBeInTheDocument()
    expect(screen.getByText('escríbelo en ambas etiquetas')).toBeInTheDocument()
    expect(screen.getByText('Luis Pérez → Maternal')).toBeInTheDocument()
    expect(screen.getByText('Eva Pérez → 1º grado')).toBeInTheDocument()
    expect(screen.getByText('Salón lleno: Maternal 21/20')).toBeInTheDocument()
    expect(llamadaRuta('ninos_checkin')).toEqual({
      p_nino_ids: ['h1', 'h2'],
      p_salon_ids: ['s1', 's2'],
      p_turno_id: 't9',
      p_fecha: '2026-10-11',
    })
    await waitFor(() => expect(rpc.mock.calls.filter(([n]) => n === 'ninos_ocupacion').length).toBeGreaterThanOrEqual(2))
    // Only Eva's hand-picked room differs from the suggestion: it becomes her preferred room.
    expect(actualizar).toHaveBeenCalledTimes(1)
    expect(actualizar).toHaveBeenCalledWith({ salon_preferido_id: 's2' })
    expect(filtro).toHaveBeenCalledWith('usuario_id', 'h2')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente familia' }))
    expect(screen.getByLabelText('Buscar familia')).toHaveValue('')
  })

  it('links to the family registration and back', () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    expect(screen.getByRole('link', { name: /Nueva familia/ })).toHaveAttribute(
      'href',
      '/ninos/familias?nueva=1&volver=checkin&turno=t9&fecha=2026-10-11',
    )
  })

  it('has a Retiro tab that looks up a code and confirms the check-out', async () => {
    responder({
      ninos_buscar_codigo: {
        data: [
          {
            checkin_id: 'c1', nino_id: 'h1', nombre: 'Luis', apellido: 'Pérez', salon_id: 's1', salon: 'Maternal',
            entrada_at: '2026-10-11T13:00:00Z', salida_at: null, retirado_por_nombre: null,
            autorizados: [{ nombre: 'Abuela Rosa', telefono: '04141112233', relacion: 'Abuela' }],
          },
        ],
        error: null,
      },
      ninos_checkout: { data: [{ nino_id: 'h1', salon_id: 's1', salida_at: '2026-10-11T14:42:00Z' }], error: null },
    })
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Retiro' }))
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Abuela Rosa')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /04141112233/ })).toHaveAttribute('href', 'tel:04141112233')
    expect(rpc).toHaveBeenCalledWith('ninos_buscar_codigo', { p_codigo: '4821', p_turno_id: 't9', p_fecha: '2026-10-11' })

    fireEvent.change(screen.getByLabelText('¿Quién retira?'), { target: { value: 'Ana Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' }))
    await waitFor(() =>
      expect(llamadaRuta('ninos_checkout')).toEqual({
        p_codigo: '4821', p_turno_id: 't9', p_fecha: '2026-10-11', p_retirado_por: 'Ana Pérez',
      }),
    )
    expect(await screen.findByText(/Retiro registrado/)).toBeInTheDocument()
  })

  it('a wrong code shows a clear message', async () => {
    responder({ ninos_buscar_codigo: { data: [], error: null } })
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Retiro' }))
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay niños con el código 9999 en este servicio.')
  })

  it('a child already out shows when and by whom', async () => {
    responder({
      ninos_buscar_codigo: {
        data: [
          {
            checkin_id: 'c1', nino_id: 'h1', nombre: 'Luis', apellido: 'Pérez', salon_id: 's1', salon: 'Maternal',
            entrada_at: '2026-10-11T13:00:00Z', salida_at: '2026-10-11T14:42:00Z', retirado_por_nombre: 'Ana', autorizados: [],
          },
        ],
        error: null,
      },
    })
    render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Retiro' }))
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText(/Retirado a las 10:42 por Ana/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar retiro' })).not.toBeInTheDocument()
  })
})
