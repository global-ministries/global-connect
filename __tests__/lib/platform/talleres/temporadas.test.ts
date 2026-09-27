/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — loadTemporadasAbiertas.
 *
 * T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN for
 * the tree-scoped rewrite: talleres_temporadas is now owned by a Dream Team
 * node and its RLS is scoped by that node's own tree (supabase/migrations/
 * 20260928120000_talleres_temporadas_por_direccion.sql), so
 * loadTemporadasAbiertas now takes the CALLING TALLER's id and filters to
 * its ancestry, and loadTemporadaDetalle now offers only talleres of the
 * temporada's own tree with regimen='temporada'. Covers the new pure
 * `idsDelArbol`/`idsAncestros` tree helpers directly, plus the loaders that
 * use them.
 */

import {
  loadTemporadasAbiertas,
  loadTemporadas,
  loadTemporadaDetalle,
  loadDireccionesConTalleres,
  loadTalleresDeDireccion,
  raicesConTalleres,
  idsDelArbol,
  idsAncestros,
  type EquipoArbolRaw,
  type EquipoRaizRaw,
} from '@/lib/platform/talleres/temporadas'
import { PERMISOS_TALLER_ALL_FALSE } from '@/lib/platform/talleres/permisos'

jest.mock('@/lib/platform/talleres/permisos', () => ({
  cargarPermisos: jest.fn(),
  PERMISOS_TALLER_ALL_FALSE: {
    ver: false,
    editarTaller: false,
    abrirEdicion: false,
    editarEdicion: false,
    gestionarGrupos: false,
    aprobarInscripciones: false,
    resolverRetiros: false,
    asignarEquipo: false,
    verReportes: false,
    verMetricas: false,
  },
}))

const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisos as jest.Mock

// ─── idsDelArbol / idsAncestros (pure) ──────────────────────────────────────

describe('idsDelArbol', () => {
  const equipos: EquipoArbolRaw[] = [
    { id: 'root', parent_equipo_id: null },
    { id: 'child', parent_equipo_id: 'root' },
    { id: 'grandchild', parent_equipo_id: 'child' },
    { id: 'unrelated', parent_equipo_id: null },
  ]

  it('includes the root itself plus every descendant', () => {
    const ids = idsDelArbol(equipos, 'root')
    expect(ids).toEqual(new Set(['root', 'child', 'grandchild']))
  })

  it('a leaf with no children returns just itself', () => {
    const ids = idsDelArbol(equipos, 'grandchild')
    expect(ids).toEqual(new Set(['grandchild']))
  })

  it('never includes an unrelated branch', () => {
    const ids = idsDelArbol(equipos, 'root')
    expect(ids.has('unrelated')).toBe(false)
  })

  it('does not loop forever on a cyclic input', () => {
    const cyclic: EquipoArbolRaw[] = [
      { id: 'a', parent_equipo_id: 'b' },
      { id: 'b', parent_equipo_id: 'a' },
    ]
    const ids = idsDelArbol(cyclic, 'a')
    expect(ids).toEqual(new Set(['a', 'b']))
  })
})

describe('idsAncestros', () => {
  const equipos: EquipoArbolRaw[] = [
    { id: 'root', parent_equipo_id: null },
    { id: 'child', parent_equipo_id: 'root' },
    { id: 'grandchild', parent_equipo_id: 'child' },
  ]

  it('includes the leaf itself plus every ancestor up to the root', () => {
    const ids = idsAncestros(equipos, 'grandchild')
    expect(ids).toEqual(new Set(['grandchild', 'child', 'root']))
  })

  it('a root with no parent returns just itself', () => {
    const ids = idsAncestros(equipos, 'root')
    expect(ids).toEqual(new Set(['root']))
  })

  it('an id missing from the snapshot returns just itself', () => {
    const ids = idsAncestros(equipos, 'missing')
    expect(ids).toEqual(new Set(['missing']))
  })

  it('does not loop forever on a cyclic input', () => {
    const cyclic: EquipoArbolRaw[] = [
      { id: 'a', parent_equipo_id: 'b' },
      { id: 'b', parent_equipo_id: 'a' },
    ]
    const ids = idsAncestros(cyclic, 'a')
    expect(ids).toEqual(new Set(['a', 'b']))
  })
})

