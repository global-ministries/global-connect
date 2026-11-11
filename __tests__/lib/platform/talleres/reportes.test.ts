/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — loader for
 * /talleres/reportes, the consolidated reportes list. Replaces
 * app/(auth)/talleres/coordinacion/reportes and app/(auth)/talleres/
 * direccion/reportes (both kept alive, unmodified, until T10) — a diff
 * of the two showed they call the SAME loadCoordReportes and differ only
 * in the director variant's counter row and metadata (see this task's
 * report for the full diff, including a regression the director variant
 * introduced: it silently dropped the coordinador variant's "Reabierto"
 * badge).
 *
 * `loadCoordReportes` (operacional.ts) selects `taller_reportes` with no
 * taller/equipo context at all. This module adds exactly what the page
 * needs and the old loader doesn't have: each row's owning equipo, via
 * the SAME SECURITY DEFINER resolver the table's own RLS policies use
 * internally (`talleres_equipo_de_grupo`, supabase/migrations/
 * 20260821000004_cimiento3a_talleres_coordinador_scope_rls.sql) — and
 * the owning taller's nombre via one batched `talleres` lookup keyed by
 * the distinct equipo ids, mirroring loadPendientesSolicitudes's exact
 * pattern (lib/platform/talleres/pendientes.ts).
 *
 * R3g (odd/tasks/talleres-rediseno.md, S4) adds, still without a new
 * query: each report's grupo nombre and edición (loadGrupoDetalle), and
 * loadEdicionesReporte — the ediciones of loadCoordTalleresAgrupados with
 * their counts (loadEdicionLocalDetalle) and completados
 * (finalizationRateByTaller), kept only where the viewer holds verReportes
 * on the edición's equipo.
 */

import { loadEdicionesReporte, loadReportes } from '@/lib/platform/talleres/reportes'
import type { CoordReporte } from '@/lib/platform/talleres/operacional'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadCoordReportes: jest.fn(),
  loadCoordTalleresAgrupados: jest.fn(),
  loadEdicionLocalDetalle: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/metrics', () => ({
  finalizationRateByTaller: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/grupo-detalle', () => ({
  loadGrupoDetalle: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisosPorEquipos: jest.fn() }
})

const operacional = jest.requireMock('@/lib/platform/talleres/operacional') as Record<string, jest.Mock>
const loadCoordReportesMock = operacional.loadCoordReportes
const finalizationRateByTaller = jest.requireMock('@/lib/platform/talleres/metrics').finalizationRateByTaller as jest.Mock
const loadGrupoDetalle = jest.requireMock('@/lib/platform/talleres/grupo-detalle').loadGrupoDetalle as jest.Mock
const cargarPermisosPorEquipos = jest.requireMock('@/lib/platform/talleres/permisos').cargarPermisosPorEquipos as jest.Mock

const CON_REPORTES: PermisosTaller = { ...PERMISOS_TALLER_ALL_FALSE, ver: true, verReportes: true }

function makeReporte(overrides: Partial<CoordReporte> = {}): CoordReporte {
  return {
    id: 'rep-1',
    grupo_id: 'grupo-1',
    estado: 'enviado',
    firma_lider_fecha: '2026-09-10T00:00:00Z',
    reabierto_motivo: null,
    ...overrides,
  }
}

interface CapturedInClause {
  readonly table: string
  readonly column: string
  readonly value: readonly unknown[]
}

interface CapturedRpcCall {
  readonly fn: string
  readonly args: unknown
}

function makeClient(opts: {
  talleresData?: unknown[]
  rpcImpl?: (fn: string, args: Record<string, unknown>) => unknown
}) {
  const capturedIn: CapturedInClause[] = []
  const capturedRpc: CapturedRpcCall[] = []

  const client = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        in: (column: string, value: readonly unknown[]) => {
          capturedIn.push({ table, column, value })
          return chain
        },
        then: (resolve: (v: { data: unknown[] | null; error: null }) => unknown) =>
          Promise.resolve({ data: opts.talleresData ?? [], error: null }).then(resolve),
      }
      return chain
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      capturedRpc.push({ fn, args })
      const result = opts.rpcImpl ? opts.rpcImpl(fn, args) : null
      return Promise.resolve({ data: result, error: null })
    },
  }
  return { client, capturedIn, capturedRpc }
}

beforeEach(() => {
  jest.resetAllMocks()
  loadGrupoDetalle.mockResolvedValue(null)
})

