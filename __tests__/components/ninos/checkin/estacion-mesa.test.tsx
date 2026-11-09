/**
 * The desk printer at /ninos/checkin (odd/tasks/ninos-checkin-pco.md, T3b,
 * S10 "Laptop de la mesa con el agente"; artboard
 * design/ninos-checkin-pco/05-mesa-tableta.html): the desk chooses its print
 * station, remembered on this device per campus; the check-in sends
 * `estacionId`; a missing or offline station only shows a small notice and
 * never blocks the check-in; a campus without stations shows nothing and the
 * check-in body is exactly the one of before. Reprint from the pickup code and
 * from a checked-in family, with a reason (S6, S10).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
let checkinsHoy: { nino_id: string; codigo: string }[] = []

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: checkinsHoy, error: null }),
      }
      return chain
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const salones: SalonFila[] = [
  { area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true,
    id: 's1', nombre: 'Maternal', orden: 10, capacidad: 12, cupo_visitantes: 2, abierto: true },
]
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const CLAVE = 'ninos-mesa-estacion:c1'

function hijo(h: Partial<HijoEncontrado> & { id: string; nombre: string }): HijoEncontrado {
  return {
    apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [], ...h,
  }
}

const hace = (ms: number) => new Date(Date.now() - ms).toISOString()
const estacion = (o: Record<string, unknown>) => ({
  id: 'e1', campus_id: 'c1', nombre: 'Mesa 1', ancho_mm: null, alto_mm: null, dpi: 203, activa: true,
  ultima_conexion: hace(20_000), pendientes: 0, puede_administrar: false, ...o,
})

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

function llamadas(url: string): Record<string, unknown>[] {
  return fetchMock.mock.calls.filter(([u]) => u === url).map(([, init]) => JSON.parse((init as { body: string }).body))
}

function responder(estaciones: unknown[] | null) {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
    if (url === '/api/ninos/impresion/reimprimir') {
      const { tipo } = JSON.parse(init.body) as { tipo: string }
      const conteo = { nino: { ninos: 1, representantes: 0 }, representante: { ninos: 0, representantes: 1 }, todas: { ninos: 2, representantes: 1 } }
      return { ok: true, status: 200, json: async () => conteo[tipo as keyof typeof conteo] }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        filas: [
          { nino_id: 'h1', salon_id: 's1', codigo: '4821', ocupacion: 3, capacidad: 12, sobre_capacidad: false },
          { nino_id: 'h2', salon_id: 's1', codigo: '4821', ocupacion: 4, capacidad: 12, sobre_capacidad: false },
        ],
      }),
    }
  })
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_impresion_estaciones') return Promise.resolve({ data: estaciones, error: null })
    if (nombre === 'ninos_buscar_familias')
      return Promise.resolve({
        data: [{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '0414', cedula: null, hijos: [hijo({ id: 'h1', nombre: 'Luis' }), hijo({ id: 'h2', nombre: 'Eva' })] }],
        error: null,
      })
    if (nombre === 'ninos_ocupacion') return Promise.resolve({ data: [{ salon_id: 's1', nombre: 'Maternal', presentes: 2, capacidad: 12 }], error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

function pintar(campusIds: string[] = ['c1']) {
  return render(<CheckinClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-11-08' }} campusIds={campusIds} />)
}

async function abrirFamilia() {
  fireEvent.change(screen.getByLabelText('Buscar familia por teléfono o nombre'), { target: { value: 'Pérez' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  await screen.findByRole('heading', { name: 'Ana Pérez' })
}

async function registrar() {
  await abrirFamilia()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso · 2 niños' }))
  await screen.findByText('4821')
}

beforeEach(() => {
  rpc.mockReset()
  window.localStorage.clear()
  checkinsHoy = []
})

describe('desk station picker', () => {
  it('a campus without stations shows nothing and the check-in body is the one of before (preservation)', async () => {
    responder([])
    pintar()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_impresion_estaciones', {}))
    expect(screen.queryByLabelText('Impresora de esta mesa')).not.toBeInTheDocument()
    expect(screen.queryByText(/el código queda en pantalla/)).not.toBeInTheDocument()
    await registrar()
    expect(llamadas('/api/ninos/checkin')).toEqual([{ ninoIds: ['h1', 'h2'], salonIds: ['s1', 's1'], turnoId: 't9', fecha: '2026-11-08' }])
    expect(screen.queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ingreso registrado' })).toHaveTextContent(
      'Escríbelo en las dos etiquetas: la del niño y la del representante.',
    )
  })

  it('a refused station read shows nothing either', async () => {
    responder(null)
    rpc.mockImplementationOnce(() => Promise.resolve({ data: null, error: { code: '42501', message: 'sin_autoridad' } }))
    pintar()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_impresion_estaciones', {}))
    expect(screen.queryByLabelText('Impresora de esta mesa')).not.toBeInTheDocument()
  })

  it('none chosen: a small notice, and the check-in goes in without estacionId', async () => {
    responder([estacion({}), estacion({ id: 'e9', campus_id: 'otro', nombre: 'Otra sede' }), estacion({ id: 'e5', nombre: 'Apagada', activa: false })])
    pintar()
    const select = await screen.findByLabelText('Impresora de esta mesa')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin impresora', 'Mesa 1 · Conectada'])
    expect(screen.getByText('Esta mesa no tiene impresora elegida: el código queda en pantalla')).toBeInTheDocument()
    await registrar()
    expect(llamadas('/api/ninos/checkin')[0]).not.toHaveProperty('estacionId')
  })

  it('choosing a station remembers it on this device for the campus and the check-in sends estacionId', async () => {
    responder([estacion({})])
    pintar()
    fireEvent.change(await screen.findByLabelText('Impresora de esta mesa'), { target: { value: 'e1' } })
    expect(window.localStorage.getItem(CLAVE)).toBe('e1')
    expect(screen.queryByText(/el código queda en pantalla/)).not.toBeInTheDocument()
    await registrar()
    expect(llamadas('/api/ninos/checkin')).toEqual([
      { ninoIds: ['h1', 'h2'], salonIds: ['s1', 's1'], turnoId: 't9', fecha: '2026-11-08', estacionId: 'e1' },
    ])
    expect(screen.getByRole('region', { name: 'Ingreso registrado' })).toHaveTextContent(
      'Las etiquetas salen por «Mesa 1»: pega la del niño en su espalda y entrega el recibo al representante.',
    )
  })

  it('a remembered station comes chosen; «Sin impresora» forgets it', async () => {
    window.localStorage.setItem(CLAVE, 'e1')
    responder([estacion({})])
    pintar()
    const select = await screen.findByLabelText('Impresora de esta mesa')
    await waitFor(() => expect(select).toHaveValue('e1'))
    fireEvent.change(select, { target: { value: '' } })
    expect(window.localStorage.getItem(CLAVE)).toBeNull()
  })

  it('offline: «La impresora "X" está sin conexión: el código queda en pantalla», the check-in is never blocked', async () => {
    window.localStorage.setItem(CLAVE, 'e1')
    responder([estacion({ ultima_conexion: hace(10 * 60_000) })])
    pintar()
    expect(await screen.findByText('La impresora "Mesa 1" está sin conexión: el código queda en pantalla')).toBeInTheDocument()
    await registrar()
    expect(llamadas('/api/ninos/checkin')[0]).toMatchObject({ estacionId: 'e1' })
  })
})

describe('reprint (S10, S6)', () => {
  it('from the pickup code: choose labels and the receipt, a reason, the note for «Otro»', async () => {
    window.localStorage.setItem(CLAVE, 'e1')
    responder([estacion({})])
    pintar()
    await waitFor(() => expect(screen.getByLabelText('Impresora de esta mesa')).toHaveValue('e1'))
    await registrar()
    fireEvent.click(screen.getByRole('button', { name: 'Reimprimir' }))

    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Código 4821 · sale por «Mesa 1».')).toBeInTheDocument()
    const enviar = within(panel).getByRole('button', { name: 'Elige qué reimprimir' })
    expect(enviar).toBeDisabled()
    fireEvent.click(within(panel).getByLabelText('Etiqueta de Luis Pérez'))
    fireEvent.click(within(panel).getByLabelText('Recibo del representante'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Reimprimir · 2' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Elige el motivo.')
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/ninos/impresion/reimprimir')).toHaveLength(0)

    fireEvent.click(within(panel).getByRole('button', { name: 'Otro' }))
    expect(within(panel).getByRole('button', { name: 'Otro' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(panel).getByRole('button', { name: 'Reimprimir · 2' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Escribe una nota: con «Otro» es obligatoria.')

    fireEvent.change(within(panel).getByLabelText('Nota (obligatoria)'), { target: { value: 'Se mojó' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Reimprimir · 2' }))
    expect(await within(panel).findByText('Listo: 1 etiqueta y 1 recibo van a «Mesa 1». El código sigue siendo 4821.')).toBeInTheDocument()
    const base = { estacionId: 'e1', turnoId: 't9', fecha: '2026-11-08', codigo: '4821', motivo: 'otro', nota: 'Se mojó' }
    expect(llamadas('/api/ninos/impresion/reimprimir')).toEqual([
      { ...base, tipo: 'nino', ninoId: 'h1' },
      { ...base, tipo: 'representante', ninoId: null },
    ])
  })

  it('everything at once is one «todas»; a refusal is said in plain Spanish', async () => {
    window.localStorage.setItem(CLAVE, 'e1')
    responder([estacion({})])
    pintar()
    await waitFor(() => expect(screen.getByLabelText('Impresora de esta mesa')).toHaveValue('e1'))
    await registrar()
    fetchMock.mockImplementation(async () => ({ ok: false, status: 422, json: async () => ({ error: { code: '22023', message: 'checkin_no_encontrado' } }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Reimprimir' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByLabelText('Etiqueta de Luis Pérez'))
    fireEvent.click(within(panel).getByLabelText('Etiqueta de Eva Pérez'))
    fireEvent.click(within(panel).getByLabelText('Recibo del representante'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Se trabó' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Reimprimir · 3' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Ese código ya no está adentro: solo se reimprime antes del retiro.')
    expect(llamadas('/api/ninos/impresion/reimprimir')).toEqual([
      { estacionId: 'e1', turnoId: 't9', fecha: '2026-11-08', codigo: '4821', motivo: 'se_trabo', nota: null, tipo: 'todas', ninoId: null },
    ])
  })

  it('from a family already checked in: «Reimprimir etiquetas · código»', async () => {
    window.localStorage.setItem(CLAVE, 'e1')
    checkinsHoy = [{ nino_id: 'h1', codigo: '4821' }]
    responder([estacion({})])
    pintar()
    await waitFor(() => expect(screen.getByLabelText('Impresora de esta mesa')).toHaveValue('e1'))
    await abrirFamilia()
    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir etiquetas del código 4821' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByLabelText('Etiqueta de Luis Pérez')).toBeInTheDocument()
    expect(within(panel).queryByLabelText('Etiqueta de Eva Pérez')).not.toBeInTheDocument()
  })

  it('no reprint without a chosen station', async () => {
    checkinsHoy = [{ nino_id: 'h1', codigo: '4821' }]
    responder([estacion({})])
    pintar()
    await screen.findByLabelText('Impresora de esta mesa')
    await abrirFamilia()
    expect(screen.queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument()
  })
})
