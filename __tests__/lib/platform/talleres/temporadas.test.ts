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

import { loadTemporadasAbiertas } from '@/lib/platform/talleres/temporadas'

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