describe('loadReportes', () => {
  it('reuses loadCoordReportes for the row data (never re-implements the query)', async () => {
    loadCoordReportesMock.mockResolvedValue([])
    const { client } = makeClient({})
    await loadReportes(client)
    expect(loadCoordReportesMock).toHaveBeenCalledTimes(1)
  })

  it('makes no RPC or talleres query and returns empty when there are zero reportes', async () => {
    loadCoordReportesMock.mockResolvedValue([])
    const { client, capturedIn, capturedRpc } = makeClient({})
    const result = await loadReportes(client)
    expect(result).toEqual([])
    expect(capturedRpc).toHaveLength(0)
    expect(capturedIn.filter((c) => c.table === 'talleres')).toHaveLength(0)
  })

  it("resolves each row's equipo via talleres_equipo_de_grupo, passing its grupo_id", async () => {
    loadCoordReportesMock.mockResolvedValue([
      makeReporte({ id: 'rep-1', grupo_id: 'grupo-a' }),
      makeReporte({ id: 'rep-2', grupo_id: 'grupo-b' }),
    ])
    const { client, capturedRpc } = makeClient({ rpcImpl: () => 'eq-1' })
    await loadReportes(client)

    const calls = capturedRpc.filter((c) => c.fn === 'talleres_equipo_de_grupo')
    expect(calls).toHaveLength(2)
    expect(calls).toEqual(
      expect.arrayContaining([
        { fn: 'talleres_equipo_de_grupo', args: { p_grupo_id: 'grupo-a' } },
        { fn: 'talleres_equipo_de_grupo', args: { p_grupo_id: 'grupo-b' } },
      ]),
    )
  })

  it('enriches each row with its equipo id + taller nombre, from a single batched talleres lookup deduping repeated equipo ids', async () => {
    loadCoordReportesMock.mockResolvedValue([
      makeReporte({ id: 'rep-1', grupo_id: 'grupo-a' }),
      makeReporte({ id: 'rep-2', grupo_id: 'grupo-b' }),
    ])
    const { client, capturedIn } = makeClient({
      rpcImpl: () => 'eq-1', // both grupos resolve to the same equipo
      talleresData: [{ nombre: 'Matrimonio sobre la Roca', dream_team_equipo_id: 'eq-1' }],
    })
    const result = await loadReportes(client)

    const tallerLookups = capturedIn.filter((c) => c.table === 'talleres')
    expect(tallerLookups).toHaveLength(1)
    expect(tallerLookups[0]?.value).toEqual(['eq-1'])

    expect(result.every((r) => r.equipoId === 'eq-1')).toBe(true)
    expect(result.every((r) => r.tallerNombre === 'Matrimonio sobre la Roca')).toBe(true)
  })

  it('never drops a row when the equipo cannot be resolved — equipoId/tallerNombre become null', async () => {
    loadCoordReportesMock.mockResolvedValue([makeReporte({ id: 'rep-1', grupo_id: 'grupo-orphan' })])
    const { client } = makeClient({ rpcImpl: () => null })
    const result = await loadReportes(client)
    expect(result).toHaveLength(1)
    expect(result[0]?.equipoId).toBeNull()
    expect(result[0]?.tallerNombre).toBeNull()
  })

  it('preserves every field from the underlying CoordReporte row, including reabierto_motivo', async () => {
    loadCoordReportesMock.mockResolvedValue([
      makeReporte({ id: 'rep-1', estado: 'reabierto', reabierto_motivo: 'Faltaban firmas' }),
    ])
    const { client } = makeClient({ rpcImpl: () => 'eq-1', talleresData: [] })
    const [row] = await loadReportes(client)
    expect(row?.estado).toBe('reabierto')
    expect(row?.reabierto_motivo).toBe('Faltaban firmas')
  })

  it('adds the grupo nombre and edición of each row, null when the grupo cannot be read (row kept)', async () => {
    loadCoordReportesMock.mockResolvedValue([
      makeReporte({ id: 'rep-1', grupo_id: 'grupo-a' }),
      makeReporte({ id: 'rep-2', grupo_id: 'grupo-b' }),
    ])
    loadGrupoDetalle.mockImplementation(async (_c: unknown, grupoId: string) =>
      grupoId === 'grupo-a'
        ? { id: 'grupo-a', nombre: 'Grupo Jueves', capacidad: 10, estado: 'activo', cohorteId: 'c-1', edicionId: 'ed-1' }
        : null,
    )
    const { client } = makeClient({ rpcImpl: () => 'eq-1' })
    const result = await loadReportes(client)
    expect(result.map((r) => [r.id, r.grupoNombre, r.edicionId])).toEqual([
      ['rep-1', 'Grupo Jueves', 'ed-1'],
      ['rep-2', null, null],
    ])
  })

  it('makes no grupo read when there are zero reportes', async () => {
    loadCoordReportesMock.mockResolvedValue([])
    const { client } = makeClient({})
    await loadReportes(client)
    expect(loadGrupoDetalle).not.toHaveBeenCalled()
  })
})