// ─── loadTemporadasAbiertas ─────────────────────────────────────────────────

/**
 * Thenable client mock: `.from('talleres').select().eq().maybeSingle()` ->
 * the taller's equipo; `.from('dream_team_equipos').select()` -> the flat
 * snapshot; `.from('talleres_temporadas').select().eq().in().order().limit()`
 * -> the open seasons in that ancestry.
 */
function buildAbiertasClientMock(opts: {
  tallerEquipoId?: string | null
  equipos?: EquipoArbolRaw[]
  temporadas?: unknown[] | null
  temporadasError?: unknown
}): { client: { from: jest.Mock }; inCalls: unknown[][] } {
  const inCalls: unknown[][] = []
  const equipos = opts.equipos ?? [{ id: 'equipo-1', parent_equipo_id: null }]
  const tallerEquipoId = opts.tallerEquipoId === undefined ? 'equipo-1' : opts.tallerEquipoId

  const from = jest.fn((table: string) => {
    if (table === 'talleres') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { dream_team_equipo_id: tallerEquipoId }, error: null }),
          }),
        }),
      }
    }
    if (table === 'dream_team_equipos') {
      return { select: () => Promise.resolve({ data: equipos, error: null }) }
    }
    if (table === 'talleres_temporadas') {
      return {
        select: () => ({
          eq: () => ({
            in: (col: string, vals: unknown) => {
              inCalls.push([col, vals])
              return {
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: opts.temporadas === undefined ? [] : opts.temporadas,
                      error: opts.temporadasError ?? null,
                    }),
                }),
              }
            },
          }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  return { client: { from }, inCalls }
}

