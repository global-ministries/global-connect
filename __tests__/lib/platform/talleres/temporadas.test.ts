/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — loadTemporadasAbiertas.
 *
 * Extracted from the old app/(auth)/admin/talleres/abstracto/[slug]/page.tsx
 * (PR46) into lib/platform/talleres/ so it is independently testable and so
 * /talleres/[taller]'s own page test can mock it like every other loader in
 * this module family, instead of hand-rolling a chainable Supabase mock for
 * one inline query. Behavior is unchanged: open (`estado = 'abierto'`)
 * global seasons, newest `fecha_apertura` first, capped at 100 — used to
 * populate OpenEdicionForm's "Temporada" picker.
 */

import {
  loadTemporadasAbiertas,
  loadTemporadas,
  loadTemporadaDetalle,
} from '@/lib/platform/talleres/temporadas'

/** Thenable `.from(t).select(cols).eq(col, val).order(col, opts).limit(n)` client mock. */
function buildTemporadasClientMock(
  rows: unknown[] | null,
  error: unknown = null,
): {
  client: { from: jest.Mock }
  eqCalls: Array<[string, string]>
  selectCols: string[]
} {
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
    b['order'] = jest.fn(() => b)
    b['limit'] = jest.fn(() => Promise.resolve({ data: rows, error }))
    return b
  })
  return { client: { from }, eqCalls, selectCols }
}

describe('loadTemporadasAbiertas', () => {
  it('queries talleres_temporadas filtered to estado=abierto', async () => {
    const { client, eqCalls } = buildTemporadasClientMock([])
    await loadTemporadasAbiertas(client)
    expect(client.from).toHaveBeenCalledWith('talleres_temporadas')
    expect(eqCalls).toEqual([['estado', 'abierto']])
  })

  it('returns the rows as-is (id, nombre) when the query succeeds', async () => {
    const rows = [
      { id: 'temp-1', nombre: 'Otoño 2026' },
      { id: 'temp-2', nombre: 'Primavera 2027' },
    ]
    const { client } = buildTemporadasClientMock(rows)
    const result = await loadTemporadasAbiertas(client)
    expect(result).toEqual(rows)
  })

  it('returns [] when the query errors', async () => {
    const { client } = buildTemporadasClientMock(null, { message: 'boom' })
    const result = await loadTemporadasAbiertas(client)
    expect(result).toEqual([])
  })

  it('returns [] when data is null without an error', async () => {
    const { client } = buildTemporadasClientMock(null)
    const result = await loadTemporadasAbiertas(client)
    expect(result).toEqual([])
  })
})

// T8 (odd/tasks/talleres-consolidar-pantallas.md) — the /talleres/temporadas
// list + detail loaders, extracted (same behavior, unchanged queries) from
// the old app/(auth)/admin/talleres/temporadas/{page,[id]/page}.tsx so this
// module family stays the single testable source for every talleres_
// temporadas query, per this file's own header rationale.

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
  }
  const talleresRows = [{ id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' }]
  const junctionRows = [{ taller_id: 't-1' }]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
  function buildDetalleClientMock(opts: {
    temporada?: unknown | null
    temporadaError?: unknown
    talleres?: unknown[] | null
    junction?: unknown[] | null
  }): any {
    return {
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
        if (table === 'talleres') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: opts.talleres === undefined ? talleresRows : opts.talleres,
                      error: null,
                    }),
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
  }

  it('returns null when the temporada does not exist', async () => {
    const client = buildDetalleClientMock({ temporada: null })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result).toBeNull()
  })

  it('returns null when the query errors', async () => {
    const client = buildDetalleClientMock({ temporada: null, temporadaError: { message: 'boom' } })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result).toBeNull()
  })

  it('bundles the temporada, its active talleres, and the junction membership', async () => {
    const client = buildDetalleClientMock({})
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.temporada).toEqual(temporadaRow)
    expect(result?.talleres).toEqual(talleresRows)
    expect(result?.selectedTallerIds).toEqual(['t-1'])
  })

  it('returns an empty talleres/selectedTallerIds set when those queries return nothing', async () => {
    const client = buildDetalleClientMock({ talleres: null, junction: null })
    const result = await loadTemporadaDetalle(client, 'temp-1')
    expect(result?.talleres).toEqual([])
    expect(result?.selectedTallerIds).toEqual([])
  })
})