function detalle(id: string, equipo: string | null, over: Record<string, unknown> = {}) {
  return {
    id,
    taller_id: 't-1',
    taller_nombre: 'Mujer de Hoy',
    taller_slug: 'mujer-de-hoy',
    nombre_snapshot: `Edición ${id}`,
    estado: 'cerrado',
    fecha_inicio: '2026-01-10',
    fecha_fin: '2026-03-01',
    cerrada_en: '2026-03-05T00:00:00Z',
    cohorte: equipo ? { id: `c-${id}`, dream_team_equipo_id: equipo, edicion: '', started_at: '2026-01-10T00:00:00Z', ended_at: null } : null,
    inscripciones_count: 30,
    inscripciones_aprobadas_count: 28,
    certificados_count: 25,
    ...over,
  }
}

describe('loadEdicionesReporte', () => {
  it('maps the counts of each edición and keeps only those where the viewer holds verReportes', async () => {
    operacional.loadCoordTalleresAgrupados.mockResolvedValue([
      {
        taller_id: 't-1',
        taller_nombre: 'Mujer de Hoy',
        ediciones: [
          { id: 'ed-1', nombre_snapshot: 'a', tipo: 'individual', estado: 'cerrado' },
          { id: 'ed-2', nombre_snapshot: 'b', tipo: 'individual', estado: 'en_curso' },
          { id: 'ed-3', nombre_snapshot: 'c', tipo: 'individual', estado: 'en_curso' },
        ],
      },
    ])
    operacional.loadEdicionLocalDetalle.mockImplementation(async (_c: unknown, id: string) =>
      id === 'ed-1' ? detalle(id, 'eq-a') : id === 'ed-2' ? detalle(id, 'eq-b') : detalle(id, null),
    )
    finalizationRateByTaller.mockResolvedValue({ completados: 27, totalConEstadoFinal: 30, rate: 0.9 })
    cargarPermisosPorEquipos.mockResolvedValue(new Map([['eq-a', CON_REPORTES], ['eq-b', PERMISOS_TALLER_ALL_FALSE]]))

    const filas = await loadEdicionesReporte({})
    expect(filas).toEqual([
      {
        id: 'ed-1',
        tallerId: 't-1',
        tallerNombre: 'Mujer de Hoy',
        tallerSlug: 'mujer-de-hoy',
        nombre: 'Edición ed-1',
        estado: 'cerrado',
        fechaInicio: '2026-01-10',
        fechaFin: '2026-03-01',
        cerradaEn: '2026-03-05T00:00:00Z',
        inscripciones: 30,
        certificados: 25,
        completaron: 27,
        conResultado: 30,
      },
    ])
    expect(new Set(cargarPermisosPorEquipos.mock.calls[0][1])).toEqual(new Set(['eq-a', 'eq-b']))
  })

  it('skips borrador and cancelada ediciones without loading them', async () => {
    operacional.loadCoordTalleresAgrupados.mockResolvedValue([
      {
        taller_id: 't-1',
        taller_nombre: 'Mujer de Hoy',
        ediciones: [
          { id: 'b', nombre_snapshot: 'b', tipo: 'individual', estado: 'borrador' },
          { id: 'c', nombre_snapshot: 'c', tipo: 'individual', estado: 'cancelado' },
        ],
      },
    ])
    cargarPermisosPorEquipos.mockResolvedValue(new Map())
    expect(await loadEdicionesReporte({})).toEqual([])
    expect(operacional.loadEdicionLocalDetalle).not.toHaveBeenCalled()
  })

  it('falls back to the cohorte start date and leaves completaron unknown when finalization cannot be read or has no results', async () => {
    operacional.loadCoordTalleresAgrupados.mockResolvedValue([
      {
        taller_id: 't-1',
        taller_nombre: 'Mujer de Hoy',
        ediciones: [
          { id: 'x', nombre_snapshot: 'x', tipo: 'individual', estado: 'en_curso' },
          { id: 'y', nombre_snapshot: 'y', tipo: 'individual', estado: 'en_curso' },
        ],
      },
    ])
    operacional.loadEdicionLocalDetalle.mockImplementation(async (_c: unknown, id: string) =>
      detalle(id, 'eq-a', { fecha_inicio: null, fecha_fin: null, cerrada_en: null, estado: 'en_curso' }),
    )
    finalizationRateByTaller.mockImplementation(async (_c: unknown, id: string) => {
      if (id === 'x') throw new Error('boom')
      return { completados: 0, totalConEstadoFinal: 0, rate: 0 }
    })
    cargarPermisosPorEquipos.mockResolvedValue(new Map([['eq-a', CON_REPORTES]]))

    const filas = await loadEdicionesReporte({})
    expect(filas.map((f) => [f.id, f.fechaInicio, f.completaron, f.conResultado])).toEqual([
      ['x', '2026-01-10', null, 0],
      ['y', '2026-01-10', null, 0],
    ])
  })
})
