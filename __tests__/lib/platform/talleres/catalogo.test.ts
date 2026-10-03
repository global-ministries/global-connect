/**
 * @jest-environment node
 *
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — the /talleres catalog's
 * own loaders.
 *
 * loadCatalogoTalleres unifies loadDirTalleres (flat, with
 * total_inscripciones) and loadCoordTalleresAgrupados (grouped by taller)
 * into ONE loader that queries FROM talleres with taller_ediciones nested,
 * for the new consolidated catalog. It does NOT replace either old loader
 * — direccion/talleres, direccion/metricas and coordinacion/* still import
 * them until T10 deletes those routes.
 *
 * loadMisGruposResumen enriches loadEquipoGrupos (T2 must reuse it, not
 * re-query taller_grupo_asignaciones by hand) with the taller/edición name
 * and the nearest upcoming class date (from loadEquipoProximasSesiones),
 * via small batched lookups — the same pattern loadCoordInscripcionesPendientes
 * already uses for persona/edicion/cohorte names.
 */

import {
  loadCatalogoTalleres,
  loadMisGruposCount,
  loadMisGruposResumen,
  loadMisTalleres,
  loadTallerDetalle,
  type CatalogoTaller,
} from '@/lib/platform/talleres/catalogo'
import type { OperacionalContext } from '@/lib/platform/talleres/operacional'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadEquipoGrupos: jest.fn(),
  loadEquipoProximasSesiones: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisosPorEquipos: jest.fn() }
})

const permisosModule = jest.requireMock('@/lib/platform/talleres/permisos') as {
  cargarPermisosPorEquipos: jest.Mock
}

const operacionalModule = jest.requireMock('@/lib/platform/talleres/operacional') as {
  loadEquipoGrupos: jest.Mock
  loadEquipoProximasSesiones: jest.Mock
}

const PERSONA_ID = '00000000-0000-0000-0000-000000000001'

// ─── loadCatalogoTalleres ───────────────────────────────────────────────

/** Thenable `.from(t).select(cols).order()` client mock, one table only. */
function buildCatalogoClientMock(
  rows: unknown[] | null,
  error: unknown = null,
): { client: { from: jest.Mock }; selectCols: string[]; orderCols: string[] } {
  const selectCols: string[] = []
  const orderCols: string[] = []
  const from = jest.fn(() => {
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn((cols: string) => {
      selectCols.push(cols)
      return b
    })
    b['order'] = jest.fn((col: string) => {
      orderCols.push(col)
      return b
    })
    Object.defineProperty(b, 'then', {
      value: (resolve: (v: unknown) => void) => resolve({ data: rows, error }),
    })
    return b
  })
  return { client: { from }, selectCols, orderCols }
}

describe('loadCatalogoTalleres', () => {
  it('selects FROM talleres with taller_ediciones nested and orders by nombre', async () => {
    const { client, selectCols, orderCols } = buildCatalogoClientMock([])
    await loadCatalogoTalleres(client)
    expect(client.from).toHaveBeenCalledWith('talleres')
    expect(selectCols[0]).toMatch(/taller_ediciones/)
    expect(orderCols[0]).toBe('nombre')
  })

  it('maps talleres with their nested ediciones and per-edición inscripciones counts', async () => {
    const rows = [
      {
        id: 't-1',
        slug: 'matrimonio-sobre-la-roca',
        nombre: 'Matrimonio sobre la Roca',
        estado: 'active',
        dream_team_equipo_id: 'eq-1',
        ediciones: [
          {
            id: 'e-2',
            nombre_snapshot: 'Octubre 2026',
            tipo: 'pareja',
            estado: 'abierto',
            inscripciones: [{ id: 'i-1' }, { id: 'i-2' }],
          },
          {
            id: 'e-1',
            nombre_snapshot: 'Septiembre 2026',
            tipo: 'individual',
            estado: 'borrador',
            inscripciones: [],
          },
        ],
      },
    ]
    const { client } = buildCatalogoClientMock(rows)
    const result = await loadCatalogoTalleres(client)

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('t-1')
    expect(result[0]?.slug).toBe('matrimonio-sobre-la-roca')
    expect(result[0]?.dream_team_equipo_id).toBe('eq-1')
    expect(result[0]?.ediciones).toHaveLength(2)
    // Sorted by nombre_snapshot ascending, independent of query order.
    expect(result[0]?.ediciones.map((e) => e.nombre_snapshot)).toEqual([
      'Octubre 2026',
      'Septiembre 2026',
    ])
    const octubre = result[0]?.ediciones.find((e) => e.id === 'e-2')
    expect(octubre?.total_inscripciones).toBe(2)
    const septiembre = result[0]?.ediciones.find((e) => e.id === 'e-1')
    expect(septiembre?.total_inscripciones).toBe(0)
  })

  it('defaults dream_team_equipo_id to null and ediciones to [] when missing', async () => {
    const rows = [
      { id: 't-2', slug: 'sin-equipo', nombre: 'Sin Equipo', estado: 'active', dream_team_equipo_id: null, ediciones: null },
    ]
    const { client } = buildCatalogoClientMock(rows)
    const result = await loadCatalogoTalleres(client)
    expect(result[0]?.dream_team_equipo_id).toBeNull()
    expect(result[0]?.ediciones).toEqual([])
  })

  it('returns [] on a query error', async () => {
    const { client } = buildCatalogoClientMock(null, { message: 'boom' })
    const result = await loadCatalogoTalleres(client)
    expect(result).toEqual([])
  })
})

