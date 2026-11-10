/**
 * cargarPendientesCargo (lib/inicio/cargar-pendientes.ts; odd/tasks/home-por-rol.md
 * T4): the «Para responder» counts of what the person has in charge, from the
 * same loaders as «A tu cargo». Each count degrades to 0 on its own.
 * With the real loaders (T9, L22), «líderes sin reporte» counts the groups read
 * with the service client within the person's own etapas and segmentos.
 */
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'
import { cargarPendientesCargo } from '@/lib/inicio/cargar-pendientes'

const cargarEtapa = jest.fn()
const cargarSegmento = jest.fn()
const cargarArea = jest.fn()

jest.mock('@/lib/inicio/cargar-a-cargo', () => ({
  ...jest.requireActual('@/lib/inicio/cargar-a-cargo'),
  cargarEtapa: (...a: unknown[]) => cargarEtapa(...a),
  cargarSegmento: (...a: unknown[]) => cargarSegmento(...a),
  cargarArea: (...a: unknown[]) => cargarArea(...a),
}))

const crearAdmin = jest.fn((): unknown => {
  throw new Error('sin clave de servicio')
})
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => crearAdmin() }))

type Fila = Record<string, unknown>

/** A client over in-memory tables that applies eq/in/is/gte/lte, as in cargar-a-cargo.test. */
function tablas(datos: Record<string, Fila[]>, user = { id: 'auth-1' }) {
  const leidas: string[] = []
  const from = jest.fn((tabla: string) => {
    leidas.push(tabla)
    let resultado = datos[tabla] ?? []
    let conteo = false
    const q: Record<string, unknown> = {}
    const filtro = (f: (fila: Fila) => boolean) => () => {
      resultado = resultado.filter(f)
      return q
    }
    q.select = jest.fn((_c: string, o?: { head?: boolean }) => ((conteo = o?.head === true), q))
    q.eq = jest.fn((c: string, v: unknown) => filtro((f) => f[c] === v)())
    q.in = jest.fn((c: string, v: unknown[]) => filtro((f) => v.includes(f[c]))())
    q.is = jest.fn((c: string, v: unknown) => filtro((f) => (f[c] ?? null) === v)())
    q.gte = jest.fn((c: string, v: string) => filtro((f) => String(f[c]) >= v)())
    q.lte = jest.fn((c: string, v: string) => filtro((f) => String(f[c]) <= v)())
    for (const m of ['order', 'range', 'limit']) q[m] = jest.fn(() => q)
    const resolver = () => (conteo ? { count: resultado.length, error: null } : { data: resultado, error: null })
    q.maybeSingle = jest.fn(() => Promise.resolve({ data: resultado[0] ?? null, error: null }))
    q.then = (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, mal)
    return q
  })
  return { from, rpc: jest.fn(), auth: { getUser: jest.fn(() => Promise.resolve({ data: { user }, error: null })) }, leidas }
}

function cliente(eventos: { data: unknown; error: unknown }) {
  const llamadas: unknown[][] = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'gte', 'lte']) {
    q[m] = jest.fn((...a: unknown[]) => {
      llamadas.push([m, ...a])
      return q
    })
  }
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(eventos).then(ok)
  return { from: jest.fn(() => q), llamadas }
}

const grupo = (grupoId: string, reporto: boolean) => ({ grupoId, nombre: grupoId, lideres: [], asistencia: null, reporto })
const voluntario = (usuarioId: string) => ({ usuarioId, nombre: usuarioId, estado: 'postulado', equipo: null })

const PEDIDO = { usuarioId: 'u-1', hoy: '2026-11-09', gruposLider: ['g-1', 'g-2'], etapas: ['sl-1'], segmentos: ['seg-1'], areas: ['eq-1', 'eq-2'] }

