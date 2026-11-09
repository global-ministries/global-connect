/**
 * Niños › Etiquetas — /ninos/etiquetas (odd/tasks/ninos-checkin-pco.md, T3b,
 * S10, S6; artboard design/ninos-checkin-pco/03-admin-etiquetas.html, the
 * stations, «Reimpresiones de hoy» and «Historial»). Coordinación / dirección
 * create stations (size optional: empty = 102 × 51 mm), edit name / size /
 * active, rotate the token (shown once, with copy and the agent guide) and see
 * the connection of each one; the reprints of the day and of a date range
 * (at most 31 days) with who, when, reason and status. RPCs mocked; without
 * matchMedia the panels are the desktop side panel. Fictitious data.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { EtiquetasClient, type EtiquetasClientProps } from '@/components/ninos/etiquetas/etiquetas-client'
import { leerEstaciones, leerReimpresiones } from '@/lib/platform/ninos/impresion-vista'

const refresh = jest.fn()
const push = jest.fn()
const rpc = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push, replace: jest.fn() }) }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

const CAMPUS = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'ab'.repeat(32)
const hace = (ms: number) => new Date(Date.now() - ms).toISOString()

const estaciones = leerEstaciones([
  { id: 'e1', campus_id: CAMPUS, nombre: 'Mesa 1 · Waumba Land', ancho_mm: null, alto_mm: null, dpi: 203, activa: true,
    ultima_conexion: hace(30_000), pendientes: 0, puede_administrar: true },
  { id: 'e2', campus_id: CAMPUS, nombre: 'Mesa 2 · UpStreet', ancho_mm: 76, alto_mm: 51, dpi: 300, activa: true,
    ultima_conexion: hace(40 * 60_000), pendientes: 3, puede_administrar: true },
  { id: 'e3', campus_id: CAMPUS, nombre: 'Mesa nueva', ancho_mm: null, alto_mm: null, dpi: 203, activa: true,
    ultima_conexion: null, pendientes: 0, puede_administrar: true },
  { id: 'e4', campus_id: CAMPUS, nombre: 'Vieja', ancho_mm: null, alto_mm: null, dpi: 203, activa: false,
    ultima_conexion: null, pendientes: 0, puede_administrar: true },
])

const hoy = leerReimpresiones([
  { id: 'i1', created_at: '2026-11-08T13:31:00Z', quien: 'Daniela Montes', tipo: 'representante', nino: null, ninos: ['Ana', 'Luis'],
    codigo: '2210', motivo: 'se_perdio', nota: 'Verificado con cédula', estacion: 'Mesa 1 · Waumba Land', estado: 'impresa', error: null },
  { id: 'i2', created_at: '2026-11-08T13:12:00Z', quien: 'Ximena Rangel', tipo: 'nino', nino: 'Valentina Rodríguez', ninos: [],
    codigo: '4827', motivo: 'se_trabo', nota: null, estacion: 'Mesa 1 · Waumba Land', estado: 'error', error: 'sin papel' },
])

function pintar(props: Partial<EtiquetasClientProps> = {}) {
  return render(
    <EtiquetasClient
      campus={[{ id: CAMPUS, nombre: 'Barquisimeto' }]}
      campusId={CAMPUS}
      estaciones={estaciones}
      reimpresionesHoy={hoy}
      hoy="2026-11-08"
      puedeAdministrar
      errorLectura={null}
      {...props}
    />,
  )
}

const ok = (data: unknown) => Promise.resolve({ data, error: null })
const filaEstacion = { id: 'e9', campus_id: CAMPUS, nombre: 'Mesa 3', ancho_mm: null, alto_mm: null, dpi: 203, activa: true, ultima_conexion: null }

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
})

describe('stations', () => {
  it('each station with its size, connection and pending jobs; the tabs carry Etiquetas', () => {
    pintar()
    expect(screen.getByRole('link', { name: 'Etiquetas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Salones' })).toHaveAttribute('href', `/ninos/salones?campus=${CAMPUS}`)
    const lista = screen.getByRole('list', { name: 'Estaciones de impresión' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas).toHaveLength(4)
    expect(filas[0]).toHaveTextContent('Mesa 1 · Waumba Land')
    expect(filas[0]).toHaveTextContent('102 × 51 mm · 203 dpi (por defecto)')
    expect(filas[0]).toHaveTextContent('Conectada')
    expect(filas[1]).toHaveTextContent('76 × 51 mm · 300 dpi')
    expect(filas[1]).toHaveTextContent(/Sin conexión desde \d\d:\d\d/)
    expect(filas[1]).toHaveTextContent('3 etiquetas en cola')
    expect(filas[2]).toHaveTextContent('Nunca se conectó')
    expect(filas[3]).toHaveTextContent('Desactivada')
    expect(screen.getByTestId('resumen-etiquetas')).toHaveTextContent('Barquisimeto · 3 estaciones activas, 2 sin conexión · 2 reimpresiones hoy')
  })

  it('creates a station: empty size means 102 × 51 mm; the token is shown once with copy and the guide', async () => {
    rpc.mockReturnValue(ok({ estacion: filaEstacion, token: TOKEN }))
    pintar()
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar estación' })[0])
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Déjalos vacíos para imprimir a 102 × 51 mm, el rollo de la 4B-2054N.')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear estación' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Ponle un nombre a la estación.')
    expect(rpc).not.toHaveBeenCalled()

    fireEvent.change(within(panel).getByLabelText('Nombre'), { target: { value: ' Mesa 3 ' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear estación' }))
    expect(await within(panel).findByLabelText('Token de la estación')).toHaveValue(TOKEN)
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_estacion_crear', {
      p_campus_id: CAMPUS, p_nombre: 'Mesa 3', p_ancho_mm: null, p_alto_mm: null, p_dpi: 203,
    })
    expect(within(panel).getByText('Cópialo ahora: no se vuelve a mostrar.')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Guía del agente de impresión/ })).toHaveAttribute(
      'href',
      'https://github.com/global-ministries/global-connect/blob/main/tools/agente-impresion/README.md',
    )
    fireEvent.click(within(panel).getByRole('button', { name: 'Copiar token' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN))
    expect(await within(panel).findByRole('button', { name: 'Copiado' })).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('a bad size is refused in plain Spanish before calling', async () => {
    pintar()
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar estación' })[0])
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText('Nombre'), { target: { value: 'Mesa 3' } })
    fireEvent.change(within(panel).getByLabelText('Ancho (mm)'), { target: { value: '76' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear estación' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Escribe el ancho y el alto, o deja los dos vacíos.')
    fireEvent.change(within(panel).getByLabelText('Alto (mm)'), { target: { value: '400' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear estación' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('El ancho va de 20 a 120 mm y el alto de 10 a 300 mm.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('edits name, size, dpi and active; an RPC refusal is said in the panel', async () => {
    rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: { code: '42501', message: 'sin_autoridad' } })).mockReturnValue(ok(filaEstacion))
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mesa 2 · UpStreet' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByLabelText('Nombre')).toHaveValue('Mesa 2 · UpStreet')
    expect(within(panel).getByLabelText('Ancho (mm)')).toHaveValue('76')
    expect(within(panel).getByLabelText('Resolución')).toHaveValue('300')
    fireEvent.change(within(panel).getByLabelText('Ancho (mm)'), { target: { value: '57' } })
    fireEvent.change(within(panel).getByLabelText('Alto (mm)'), { target: { value: '32' } })
    fireEvent.change(within(panel).getByLabelText('Resolución'), { target: { value: '203' } })
    fireEvent.click(within(panel).getByRole('switch', { name: 'Estación activa' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No tienes permiso para hacer esto en este campus.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
    expect(rpc).toHaveBeenLastCalledWith('ninos_impresion_estacion_actualizar', {
      p_estacion_id: 'e2', p_nombre: 'Mesa 2 · UpStreet', p_ancho_mm: 57, p_alto_mm: 32, p_dpi: 203, p_activa: false,
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('rotates the token after confirming: the new one is shown once', async () => {
    rpc.mockReturnValue(ok({ estacion: { ...filaEstacion, id: 'e1', nombre: 'Mesa 1 · Waumba Land' }, token: TOKEN }))
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mesa 1 · Waumba Land' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear token nuevo' }))
    expect(within(panel).getByText(/El agente que usa el token actual deja de imprimir/)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Sí, crear token nuevo' }))
    expect(await within(panel).findByLabelText('Token de la estación')).toHaveValue(TOKEN)
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_estacion_rotar_token', { p_estacion_id: 'e1' })
  })

  it('read-only for whoever does not manage the campus: no add, rows do not open', () => {
    pintar({ puedeAdministrar: false })
    expect(screen.queryByRole('button', { name: 'Agregar estación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Abrir / })).not.toBeInTheDocument()
  })

  it('a campus without stations explains how to start', () => {
    pintar({ estaciones: [] })
    expect(screen.getByText('Todavía no hay impresoras')).toBeInTheDocument()
  })
})

describe('reprints', () => {
  it('today: hour, what, reason and note, who, station, código and status', () => {
    pintar()
    const lista = screen.getByRole('list', { name: 'Reimpresiones de hoy' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('09:31')
    expect(filas[0]).toHaveTextContent('Recibo · Ana, Luis')
    expect(filas[0]).toHaveTextContent('Se perdió · Verificado con cédula')
    expect(filas[0]).toHaveTextContent('Daniela Montes · Mesa 1 · Waumba Land · 2210')
    expect(filas[0]).toHaveTextContent('Impresa')
    expect(filas[1]).toHaveTextContent('Valentina Rodríguez · etiqueta del niño')
    expect(filas[1]).toHaveTextContent('Se trabó')
    expect(filas[1]).toHaveTextContent('Con error')
    expect(screen.getByText('Cada reimpresión pide motivo y queda registrada con quién y cuándo.')).toBeInTheDocument()
  })

  it('no reprints today', () => {
    pintar({ reimpresionesHoy: [] })
    expect(screen.getByText('Hoy no hubo reimpresiones.')).toBeInTheDocument()
  })

  it('history: a date range of at most 31 days, read as the user', async () => {
    rpc.mockReturnValue(ok([{ id: 'i7', created_at: '2026-11-01T14:00:00Z', quien: 'Iván Castellanos', tipo: 'nino', nino: 'Santiago Mora',
      ninos: [], codigo: '3391', motivo: 'otro', nota: 'Lo movieron de salón', estacion: 'Mesa 1', estado: 'impresa', error: null }]))
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    const historial = screen.getByRole('region', { name: 'Historial de reimpresiones' })
    fireEvent.change(within(historial).getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.click(within(historial).getByRole('button', { name: 'Ver' }))
    expect(within(historial).getByRole('alert')).toHaveTextContent('Elige hasta 31 días.')
    expect(rpc).not.toHaveBeenCalled()
    fireEvent.change(within(historial).getByLabelText('Desde'), { target: { value: '2026-10-25' } })
    fireEvent.click(within(historial).getByRole('button', { name: 'Ver' }))
    expect(await within(historial).findByText('Santiago Mora · etiqueta del niño')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimpresiones', { p_campus_id: CAMPUS, p_desde: '2026-10-25', p_hasta: '2026-11-08' })
    expect(within(historial).getByText(/dom 1 nov · 10:00/)).toBeInTheDocument()
    expect(within(historial).getByText('Otro · Lo movieron de salón')).toBeInTheDocument()
  })
})
