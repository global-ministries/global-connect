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
  idsDelArbol,
  idsAncestros,
  type EquipoArbolRaw,
} from '@/lib/platform/talleres/temporadas'

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

/** Thenable `.from(t).select(cols).order(col, opts).limit(n)` client mock. */
function buildListClientMock(
  rows: unknown[] | null,
  error: unknown = null,
): { client: { from: jest.Mock }; fromCalls: string[] } {
  const fromCalls: string[] = []
  const from = jest.fn((table: string) => {
    fromCalls.push(table)
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn(() => b)
    b['order'] = jest.fn(() => b)
    b['limit'] = jest.fn(() => Promise.resolve({ data: rows, error }))
    return b
  })
  return { client: { from }, fromCalls }
}

describe('loadTemporadas', () => {
  it('queries talleres_temporadas ordered by fecha_apertura desc', async () => {
    const { client, fromCalls } = buildListClientMock([])
    await loadTemporadas(client)
    expect(fromCalls).toEqual(['talleres_temporadas'])
  })

  it('returns the rows as-is when the query succeeds', async () => {
    const rows = [
      {
        id: 'temp-1',
        nombre: 'Otoño 2026',
        slug: 'otono-2026',
        estado: 'abierto',
        fecha_apertura: '2026-09-01T00:00:00.000Z',
        fecha_cierre: '2026-12-15T00:00:00.000Z',
      },
    ]
    const { client } = buildListClientMock(rows)
    const result = await loadTemporadas(client)
    expect(result).toEqual(rows)
  })

  it('returns [] when the query errors', async () => {
    const { client } = buildListClientMock(null, { message: 'boom' })
    const result = await loadTemporadas(client)
    expect(result).toEqual([])
  })

  it('returns [] when data is null without an error', async () => {
    const { client } = buildListClientMock(null)
    const result = await loadTemporadas(client)
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
  const talleresRows = [{ id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' }]
  const junctionRows = [{ taller_id: 't-1' }]
  const equiposDefault: EquipoArbolRaw[] = [{ id: 'equipo-1', parent_equipo_id: null }]

  function buildDetalleClientMock(opts: {
    temporada?: unknown | null
    temporadaError?: unknown
    equipos?: EquipoArbolRaw[]
    talleres?: unknown[] | null
    junction?: unknown[] | null
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
                            data: opts.talleres === undefined ? talleresRows : opts.talleres,
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
        if (table === 'talleres_temporada_talleres') {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: opts.junction === undefined ? junctionRows : opts.junction,
                  error: null,
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

  it("bundles the temporada, its tree's talleres, and the junction membership", async () => {
    const { client } = buildDetalleClientMock({})
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.temporada).toEqual(temporadaRow)
    expect(result?.talleres).toEqual(talleresRows)
    expect(result?.selectedTallerIds).toEqual(['t-1'])
  })

  it("filters talleres to the temporada's own tree (dream_team_equipo_id in its descendants)", async () => {
    const equipos: EquipoArbolRaw[] = [
      { id: 'equipo-1', parent_equipo_id: null },
      { id: 'equipo-1-hijo', parent_equipo_id: 'equipo-1' },
    ]
    const { client, inCalls } = buildDetalleClientMock({ equipos })
    await loadTemporadaDetalle(client, 'temp-1')
    expect(inCalls).toHaveLength(1)
    const [col, vals] = inCalls[0]
    expect(col).toBe('dream_team_equipo_id')
    expect(new Set(vals as string[])).toEqual(new Set(['equipo-1', 'equipo-1-hijo']))
  })

  it('returns an empty talleres/selectedTallerIds set when those queries return nothing', async () => {
    const { client } = buildDetalleClientMock({ talleres: null, junction: null })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleres).toEqual([])
    expect(result?.selectedTallerIds).toEqual([])
  })
})
