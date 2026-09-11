/**
 * `fetchLideresGdv` — read-only projection of Grupos de Vida leaders/co-leaders
 * as Dream Team "servers", via the `dream_team_lideres_gdv()` RPC (see
 * supabase/migrations/20260911120000_dream_team_lideres_gdv.sql).
 *
 * The RPC already applies the tree authority check server-side and takes no
 * arguments — a caller without authority over the Grupos de Vida node gets
 * zero rows back, not an error.
 */
import { fetchLideresGdv } from '@/lib/platform/dream-team/lideres-gdv'
import { personaId } from '@/lib/platform/dream-team/types'

interface FakeRow {
  readonly persona_id: string
  readonly equipo_id: string
  readonly rol: string
  readonly grupos: number
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
      { persona_id: 'p-1', equipo_id: 'equipo-gdv', rol: 'lider', grupos: 2, desde: '2026-01-01T00:00:00.000Z' },
      { persona_id: 'p-2', equipo_id: 'equipo-gdv', rol: 'colider', grupos: 1, desde: '2026-02-01T00:00:00.000Z' },
    ])

    const result = await fetchLideresGdv(client)

    expect(result).toEqual([
      { personaId: personaId('p-1'), equipoId: 'equipo-gdv', rol: 'lider', grupos: 2, desde: '2026-01-01T00:00:00.000Z' },
      { personaId: personaId('p-2'), equipoId: 'equipo-gdv', rol: 'colider', grupos: 1, desde: '2026-02-01T00:00:00.000Z' },
    ])
  })

  it("ignores rows whose rol is neither 'lider' nor 'colider'", async () => {
    const { client } = makeClient([
      { persona_id: 'p-1', equipo_id: 'equipo-gdv', rol: 'lider', grupos: 1, desde: '2026-01-01T00:00:00.000Z' },
      { persona_id: 'p-2', equipo_id: 'equipo-gdv', rol: 'voluntario', grupos: 1, desde: '2026-01-01T00:00:00.000Z' },
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