// ─── loadTallerDetalle ──────────────────────────────────────────────────

/** Thenable `.from(t).select(cols).eq(col, val).maybeSingle()` client mock. */
function buildTallerDetalleClientMock(
  row: unknown | null,
  error: unknown = null,
): { client: { from: jest.Mock }; eqCalls: Array<[string, string]>; selectCols: string[] } {
  const eqCalls: Array<[string, string]> = []
  const selectCols: string[] = []
  const from = jest.fn(() => {
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn((cols: string) => {
      selectCols.push(cols)
      return b
    })
    b['eq'] = jest.fn((col: string, val: string) => {
      eqCalls.push([col, val])
      return b
    })
    b['maybeSingle'] = jest.fn(() => Promise.resolve({ data: row, error }))
    return b
  })
  return { client: { from }, eqCalls, selectCols }
}

describe('loadTallerDetalle', () => {
  it('queries FROM talleres by slug with taller_ediciones nested, plus descripcion/modalidad_default', async () => {
    const { client, eqCalls, selectCols } = buildTallerDetalleClientMock(null)
    await loadTallerDetalle(client, 'matrimonio-sobre-la-roca')
    expect(client.from).toHaveBeenCalledWith('talleres')
    expect(eqCalls).toEqual([['slug', 'matrimonio-sobre-la-roca']])
    expect(selectCols[0]).toMatch(/taller_ediciones/)
    expect(selectCols[0]).toMatch(/descripcion/)
    expect(selectCols[0]).toMatch(/modalidad_default/)
    expect(selectCols[0]).toMatch(/cadencia_dias/)
    expect(selectCols[0]).toMatch(/duracion_minutos/)
    expect(selectCols[0]).toMatch(/clases_minimas_para_completar/)
  })

  it('maps the row with its nested ediciones, inscripciones counts, descripcion, modalidad_default, cadencia and duracion', async () => {
    const row = {
      id: 't-1',
      slug: 'matrimonio-sobre-la-roca',
      nombre: 'Matrimonio sobre la Roca',
      descripcion: 'Un taller de ejemplo.',
      modalidad_default: 'permanente_custom',
      estado: 'active',
      dream_team_equipo_id: 'eq-1',
      cadencia_dias: 14,
      duracion_minutos: 90,
      clases_minimas_para_completar: 6,
      ediciones: [
        {
          id: 'e-1',
          nombre_snapshot: 'Septiembre 2026',
          tipo: 'pareja',
          estado: 'abierto',
          inscripciones: [{ id: 'i-1' }],
        },
      ],
    }
    const { client } = buildTallerDetalleClientMock(row)
    const result = await loadTallerDetalle(client, 'matrimonio-sobre-la-roca')
    expect(result?.id).toBe('t-1')
    expect(result?.dream_team_equipo_id).toBe('eq-1')
    expect(result?.descripcion).toBe('Un taller de ejemplo.')
    expect(result?.modalidad_default).toBe('permanente_custom')
    expect(result?.cadencia_dias).toBe(14)
    expect(result?.duracion_minutos).toBe(90)
    expect(result?.clases_minimas_para_completar).toBe(6)
    expect(result?.ediciones).toHaveLength(1)
    expect(result?.ediciones[0]?.total_inscripciones).toBe(1)
  })

  it('defaults descripcion to null and cadencia_dias to 7 when missing', async () => {
    const row = {
      id: 't-2', slug: 'sin-descripcion', nombre: 'Sin Descripción', estado: 'active',
      dream_team_equipo_id: null, modalidad_default: 'periodo_general', ediciones: [],
    }
    const { client } = buildTallerDetalleClientMock(row)
    const result = await loadTallerDetalle(client, 'sin-descripcion')
    expect(result?.descripcion).toBeNull()
    expect(result?.cadencia_dias).toBe(7)
    expect(result?.duracion_minutos).toBeNull()
    expect(result?.clases_minimas_para_completar).toBeNull()
  })

  it('returns null when no taller matches the slug', async () => {
    const { client } = buildTallerDetalleClientMock(null)
    const result = await loadTallerDetalle(client, 'no-existe')
    expect(result).toBeNull()
  })

  it('returns null on a query error', async () => {
    const { client } = buildTallerDetalleClientMock(null, { message: 'boom' })
    const result = await loadTallerDetalle(client, 'matrimonio-sobre-la-roca')
    expect(result).toBeNull()
  })
})