describe('cargarPendientesCargo', () => {
  let consola: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    cargarEtapa.mockResolvedValue({ grupos: [grupo('g-a', false), grupo('g-b', true)] })
    cargarSegmento.mockResolvedValue({ grupos: [grupo('g-a', false), grupo('g-c', false)] })
    cargarArea.mockImplementation(async (_s: unknown, id: string) => ({ sinProximoPaso: id === 'eq-1' ? [voluntario('p-1'), voluntario('p-2')] : [voluntario('p-2')] }))
  })

  afterEach(() => consola.mockRestore())

  it('cuenta reportes sin cargar, líderes sin reporte y voluntarios sin Próximo Paso, sin repetir', async () => {
    const c = cliente({ data: [{ grupo_id: 'g-1' }], error: null })

    await expect(cargarPendientesCargo(c as unknown as ClienteInicio, PEDIDO)).resolves.toEqual({ reportesSinCargar: 1, lideresSinReporte: 2, marcarProximoPaso: 2 })
    expect(c.llamadas).toEqual([
      ['select', 'grupo_id'],
      ['in', 'grupo_id', ['g-1', 'g-2']],
      ['gte', 'fecha', '2026-11-02'],
      ['lte', 'fecha', '2026-11-08'],
    ])
    expect(cargarEtapa).toHaveBeenCalledWith(c, 'sl-1', '2026-11-09')
    expect(cargarSegmento).toHaveBeenCalledWith(c, 'seg-1', 'u-1', '2026-11-09')
    // Two areas: the same arguments «A tu cargo» uses, so the memoized read is shared.
    expect(cargarArea).toHaveBeenCalledWith(c, 'eq-1', false)
  })

  it('una cuenta que falla queda en 0 y las demás siguen', async () => {
    const c = cliente({ data: null, error: { message: 'permission denied' } })
    cargarArea.mockRejectedValue(new Error('rpc caída'))

    await expect(cargarPendientesCargo(c as unknown as ClienteInicio, PEDIDO)).resolves.toEqual({ reportesSinCargar: 0, lideresSinReporte: 2, marcarProximoPaso: 0 })
    expect(consola).toHaveBeenCalledTimes(2)
  })

  it('sin cargos no lee nada', async () => {
    const c = cliente({ data: [], error: null })

    await expect(cargarPendientesCargo(c as unknown as ClienteInicio, { ...PEDIDO, gruposLider: [], etapas: [], segmentos: [], areas: [] })).resolves.toEqual({
      reportesSinCargar: 0,
      lideresSinReporte: 0,
      marcarProximoPaso: 0,
    })
    expect(c.from).not.toHaveBeenCalled()
    expect(cargarEtapa).not.toHaveBeenCalled()
  })

  it('líderes sin reporte con permisos reales: los grupos de su etapa y su segmento leídos con el cliente de servicio', async () => {
    const real = jest.requireActual('@/lib/inicio/cargar-a-cargo')
    cargarEtapa.mockImplementation(real.cargarEtapa)
    cargarSegmento.mockImplementation(real.cargarSegmento)
    // As RLS for a director (L22): no links, no meetings.
    const sesion = tablas({ segmento_lideres: [{ id: 'sl-1', usuario_id: 'u-1', tipo_lider: 'director_etapa' }], director_general_segmentos: [{ usuario_id: 'u-1', segmento_id: 'seg-1', alcance: 'segmento' }] })
    const admin = tablas({
      usuarios: [{ id: 'u-1', auth_id: 'auth-1' }],
      segmentos: [{ id: 'seg-1', nombre: 'Mujeres' }, { id: 'seg-2', nombre: 'Hombres' }],
      segmento_lideres: [
        { id: 'sl-1', usuario_id: 'u-1', tipo_lider: 'director_etapa', segmento_id: 'seg-2' },
        { id: 'sl-2', usuario_id: 'u-2', tipo_lider: 'director_etapa', segmento_id: 'seg-2' },
      ],
      director_etapa_grupos: [
        { director_etapa_id: 'sl-1', grupo_id: 'g-e1' },
        { director_etapa_id: 'sl-1', grupo_id: 'g-e2' },
        { director_etapa_id: 'sl-2', grupo_id: 'g-otra' },
      ],
      director_general_segmentos: [{ usuario_id: 'u-1', segmento_id: 'seg-1', alcance: 'segmento' }],
      grupos: [
        { id: 'g-e1', activo: true, segmento_id: 'seg-2' },
        { id: 'g-e2', activo: true, segmento_id: 'seg-2' },
        { id: 'g-otra', activo: true, segmento_id: 'seg-2' },
        { id: 'g-s1', activo: true, segmento_id: 'seg-1' },
        { id: 'g-s2', activo: true, segmento_id: 'seg-1' },
      ],
      eventos_grupo: [
        { id: 'e-1', grupo_id: 'g-e1', fecha: '2026-11-04', no_hubo_reunion: true },
        { id: 'e-2', grupo_id: 'g-s1', fecha: '2026-11-05', no_hubo_reunion: true },
      ],
    })
    crearAdmin.mockImplementation(() => admin)

    await expect(
      cargarPendientesCargo(sesion as unknown as ClienteInicio, { ...PEDIDO, usuarioId: 'u-otro', gruposLider: [], areas: [], etapas: ['sl-1', 'sl-2'], segmentos: ['seg-1'] }),
    ).resolves.toEqual({ reportesSinCargar: 0, lideresSinReporte: 2, marcarProximoPaso: 0 })
    // g-e2 and g-s2 did not report; g-otra (an etapa of another person) is not counted.
    expect(sesion.leidas).not.toContain('eventos_grupo')
    crearAdmin.mockImplementation(() => {
      throw new Error('sin clave de servicio')
    })
  })
})
