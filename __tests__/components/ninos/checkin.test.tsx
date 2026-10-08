import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
const checkinsAbiertos = jest.fn()
const replace = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
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

function responder(overrides: Record<string, unknown> = {}) {
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
    expect(rpc).not.toHaveBeenCalledWith('ninos_checkin', expect.anything())
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
    expect(rpc).toHaveBeenCalledWith('ninos_checkin', {
      p_nino_ids: ['h1', 'h2'],
      p_salon_ids: ['s1', 's2'],
      p_turno_id: 't9',
      p_fecha: '2026-10-11',
    })
    await waitFor(() => expect(rpc.mock.calls.filter(([n]) => n === 'ninos_ocupacion').length).toBeGreaterThanOrEqual(2))

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
})