// ─── loadMisGruposResumen ───────────────────────────────────────────────

function ctxWith(from: jest.Mock): OperacionalContext {
  return {
    supabase: { from },
    personaId: PERSONA_ID,
    role: 'L',
    capabilities: [],
  } as unknown as OperacionalContext
}

/** Thenable multi-table client mock keyed by table name. */
function buildLookupClientMock(byTable: Record<string, unknown[]>): jest.Mock {
  return jest.fn((table: string) => {
    const rows = byTable[table] ?? []
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn(() => b)
    b['in'] = jest.fn(() => b)
    Object.defineProperty(b, 'then', {
      value: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    })
    return b
  })
}

describe('loadMisGruposResumen', () => {
  beforeEach(() => {
    operacionalModule.loadEquipoGrupos.mockReset()
    operacionalModule.loadEquipoProximasSesiones.mockReset()
  })

  it('returns [] without any lookup query when the leader has no grupos', async () => {
    operacionalModule.loadEquipoGrupos.mockResolvedValue([])
    operacionalModule.loadEquipoProximasSesiones.mockResolvedValue([])
    const from = buildLookupClientMock({})

    const result = await loadMisGruposResumen(ctxWith(from))

    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('enriches each grupo with its taller/edición name and nearest upcoming class date', async () => {
    operacionalModule.loadEquipoGrupos.mockResolvedValue([
      { id: 'g-1', nombre: 'Grupo A', cohorte_id: 'c-1', capacidad: 10, estado: 'activo' },
    ])
    operacionalModule.loadEquipoProximasSesiones.mockResolvedValue([
      { id: 's-2', grupo_id: 'g-1', numero: 2, fecha_programada: '2026-10-15', fecha_realizada: null, estado: 'programada' },
      { id: 's-1', grupo_id: 'g-1', numero: 1, fecha_programada: '2026-10-01', fecha_realizada: null, estado: 'programada' },
    ])
    const from = buildLookupClientMock({
      talleres_crecimiento_cohortes: [{ id: 'c-1', taller_id: 'ed-1' }],
      taller_ediciones: [{ id: 'ed-1', nombre_snapshot: 'Octubre 2026', taller_id: 't-1' }],
      talleres: [{ id: 't-1', nombre: 'Matrimonio sobre la Roca' }],
    })

    const result = await loadMisGruposResumen(ctxWith(from))

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'g-1',
      nombre: 'Grupo A',
      estado: 'activo',
      tallerNombre: 'Matrimonio sobre la Roca',
      edicionNombre: 'Octubre 2026',
      // the EARLIEST of the two sesiones, not the first one returned.
      proximaClase: '2026-10-01',
    })
  })

  it('leaves names/proximaClase null when no matching lookup rows resolve', async () => {
    operacionalModule.loadEquipoGrupos.mockResolvedValue([
      { id: 'g-1', nombre: 'Grupo A', cohorte_id: 'c-orphan', capacidad: 10, estado: 'activo' },
    ])
    operacionalModule.loadEquipoProximasSesiones.mockResolvedValue([])
    const from = buildLookupClientMock({ talleres_crecimiento_cohortes: [] })

    const result = await loadMisGruposResumen(ctxWith(from))

    expect(result[0]?.tallerNombre).toBeNull()
    expect(result[0]?.edicionNombre).toBeNull()
    expect(result[0]?.proximaClase).toBeNull()
  })
})

