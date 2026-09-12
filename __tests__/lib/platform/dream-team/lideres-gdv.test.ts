/**
 * `fetchLideresGdv` — read-only projection of Grupos de Vida leaders/co-leaders
 * as Dream Team "servers", via the `dream_team_lideres_gdv()` RPC (see
 * supabase/migrations/20260911140000_dream_team_estructura_gdv.sql).
 *
 * The RPC already applies the tree authority check server-side and takes no
 * arguments — a caller without authority over the Grupos de Vida node gets
 * zero rows back, not an error. One row per person AND GROUP: `equipo_id` is
 * the id of the group they lead, a virtual node from
 * `dream_team_estructura_gdv()` — someone leading two groups comes back as
 * two rows, one per group.
 */
import { fetchLideresGdv } from '@/lib/platform/dream-team/lideres-gdv'
import { personaId } from '@/lib/platform/dream-team/types'

interface FakeRow {
  readonly persona_id: string
  readonly equipo_id: string
  readonly rol: string
  readonly desde: string
}

function makeClient(rows: readonly FakeRow[], error: { message: string } | null = null) {
  const rpcMock = jest.fn().mockResolvedValue({ data: rows, error })
  return { client: { rpc: rpcMock } as never, rpcMock }
}

describe('fetchLideresGdv', () => {
  it('calls the scoped RPC with no arguments', async () => {
    const { client, rpcMock } = makeClient([])
    await fetchLideresGdv(client)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('dream_team_lideres_gdv')
  })

  it('maps snake_case rows to DreamTeamLiderGdv', async () => {
    const { client } = makeClient([
      { persona_id: 'p-1', equipo_id: 'grupo-a', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
      { persona_id: 'p-2', equipo_id: 'grupo-b', rol: 'colider', desde: '2026-02-01T00:00:00.000Z' },
    ])

    const result = await fetchLideresGdv(client)

    expect(result).toEqual([
      { personaId: personaId('p-1'), equipoId: 'grupo-a', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
      { personaId: personaId('p-2'), equipoId: 'grupo-b', rol: 'colider', desde: '2026-02-01T00:00:00.000Z' },
    ])
    // The old shape carried a `grupos` count column — the migration dropped
    // it (one row per person AND group now). `toEqual` treats an
    // undefined-valued extra key as a match, so this asserts the key itself
    // is gone, not just that its value happens to be undefined.
    expect(result[0]).not.toHaveProperty('grupos')
  })

  it('keeps one row per person AND GROUP — a leader of two groups comes back twice', async () => {
    const { client } = makeClient([
      { persona_id: 'p-1', equipo_id: 'grupo-a', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
      { persona_id: 'p-1', equipo_id: 'grupo-b', rol: 'lider', desde: '2026-02-01T00:00:00.000Z' },
    ])

    const result = await fetchLideresGdv(client)

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.equipoId).sort()).toEqual(['grupo-a', 'grupo-b'])
    expect(result.every((r) => r.personaId === personaId('p-1'))).toBe(true)
  })

  it("ignores rows whose rol is neither 'lider' nor 'colider'", async () => {
    const { client } = makeClient([
      { persona_id: 'p-1', equipo_id: 'grupo-a', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
      { persona_id: 'p-2', equipo_id: 'grupo-a', rol: 'voluntario', desde: '2026-01-01T00:00:00.000Z' },
    ])

    const result = await fetchLideresGdv(client)

    expect(result).toHaveLength(1)
    expect(result[0].personaId).toBe(personaId('p-1'))
  })

  it('returns an empty array when the RPC returns no rows', async () => {
    const { client } = makeClient([])
    const result = await fetchLideresGdv(client)
    expect(result).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    const { client } = makeClient([], { message: 'boom' })
    await expect(fetchLideresGdv(client)).rejects.toBeTruthy()
  })
})
