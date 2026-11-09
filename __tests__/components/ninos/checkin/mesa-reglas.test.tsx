/**
 * Desk rules at /ninos/checkin (odd/tasks/ninos-checkin-pco.md, T2d, S9.1,
 * S9.3, S5; artboard design/ninos-checkin-pco/05-mesa-tableta.html): the
 * visitor badge, «Salón lleno» with «Usar {otro salón}», forcing (audited
 * through the forced list) and the event / horario window.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { VentanaHorario } from '@/components/ninos/checkin/ventana-horario'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
const actualizar = jest.fn()

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
        eq: () => chain,
        in: () => Promise.resolve({ data: [], error: null }),
      }
      return chain
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const maternal = { area: 'waumba' as const, edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true }
const salones: SalonFila[] = [
  { ...maternal, id: 's1', nombre: 'Maternal', orden: 10, capacidad: 12, cupo_visitantes: 2, abierto: true },
  { ...maternal, id: 's2', nombre: 'Maternal B', orden: 11, capacidad: 12, cupo_visitantes: 0, abierto: true },
]
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]

function hijo(h: Partial<HijoEncontrado> & { id: string; nombre: string }): HijoEncontrado {
  return {
    apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [], ...h,
  }
}

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

function cuerpoCheckin(): Record<string, unknown> | undefined {
  const llamada = fetchMock.mock.calls.find(([url]) => url === '/api/ninos/checkin')
  return llamada ? JSON.parse((llamada[1] as { body: string }).body) : undefined
}

function responder(opciones: { hijos: HijoEncontrado[]; previas: Record<string, number>; presentes: Record<string, number> }) {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ filas: [{ nino_id: 'h1', salon_id: 's1', codigo: '4821', ocupacion: 13, capacidad: 12, sobre_capacidad: true }] }),
  })
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_buscar_familias')
      return Promise.resolve({ data: [{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '0414', cedula: null, hijos: opciones.hijos }], error: null })
    if (nombre === 'ninos_es_visitante_lote')
      return Promise.resolve({
        data: Object.entries(opciones.previas).map(([nino_id, visitas_previas]) => ({ nino_id, visitas_previas, visitante: visitas_previas < 3 })),
        error: null,
      })
    if (nombre === 'ninos_ocupacion')
      return Promise.resolve({
        data: salones.map((s) => ({ salon_id: s.id, nombre: s.nombre, presentes: opciones.presentes[s.id] ?? 0, capacidad: 12 })),
        error: null,
      })
    return Promise.resolve({ data: null, error: null })
  })
}

async function abrirFamilia() {
  render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-11-08' }} />)
  await screen.findAllByText(/\/12/)
  fireEvent.change(screen.getByLabelText('Buscar familia por teléfono o nombre'), { target: { value: 'Pérez' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  await screen.findByRole('heading', { name: 'Ana Pérez' })
}

beforeEach(() => {
  rpc.mockReset()
  actualizar.mockReset()
})

describe('visitor badge (S9.3)', () => {
  it('«Primera vez» on the 1st visit, «Visitante» on the 2nd and 3rd, nothing after; one batch call', async () => {
    responder({
      hijos: [hijo({ id: 'h1', nombre: 'Luis' }), hijo({ id: 'h2', nombre: 'Eva' }), hijo({ id: 'h3', nombre: 'Teo' })],
      previas: { h1: 0, h2: 2, h3: 3 },
      presentes: {},
    })
    await abrirFamilia()
    expect(await within(screen.getByTestId('nino-h1')).findByText('Primera vez')).toBeInTheDocument()
    expect(within(screen.getByTestId('nino-h2')).getByText('Visitante')).toBeInTheDocument()
    expect(within(screen.getByTestId('nino-h3')).queryByText(/Visitante|Primera vez/)).not.toBeInTheDocument()
    expect(rpc.mock.calls.filter(([n]) => n === 'ninos_es_visitante_lote')).toEqual([
      ['ninos_es_visitante_lote', { p_nino_ids: ['h1', 'h2', 'h3'], p_fecha: '2026-11-08' }],
    ])
  })
})

describe('full salón (S9.1)', () => {
  it('a full room is skipped by the suggestion: the next one with room, nothing forced', async () => {
    responder({ hijos: [hijo({ id: 'h1', nombre: 'Luis' })], previas: { h1: 5 }, presentes: { s1: 12, s2: 4 } })
    await abrirFamilia()
    await waitFor(() => expect(screen.getByTestId('nino-h1')).toHaveTextContent('Maternal B'))
    expect(screen.queryByText(/está lleno/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso · 1 niño' }))
    await screen.findByText('4821')
    expect(cuerpoCheckin()).toEqual({ ninoIds: ['h1'], salonIds: ['s2'], turnoId: 't9', fecha: '2026-11-08' })
  })

  it('warns with «Usar {otro salón}»; using it does not become the remembered room', async () => {
    responder({ hijos: [hijo({ id: 'h1', nombre: 'Luis', salon_preferido_id: 's1' })], previas: { h1: 5 }, presentes: { s1: 12, s2: 4 } })
    await abrirFamilia()
    const luis = screen.getByTestId('nino-h1')
    const aviso = await within(luis).findByRole('alert')
    expect(aviso).toHaveTextContent('Maternal está lleno (12/12).')
    expect(aviso).toHaveTextContent('El siguiente que le sirve es Maternal B · 4/12.')
    fireEvent.click(within(aviso).getByRole('button', { name: 'Usar Maternal B' }))
    await waitFor(() => expect(within(luis).queryByRole('alert')).not.toBeInTheDocument())
    expect(luis).toHaveTextContent('Maternal B')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso · 1 niño' }))
    await screen.findByText('4821')
    expect(cuerpoCheckin()).toEqual({ ninoIds: ['h1'], salonIds: ['s2'], turnoId: 't9', fecha: '2026-11-08' })
    expect(actualizar).not.toHaveBeenCalled()
  })

  it('the volunteer may still force the full room: it goes in, listed as forced', async () => {
    responder({ hijos: [hijo({ id: 'h1', nombre: 'Luis', salon_preferido_id: 's1' })], previas: { h1: 5 }, presentes: { s1: 12, s2: 4 } })
    await abrirFamilia()
    expect(await within(screen.getByTestId('nino-h1')).findByRole('alert')).toHaveTextContent('Si lo registras aquí, queda anotado que forzaste el cupo.')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso · 1 niño' }))
    await screen.findByText('4821')
    expect(cuerpoCheckin()).toEqual({ ninoIds: ['h1'], salonIds: ['s1'], turnoId: 't9', fecha: '2026-11-08', forzadoIds: ['h1'] })
  })

  it('a visitor inside the visitor places is not full', async () => {
    responder({ hijos: [hijo({ id: 'h1', nombre: 'Luis', salon_preferido_id: 's1' })], previas: { h1: 1 }, presentes: { s1: 13, s2: 4 } })
    await abrirFamilia()
    await within(screen.getByTestId('nino-h1')).findByText('Visitante')
    expect(within(screen.getByTestId('nino-h1')).queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso · 1 niño' }))
    await screen.findByText('4821')
    expect(cuerpoCheckin()).toEqual({ ninoIds: ['h1'], salonIds: ['s1'], turnoId: 't9', fecha: '2026-11-08' })
  })
})

describe('VentanaHorario (event, horario and window)', () => {
  const horario = { evento: 'Domingo semanal', abreMinAntes: 120, cierraMinDespues: 45 }

  it('open: «Abierto · cierra en N min» with the event and the hour', () => {
    render(<VentanaHorario turno={turnos[0]} fecha="2026-11-08" horario={horario} ahora={Date.parse('2026-11-08T12:58:00Z')} />)
    const v = screen.getByRole('status', { name: 'Horario del check-in' })
    expect(v).toHaveTextContent('Domingo semanal')
    expect(v).toHaveTextContent('9:00')
    expect(v).toHaveTextContent('Abierto · cierra en 47 min')
  })

  it('before and after the window it reads «Cerrado» (it never blocks the desk)', () => {
    const { rerender } = render(<VentanaHorario turno={turnos[0]} fecha="2026-11-08" horario={horario} ahora={Date.parse('2026-11-08T10:00:00Z')} />)
    expect(screen.getByRole('status', { name: 'Horario del check-in' })).toHaveTextContent('Cerrado · abre a las 7:00')
    rerender(<VentanaHorario turno={turnos[0]} fecha="2026-11-08" horario={horario} ahora={Date.parse('2026-11-08T14:00:00Z')} />)
    expect(screen.getByRole('status', { name: 'Horario del check-in' })).toHaveTextContent(/Cerrado$/)
  })

  it('without a horario it uses the 120 / 120 window and names no event', () => {
    render(<VentanaHorario turno={turnos[0]} fecha="2026-11-08" horario={undefined} ahora={Date.parse('2026-11-08T14:30:00Z')} />)
    const v = screen.getByRole('status', { name: 'Horario del check-in' })
    expect(v).toHaveTextContent('Abierto · cierra en 30 min')
    expect(v).not.toHaveTextContent('Domingo semanal')
  })
})
