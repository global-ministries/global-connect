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
 */

import { loadReportes } from '@/lib/platform/talleres/reportes'
import type { CoordReporte } from '@/lib/platform/talleres/operacional'

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadCoordReportes: jest.fn(),
}))

const loadCoordReportesMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadCoordReportes as jest.Mock

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
  loadCoordReportesMock.mockReset()
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
})
