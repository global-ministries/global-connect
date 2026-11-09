/**
 * cargarPendientesCargo (lib/inicio/cargar-pendientes.ts; odd/tasks/home-por-rol.md
 * T4): the «Para responder» counts of what the person has in charge, from the
 * same loaders as «A tu cargo». Each count degrades to 0 on its own.
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
})