describe('loadTemporadasAbiertas', () => {
  it('returns [] when the taller has no dream_team_equipo_id', async () => {
    const { client } = buildAbiertasClientMock({ tallerEquipoId: null })
    const result = await loadTemporadasAbiertas(client, 't-1')
    expect(result).toEqual([])
  })

  it("filters talleres_temporadas to the taller's own ancestry", async () => {
    const equipos: EquipoArbolRaw[] = [
      { id: 'root', parent_equipo_id: null },
      { id: 'child', parent_equipo_id: 'root' },
    ]
    const { client, inCalls } = buildAbiertasClientMock({ tallerEquipoId: 'child', equipos })
    await loadTemporadasAbiertas(client, 't-1')
    expect(inCalls).toHaveLength(1)
    const [col, vals] = inCalls[0]
    expect(col).toBe('dream_team_equipo_id')
    expect(new Set(vals as string[])).toEqual(new Set(['child', 'root']))
  })

  it('returns the rows as-is (id, nombre, fecha_apertura) when the query succeeds', async () => {
    const rows = [
      { id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' },
      { id: 'temp-2', nombre: 'Primavera 2027', fecha_apertura: '2027-03-01' },
    ]
    const { client } = buildAbiertasClientMock({ temporadas: rows })
    const result = await loadTemporadasAbiertas(client, 't-1')
    expect(result).toEqual(rows)
  })

  it('returns [] when the query errors', async () => {
    const { client } = buildAbiertasClientMock({ temporadas: null, temporadasError: { message: 'boom' } })
    const result = await loadTemporadasAbiertas(client, 't-1')
    expect(result).toEqual([])
  })

  it('returns [] when data is null without an error', async () => {
    const { client } = buildAbiertasClientMock({ temporadas: null })
    const result = await loadTemporadasAbiertas(client, 't-1')
    expect(result).toEqual([])
  })
})

// T8 (odd/tasks/talleres-consolidar-pantallas.md) — the /talleres/temporadas
// list + detail loaders ──────────────────────────────────────────────────

/**
 * Thenable `.from(t)...` client mock for `loadTemporadas`: the base list
 * query (`select().order().limit()`), plus the two T5 count queries
 * (`talleres_temporada_talleres` and `taller_ediciones`, both
 * `select().in(...)`, the second chaining `.neq(...)` too).
 */
function buildListClientMock(opts: {
  rows?: unknown[] | null
  error?: unknown
  junction?: unknown[]
  ediciones?: unknown[]
}): { client: { from: jest.Mock }; fromCalls: string[] } {
  const fromCalls: string[] = []
  const from = jest.fn((table: string) => {
    fromCalls.push(table)
    if (table === 'talleres_temporadas') {
      return {
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: opts.rows ?? null, error: opts.error ?? null }),
          }),
        }),
      }
    }
    if (table === 'talleres_temporada_talleres') {
      return { select: () => ({ in: () => Promise.resolve({ data: opts.junction ?? [], error: null }) }) }
    }
    if (table === 'taller_ediciones') {
      return {
        select: () => ({
          in: () => ({ neq: () => Promise.resolve({ data: opts.ediciones ?? [], error: null }) }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  return { client: { from }, fromCalls }
}

describe('loadTemporadas', () => {
  const baseRow = {
    id: 'temp-1',
    nombre: 'Otoño 2026',
    slug: 'otono-2026',
    estado: 'abierto',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
    dream_team_equipo_id: 'equipo-1',
  }

  it('queries talleres_temporadas ordered by fecha_apertura desc, then skips the count queries when empty', async () => {
    const { client, fromCalls } = buildListClientMock({ rows: [] })
    const result = await loadTemporadas(client)
    expect(fromCalls).toEqual(['talleres_temporadas'])
    expect(result).toEqual([])
  })

  it('returns [] when the query errors', async () => {
    const { client } = buildListClientMock({ rows: null, error: { message: 'boom' } })
    const result = await loadTemporadas(client)
    expect(result).toEqual([])
  })

  it('returns [] when data is null without an error', async () => {
    const { client } = buildListClientMock({ rows: null })
    const result = await loadTemporadas(client)
    expect(result).toEqual([])
  })

  it('attaches tallerCount (junction rows) and edicionCount (non-cancelled ediciones) per temporada', async () => {
    const { client, fromCalls } = buildListClientMock({
      rows: [baseRow],
      junction: [{ temporada_id: 'temp-1' }, { temporada_id: 'temp-1' }, { temporada_id: 'temp-1' }],
      ediciones: [{ temporada_id: 'temp-1' }, { temporada_id: 'temp-1' }],
    })
    const result = await loadTemporadas(client)
    expect(fromCalls).toEqual(['talleres_temporadas', 'talleres_temporada_talleres', 'taller_ediciones'])
    expect(result).toEqual([{ ...baseRow, tallerCount: 3, edicionCount: 2 }])
  })

  it('defaults both counts to 0 for a temporada with no junction rows or ediciones', async () => {
    const { client } = buildListClientMock({ rows: [baseRow], junction: [], ediciones: [] })
    const result = await loadTemporadas(client)
    expect(result).toEqual([{ ...baseRow, tallerCount: 0, edicionCount: 0 }])
  })

  it('keeps counts per-temporada distinct across multiple rows', async () => {
    const otherRow = { ...baseRow, id: 'temp-2', dream_team_equipo_id: 'equipo-2' }
    const { client } = buildListClientMock({
      rows: [baseRow, otherRow],
      junction: [{ temporada_id: 'temp-1' }, { temporada_id: 'temp-2' }, { temporada_id: 'temp-2' }],
      ediciones: [{ temporada_id: 'temp-2' }],
    })
    const result = await loadTemporadas(client)
    expect(result).toEqual([
      { ...baseRow, tallerCount: 1, edicionCount: 0 },
      { ...otherRow, tallerCount: 2, edicionCount: 1 },
    ])
  })
})

// ─── T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — dirección
// discovery for the list's grouping + "Crear Temporada" CTA gate, and the
// "Crear temporada" form's own per-dirección taller checklist ────────────

describe('raicesConTalleres (pure)', () => {
  const equipos: EquipoRaizRaw[] = [
    { id: 'root-1', parent_equipo_id: null, label: 'Dirección de Conexión', activo: true },
    { id: 'root-1-hijo', parent_equipo_id: 'root-1', label: 'Grupos de Corto Plazo', activo: true },
    { id: 'root-2', parent_equipo_id: null, label: 'Dirección de Experiencia', activo: true },
    { id: 'root-3-inactivo', parent_equipo_id: null, label: 'Dirección Archivada', activo: false },
  ]

  it('includes a root whose own tree has a taller directly on it', () => {
    const raices = raicesConTalleres(equipos, new Set(['root-1']))
    expect(raices.map((r) => r.id)).toEqual(['root-1'])
  })

  it('includes a root whose tree has a taller on a DESCENDANT node', () => {
    const raices = raicesConTalleres(equipos, new Set(['root-1-hijo']))
    expect(raices.map((r) => r.id)).toEqual(['root-1'])
  })

  it('excludes a root with zero talleres anywhere in its tree', () => {
    const raices = raicesConTalleres(equipos, new Set(['root-1']))
    expect(raices.map((r) => r.id)).not.toContain('root-2')
  })

  it('excludes an inactive root even with a taller on it', () => {
    const raices = raicesConTalleres(equipos, new Set(['root-3-inactivo']))
    expect(raices).toEqual([])
  })

  it('never includes a non-root node, even with a taller directly on it', () => {
    const raices = raicesConTalleres(equipos, new Set(['root-1-hijo']))
    expect(raices.map((r) => r.id)).not.toContain('root-1-hijo')
  })
})

describe('loadDireccionesConTalleres', () => {
  function buildClientMock(opts: {
    equipos?: EquipoRaizRaw[]
    talleres?: Array<{ dream_team_equipo_id: string | null }>
  }): { from: jest.Mock } {
    return {
      from: jest.fn((table: string) => {
        if (table === 'dream_team_equipos') {
          return { select: () => Promise.resolve({ data: opts.equipos ?? [], error: null }) }
        }
        if (table === 'talleres') {
          return {
            select: () => ({
              not: () => Promise.resolve({ data: opts.talleres ?? [], error: null }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    }
  }

  beforeEach(() => {
    cargarPermisosMock.mockReset()
  })

  it('returns only root nodes with >=1 taller in their tree, sorted by label', async () => {
    const equipos: EquipoRaizRaw[] = [
      { id: 'root-experiencia', parent_equipo_id: null, label: 'Dirección de Experiencia', activo: true },
      { id: 'root-conexion', parent_equipo_id: null, label: 'Dirección de Conexión', activo: true },
    ]
    const client = buildClientMock({
      equipos,
      talleres: [{ dream_team_equipo_id: 'root-conexion' }],
    })
    cargarPermisosMock.mockResolvedValue(PERMISOS_TALLER_ALL_FALSE)

    const result = await loadDireccionesConTalleres(client)
    expect(result.map((d) => d.id)).toEqual(['root-conexion'])
    expect(result[0]!.label).toBe('Dirección de Conexión')
  })

  it('carries puedeEditar from cargarPermisos(client, raiz.id).editarTaller', async () => {
    const equipos: EquipoRaizRaw[] = [
      { id: 'root-conexion', parent_equipo_id: null, label: 'Dirección de Conexión', activo: true },
    ]
    const client = buildClientMock({ equipos, talleres: [{ dream_team_equipo_id: 'root-conexion' }] })
    cargarPermisosMock.mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, editarTaller: true })

    const result = await loadDireccionesConTalleres(client)
    expect(cargarPermisosMock).toHaveBeenCalledWith(client, 'root-conexion')
    expect(result[0]!.puedeEditar).toBe(true)
  })

  it('returns [] when no root has any taller', async () => {
    const equipos: EquipoRaizRaw[] = [
      { id: 'root-1', parent_equipo_id: null, label: 'Dirección de Conexión', activo: true },
    ]
    const client = buildClientMock({ equipos, talleres: [] })
    const result = await loadDireccionesConTalleres(client)
    expect(result).toEqual([])
    expect(cargarPermisosMock).not.toHaveBeenCalled()
  })
})

describe('loadTalleresDeDireccion', () => {
  function buildClientMock(opts: {
    equipos?: Array<{ id: string; label: string; parent_equipo_id: string | null }>
    talleres?: Array<{
      id: string
      nombre: string
      regimen: 'temporada' | 'cadencia'
      dream_team_equipo_id: string | null
    }>
  }): { from: jest.Mock } {
    return {
      from: jest.fn((table: string) => {
        if (table === 'dream_team_equipos') {
          return { select: () => Promise.resolve({ data: opts.equipos ?? [], error: null }) }
        }
        if (table === 'talleres') {
          return { select: () => ({ eq: () => Promise.resolve({ data: opts.talleres ?? [], error: null }) }) }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    }
  }

  it("returns every ACTIVE taller of the dirección's own tree, both régimen, with its own node label", async () => {
    const equipos = [
      { id: 'root-1', label: 'Dirección de Conexión', parent_equipo_id: null },
      { id: 'root-1-hijo', label: 'Punto de Partida (equipo)', parent_equipo_id: 'root-1' },
    ]
    const talleres = [
      { id: 't-temporada', nombre: 'Parejas', regimen: 'temporada' as const, dream_team_equipo_id: 'root-1' },
      {
        id: 't-cadencia',
        nombre: 'Próximo Paso',
        regimen: 'cadencia' as const,
        dream_team_equipo_id: 'root-1-hijo',
      },
      { id: 't-fuera', nombre: 'De otra dirección', regimen: 'temporada' as const, dream_team_equipo_id: 'root-2' },
    ]
    const client = buildClientMock({ equipos, talleres })

    const result = await loadTalleresDeDireccion(client, 'root-1')
    expect(result).toEqual([
      { id: 't-temporada', nombre: 'Parejas', nodoLabel: 'Dirección de Conexión', regimen: 'temporada' },
      { id: 't-cadencia', nombre: 'Próximo Paso', nodoLabel: 'Punto de Partida (equipo)', regimen: 'cadencia' },
    ])
  })

  it('returns [] when the dirección has no talleres', async () => {
    const client = buildClientMock({
      equipos: [{ id: 'root-1', label: 'Dirección de Conexión', parent_equipo_id: null }],
      talleres: [],
    })
    const result = await loadTalleresDeDireccion(client, 'root-1')
    expect(result).toEqual([])
  })
})

describe('loadTemporadaDetalle', () => {
  const temporadaRow = {
    id: 'temp-1',
    nombre: 'Otoño 2026',
    slug: 'otono-2026',
    descripcion: 'Talleres de otoño',
    estado: 'borrador',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
    dream_team_equipo_id: 'equipo-1',
  }
  const equiposDefault = [{ id: 'equipo-1', label: 'Dirección de Conexión', parent_equipo_id: null }]
  const talleresArbolDefault = [{ id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' }]
  const edicionRowDefault = {
    id: 'ed-1',
    nombre_snapshot: 'Otoño 2026',
    estado: 'abierto',
    fecha_inicio: '2026-09-01',
    fecha_fin: '2026-10-15',
    taller_id: 't-1',
    taller: { id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' },
    inscripciones: [{ id: 'i-1' }, { id: 'i-2' }],
  }

  function buildDetalleClientMock(opts: {
    temporada?: unknown | null
    temporadaError?: unknown
    equipos?: Array<{ id: string; label: string; parent_equipo_id: string | null }>
    talleresArbol?: unknown[] | null
    ediciones?: unknown[] | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
  }): { client: any; inCalls: unknown[][] } {
    const inCalls: unknown[][] = []
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'talleres_temporadas') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: opts.temporada === undefined ? temporadaRow : opts.temporada,
                    error: opts.temporadaError ?? null,
                  }),
              }),
            }),
          }
        }
        if (table === 'dream_team_equipos') {
          return { select: () => Promise.resolve({ data: opts.equipos ?? equiposDefault, error: null }) }
        }
        if (table === 'talleres') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: (col: string, vals: unknown) => {
                    inCalls.push([col, vals])
                    return {
                      order: () => ({
                        limit: () =>
                          Promise.resolve({
                            data: opts.talleresArbol === undefined ? talleresArbolDefault : opts.talleresArbol,
                            error: null,
                          }),
                      }),
                    }
                  },
                }),
              }),
            }),
          }
        }
        if (table === 'taller_ediciones') {
          return {
            select: () => ({
              eq: () => ({
                neq: () =>
                  Promise.resolve({
                    data: opts.ediciones === undefined ? [edicionRowDefault] : opts.ediciones,
                    error: null,
                  }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    }
    return { client, inCalls }
  }

  it('returns null when the temporada does not exist', async () => {
    const { client } = buildDetalleClientMock({ temporada: null })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result).toBeNull()
  })

  it('returns null when the query errors', async () => {
    const { client } = buildDetalleClientMock({ temporada: null, temporadaError: { message: 'boom' } })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result).toBeNull()
  })

  it('resolves direccionLabel from the temporada own dream_team_equipo_id', async () => {
    const { client } = buildDetalleClientMock({})
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.direccionLabel).toBe('Dirección de Conexión')
  })

  it('maps each non-cancelled edición row into talleresEnTemporada, with its inscripciones count', async () => {
    const { client } = buildDetalleClientMock({})
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleresEnTemporada).toEqual([
      {
        id: 't-1',
        nombre: 'Matrimonio',
        slug: 'matrimonio',
        edicion: {
          id: 'ed-1',
          nombre_snapshot: 'Otoño 2026',
          estado: 'abierto',
          fecha_inicio: '2026-09-01',
          fecha_fin: '2026-10-15',
          total_inscripciones: 2,
        },
      },
    ])
  })

  it('excludes a taller already in talleresEnTemporada from talleresDisponibles', async () => {
    const { client } = buildDetalleClientMock({
      talleresArbol: [
        { id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' },
        { id: 't-2', nombre: 'Parejas', slug: 'parejas' },
      ],
    })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleresDisponibles).toEqual([{ id: 't-2', nombre: 'Parejas', slug: 'parejas' }])
  })

  it("filters candidatos to the temporada's own tree (dream_team_equipo_id in its descendants)", async () => {
    const equipos = [
      { id: 'equipo-1', label: 'Dirección de Conexión', parent_equipo_id: null },
      { id: 'equipo-1-hijo', label: 'Grupos de Corto Plazo', parent_equipo_id: 'equipo-1' },
    ]
    const { client, inCalls } = buildDetalleClientMock({ equipos })
    await loadTemporadaDetalle(client, 'temp-1')
    expect(inCalls).toHaveLength(1)
    const [col, vals] = inCalls[0]
    expect(col).toBe('dream_team_equipo_id')
    expect(new Set(vals as string[])).toEqual(new Set(['equipo-1', 'equipo-1-hijo']))
  })

  it('returns empty talleresEnTemporada/talleresDisponibles when those queries return nothing', async () => {
    const { client } = buildDetalleClientMock({ talleresArbol: null, ediciones: null })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleresEnTemporada).toEqual([])
    expect(result?.talleresDisponibles).toEqual([])
  })

  it('falls back to the edición own nombre_snapshot/empty slug when the taller join is null', async () => {
    const { client } = buildDetalleClientMock({
      ediciones: [{ ...edicionRowDefault, taller: null }],
    })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleresEnTemporada[0]).toMatchObject({ id: 't-1', nombre: 'Otoño 2026', slug: '' })
  })
})