// T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) —
// loadMisGruposCount backs the "Mis grupos" nav item's visibility
// (route-access.ts's getTalleresNavItems `hasMisGrupos` option): a
// lightweight head-count of ACTIVE taller_grupo_asignaciones rows for
// THIS persona as líder OR voluntario. Distinct from loadEquipoGrupos
// (líder only — the "Mis grupos" catalog SECTION's own loader), since the
// nav item's visibility condition is explicitly "líder/voluntario".
describe('loadMisGruposCount', () => {
  function countClientMock(count: number | null, error: unknown = null): jest.Mock {
    const chain: Record<string, unknown> = {}
    chain['select'] = jest.fn(() => chain)
    chain['eq'] = jest.fn(() => chain)
    chain['in'] = jest.fn(() => Promise.resolve({ count, error }))
    return jest.fn(() => chain)
  }

  it('returns the count of active líder/voluntario asignaciones for this persona', async () => {
    const from = countClientMock(3)
    const result = await loadMisGruposCount(ctxWith(from))
    expect(result).toBe(3)
    expect(from).toHaveBeenCalledWith('taller_grupo_asignaciones')
  })

  it('scopes the query by persona_id, activo=true, and rol in [lider, voluntario]', async () => {
    const from = countClientMock(1)
    await loadMisGruposCount(ctxWith(from))
    const chain = from.mock.results[0]?.value as Record<string, jest.Mock>
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(chain.eq).toHaveBeenCalledWith('persona_id', PERSONA_ID)
    expect(chain.eq).toHaveBeenCalledWith('activo', true)
    expect(chain.in).toHaveBeenCalledWith('rol', ['lider', 'voluntario'])
  })

  it('degrades to 0 on a query error (best-effort, same contract as the other loaders)', async () => {
    const from = countClientMock(null, { message: 'boom' })
    const result = await loadMisGruposCount(ctxWith(from))
    expect(result).toBe(0)
  })

  it('degrades to 0 when count comes back null without an error', async () => {
    const from = countClientMock(null)
    const result = await loadMisGruposCount(ctxWith(from))
    expect(result).toBe(0)
  })
})

// T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) —
// "Mis talleres" above the catalog list: the talleres the viewer can edit
// (talleres_mis_permisos(equipo).editar_taller), computed via the SAME
// batched helper (cargarPermisosPorEquipos) the pendientes inbox already
// uses for a cross-equipo list — one RPC per DISTINCT equipo, never one
// per taller.
describe('loadMisTalleres', () => {
  const TALLER_A: CatalogoTaller = {
    id: 't-1',
    slug: 'matrimonio-sobre-la-roca',
    nombre: 'Matrimonio sobre la Roca',
    estado: 'active',
    dream_team_equipo_id: 'eq-1',
    ediciones: [],
  }
  const TALLER_B: CatalogoTaller = {
    id: 't-2',
    slug: 'discipulado',
    nombre: 'Discipulado',
    estado: 'active',
    dream_team_equipo_id: 'eq-2',
    ediciones: [],
  }
  const TALLER_SIN_EQUIPO: CatalogoTaller = {
    id: 't-3',
    slug: 'sin-equipo',
    nombre: 'Sin equipo',
    estado: 'active',
    dream_team_equipo_id: null,
    ediciones: [],
  }

  beforeEach(() => {
    permisosModule.cargarPermisosPorEquipos.mockReset()
  })

  it('returns only the talleres where editarTaller is true, via one batched call', async () => {
    permisosModule.cargarPermisosPorEquipos.mockResolvedValue(
      new Map<string | null, PermisosTaller>([
        ['eq-1', { ...PERMISOS_TALLER_ALL_FALSE, editarTaller: true }],
        ['eq-2', PERMISOS_TALLER_ALL_FALSE],
      ]),
    )
    const client = {}

    const result = await loadMisTalleres(client, [TALLER_A, TALLER_B])

    expect(permisosModule.cargarPermisosPorEquipos).toHaveBeenCalledTimes(1)
    expect(permisosModule.cargarPermisosPorEquipos).toHaveBeenCalledWith(client, ['eq-1', 'eq-2'])
    expect(result).toEqual([{ id: 't-1', slug: 'matrimonio-sobre-la-roca', nombre: 'Matrimonio sobre la Roca' }])
  })

  it('returns [] when the catalog is empty, without calling the batched helper', async () => {
    const client = {}
    const result = await loadMisTalleres(client, [])
    expect(result).toEqual([])
    expect(permisosModule.cargarPermisosPorEquipos).not.toHaveBeenCalled()
  })

  it('never crashes on a taller with no dream_team_equipo_id — it just cannot satisfy editarTaller', async () => {
    permisosModule.cargarPermisosPorEquipos.mockResolvedValue(
      new Map<string | null, PermisosTaller>([[null, PERMISOS_TALLER_ALL_FALSE]]),
    )
    const client = {}

    const result = await loadMisTalleres(client, [TALLER_SIN_EQUIPO])

    expect(permisosModule.cargarPermisosPorEquipos).toHaveBeenCalledWith(client, [null])
    expect(result).toEqual([])
  })
})
