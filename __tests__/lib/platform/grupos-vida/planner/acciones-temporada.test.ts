/**
 * Planner server side of the new-season assistant (T8b of
 * odd/tasks/planner-gdv.md; S18, S19, S20): creating the season
 * (planner_crear_temporada, in planning and inactive), reading the closing
 * season for the diagnosis and the copy (planner_tablero + planner_banco of
 * the origin, in pages; the destination's group count when it already
 * exists), the diagnosis of the season a planner season closes, and their
 * server actions with the session client. Creating revalidates the planner
 * and the seasons list; reading does not.
 */
import { crearTemporada, type ClienteAcciones } from '@/lib/platform/grupos-vida/planner/acciones'
import { cargarCierre, cargarDiagnostico, type ClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'

const T_NUEVA = '11111111-1111-4111-8111-111111111111'
const T_ORIGEN = '22222222-2222-4222-8222-222222222222'
const T_DESTINO = '33333333-3333-4333-8333-333333333333'

function clienteAcciones(respuesta: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = jest.fn().mockResolvedValue({ data: respuesta.data ?? null, error: respuesta.error ?? null })
  return { rpc } satisfies ClienteAcciones
}

const ENTRADA = { nombre: '2027-I', fechaInicio: '2027-02-08', fechaFin: '2028-02-06' }

describe('crearTemporada (S20)', () => {
  it('calls planner_crear_temporada and reads the new season with its cohort and origin', async () => {
    const c = clienteAcciones({
      data: { id: T_NUEVA, nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06', estado: 'planificacion', activa: false, cohorte: 'I', origen: { id: T_ORIGEN, nombre: '2026-I' } },
    })

    const r = await crearTemporada(c, ENTRADA)

    expect(c.rpc).toHaveBeenCalledWith('planner_crear_temporada', { p_nombre: '2027-I', p_fecha_inicio: '2027-02-08', p_fecha_fin: '2028-02-06' })
    expect(r).toEqual({ ok: true, datos: { id: T_NUEVA, nombre: '2027-I', cohorte: 'I', origen: { id: T_ORIGEN, nombre: '2026-I' } } })
  })

  it('reads a season without origin', async () => {
    const r = await crearTemporada(clienteAcciones({ data: { id: T_NUEVA, nombre: '2027-I', cohorte: 'I', origen: null } }), ENTRADA)
    expect(r).toEqual({ ok: true, datos: { id: T_NUEVA, nombre: '2027-I', cohorte: 'I', origen: null } })
  })

  it('refuses an empty name or a bad date before the RPC', async () => {
    const c = clienteAcciones({})
    expect(await crearTemporada(c, { ...ENTRADA, nombre: '  ' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'La temporada debe tener nombre.' })
    expect(await crearTemporada(c, { ...ENTRADA, fechaFin: '6 feb' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'Indica la fecha de inicio y la de fin.' })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it("keeps the RPC's own words for rule and permission errors", async () => {
    const r = await crearTemporada(clienteAcciones({ error: { code: '22023', message: 'Ya existe una temporada llamada «2027-I»' } }), ENTRADA)
    expect(r).toEqual({ ok: false, codigo: '22023', mensaje: 'Ya existe una temporada llamada «2027-I».' })
    const permiso = await crearTemporada(
      clienteAcciones({ error: { code: '42501', message: 'Solo el director general, un pastor o un administrador pueden crear temporadas' } }),
      ENTRADA,
    )
    expect(permiso).toEqual({ ok: false, codigo: '42501', mensaje: 'Solo el director general, un pastor o un administrador pueden crear temporadas.' })
  })

  it('says it could not create the season on an unexpected error or an answer without id', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await crearTemporada(clienteAcciones({ error: { code: 'XX000', message: 'boom' } }), ENTRADA)).toEqual({
      ok: false,
      codigo: 'XX000',
      mensaje: 'No se pudo crear la temporada. Inténtalo de nuevo.',
    })
    expect(await crearTemporada(clienteAcciones({ data: {} }), ENTRADA)).toEqual({ ok: false, codigo: null, mensaje: 'No se pudo crear la temporada. Inténtalo de nuevo.' })
    consola.mockRestore()
  })
})

// ─── Reading the closing season ───

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }

const grupoFila = (grupo_id: string, lideres: string[], extra: Record<string, unknown> = {}) => ({
  grupo_id,
  nombre: `Grupo ${grupo_id}`,
  segmento_id: 'seg-mat',
  segmento_nombre: 'Matrimonios',
  localidad_id: 'loc-cab',
  localidad_nombre: 'Cabudare',
  activo: true,
  directores: [],
  lideres: lideres.map((usuario_id) => ({ usuario_id, nombre: usuario_id, apellido: 'Pérez', lideres_origen: [] })),
  aprendices: [],
  miembros: [],
  ...extra,
})

function clientePlanner(respuestas: Record<string, Respuesta>) {
  const llamadas: { nombre: string; args?: Record<string, unknown>; rango?: [number, number] }[] = []
  const cliente: Pick<ClientePlanner, 'rpc'> = {
    rpc: (nombre, args) => {
      const llamada: (typeof llamadas)[number] = { nombre, args }
      llamadas.push(llamada)
      const clave = args?.p_temporada_id ? `${nombre}:${String(args.p_temporada_id)}` : nombre
      const r = respuestas[clave] ?? { data: null, error: null }
      return {
        then: (bien, mal) => Promise.resolve(r).then(bien, mal),
        range: (desde, hasta) => {
          llamada.rango = [desde, hasta]
          return Promise.resolve(Array.isArray(r.data) ? { ...r, data: r.data.slice(desde, hasta + 1) } : r)
        },
      }
    },
  }
  return { cliente, llamadas }
}

describe('cargarCierre', () => {
  it('reads the origin groups and bank in pages and computes the diagnosis', async () => {
    const { cliente, llamadas } = clientePlanner({
      [`planner_tablero:${T_ORIGEN}`]: { data: [grupoFila('g1', ['u1', 'u2']), grupoFila('g2', ['u3'])], error: null },
      [`planner_banco:${T_ORIGEN}`]: { data: [{ usuario_id: 'u1', conyuge_id: 'u2', municipio_nombre: 'Palavecino' }, { usuario_id: 'u2', conyuge_id: 'u1' }], error: null },
    })

    const r = await cargarCierre(cliente, { origenId: T_ORIGEN })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.grupos.map((g) => g.grupo_id)).toEqual(['g1', 'g2'])
    expect(r.diagnostico).toMatchObject({ grupos: 2, integrantes: 3, lideres: 3, parejasQueLideran: 1 })
    expect(r.gruposDestino).toBeNull()
    expect(llamadas.map((l) => [l.nombre, l.rango])).toEqual([
      ['planner_tablero', [0, 999]],
      ['planner_banco', [0, 999]],
    ])
  })

  it('counts the groups the destination already has', async () => {
    const { cliente } = clientePlanner({
      [`planner_tablero:${T_ORIGEN}`]: { data: [grupoFila('g1', ['u1'])], error: null },
      [`planner_tablero:${T_DESTINO}`]: { data: [grupoFila('d1', []), grupoFila('d2', [], { estado_ciclo: 'cancelado' })], error: null },
    })
    const r = await cargarCierre(cliente, { origenId: T_ORIGEN, destinoId: T_DESTINO })
    expect(r.ok && r.gruposDestino).toBe(1)
  })

  it('refuses a bad id and says why a read failed', async () => {
    const { cliente, llamadas } = clientePlanner({ [`planner_banco:${T_ORIGEN}`]: { data: null, error: { code: '42501', message: 'No' } } })
    expect(await cargarCierre(cliente, { origenId: 'x' })).toEqual({ ok: false, mensaje: 'La temporada no existe.' })
    expect(llamadas).toEqual([])
    expect(await cargarCierre(cliente, { origenId: T_ORIGEN })).toEqual({ ok: false, mensaje: 'No tienes permiso para usar el planificador.' })
  })
})

const temporadas = (lista: Record<string, unknown>[]) => ({
  data: { usuario_id: 'u-dg', ve_todos_los_segmentos: true, puede_publicar: true, puede_crear_temporada: true, segmentos_editables: [], segmentos: [], temporadas: lista },
  error: null,
})
const T2026_II = { id: T_DESTINO, nombre: '2026-II', activa: false, estado: 'planificacion', cohorte: 'II', origen_id: T_ORIGEN, origen_nombre: '2025 - II' }

describe('cargarDiagnostico (the planner view)', () => {
  it('diagnoses the season the planning season closes', async () => {
    const { cliente } = clientePlanner({
      planner_temporadas: temporadas([T2026_II]),
      [`planner_tablero:${T_ORIGEN}`]: { data: [grupoFila('g1', ['u1'])], error: null },
    })
    const r = await cargarDiagnostico(cliente, null)
    expect(r).toMatchObject({ tipo: 'listo', temporada: { id: T_DESTINO }, origen: { id: T_ORIGEN, nombre: '2025 - II' }, diagnostico: { grupos: 1 } })
  })

  it('says when the season closes nothing, or there is no season, or no access', async () => {
    const sinOrigen = clientePlanner({ planner_temporadas: temporadas([{ ...T2026_II, origen_id: null, origen_nombre: null }]) })
    expect(await cargarDiagnostico(sinOrigen.cliente, T_DESTINO)).toMatchObject({ tipo: 'sin_origen', temporada: { id: T_DESTINO } })
    expect(sinOrigen.llamadas.map((l) => l.nombre)).toEqual(['planner_temporadas'])

    expect(await cargarDiagnostico(clientePlanner({ planner_temporadas: temporadas([]) }).cliente, null)).toEqual({ tipo: 'sin_temporada' })
    expect(await cargarDiagnostico(clientePlanner({ planner_temporadas: { data: null, error: { code: '42501' } } }).cliente, null)).toEqual({ tipo: 'sin_acceso' })
  })
})

// ─── Server actions ───

const revalidatePath = jest.fn()
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
const sesion = { rpc: jest.fn(), from: jest.fn() }
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => sesion }))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('service role is never used')
  },
}))

describe('server actions', () => {
  beforeEach(() => {
    revalidatePath.mockClear()
    sesion.rpc.mockReset()
  })

  it('crearTemporadaAction creates with the session client and revalidates the planner and the seasons', async () => {
    sesion.rpc.mockResolvedValue({ data: { id: T_NUEVA, nombre: '2027-I', cohorte: 'I', origen: null }, error: null })
    const { crearTemporadaAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')

    const r = await crearTemporadaAction(ENTRADA)

    expect(r.ok).toBe(true)
    expect(sesion.rpc).toHaveBeenCalledWith('planner_crear_temporada', expect.objectContaining({ p_nombre: '2027-I' }))
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/planificar', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/temporadas')
  })

  it('crearTemporadaAction does not revalidate a refused season', async () => {
    sesion.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Ya existe' } })
    const { crearTemporadaAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    expect((await crearTemporadaAction(ENTRADA)).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('cargarCierreAction reads without revalidating', async () => {
    sesion.rpc.mockImplementation(() => ({ range: async () => ({ data: [], error: null }) }))
    const { cargarCierreAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    const r = await cargarCierreAction({ origenId: T_ORIGEN })
    expect(r).toMatchObject({ ok: true, grupos: [], diagnostico: { grupos: 0 } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
