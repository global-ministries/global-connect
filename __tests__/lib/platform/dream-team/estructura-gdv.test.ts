/**
 * `fetchEstructuraGdv` — read-only projection of the Grupos de Vida real
 * hierarchy (Dirección → Segmentos → Grupos vigentes) with each branch's
 * responsables, via the `dream_team_estructura_gdv()` RPC (see
 * supabase/migrations/20260911140000_dream_team_estructura_gdv.sql).
 *
 * Same shape of contract as lideres-gdv.ts: the RPC applies its own tree
 * authority check server-side and takes no arguments — a caller without
 * authority over the Grupos de Vida node gets zero rows back, not an error.
 * A row whose `tipo` is unrecognized, or a responsable whose `rol` is
 * unrecognized, is dropped defensively rather than trusted blindly from an
 * untyped RPC response.
 */
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { personaId } from '@/lib/platform/dream-team/types'

interface FakeResponsableRow {
  readonly persona_id: string
  readonly nombre: string
  readonly rol: string
}

interface FakeRow {
  readonly nodo_id: string
  readonly parent_id: string | null
  readonly tipo: string
  readonly label: string
  readonly responsables: readonly FakeResponsableRow[]
}

function makeClient(rows: readonly FakeRow[], error: { message: string } | null = null) {
  const rpcMock = jest.fn().mockResolvedValue({ data: rows, error })
  return { client: { rpc: rpcMock } as never, rpcMock }
}

describe('fetchEstructuraGdv', () => {
  it('calls the scoped RPC with no arguments', async () => {
    const { client, rpcMock } = makeClient([])
    await fetchEstructuraGdv(client)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('dream_team_estructura_gdv')
  })

  it('maps the direccion row — parent_id null, its director generales as responsables', async () => {
    const { client } = makeClient([
      {
        nodo_id: 'gdv-root',
        parent_id: null,
        tipo: 'direccion',
        label: 'Dirección de Grupos de Vida',
        responsables: [{ persona_id: 'p-1', nombre: 'Ana Pérez', rol: 'director_general' }],
      },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result).toEqual([
      {
        nodoId: 'gdv-root',
        parentId: null,
        tipo: 'direccion',
        label: 'Dirección de Grupos de Vida',
        responsables: [{ personaId: personaId('p-1'), nombre: 'Ana Pérez', rol: 'director_general' }],
      },
    ])
  })

  it('maps a segmento row hanging off the direccion node, with mixed responsable roles', async () => {
    const { client } = makeClient([
      {
        nodo_id: 'segmento-1',
        parent_id: 'gdv-root',
        tipo: 'segmento',
        label: 'Matrimonios',
        responsables: [
          { persona_id: 'p-1', nombre: 'Ana Pérez', rol: 'director_general' },
          { persona_id: 'p-2', nombre: 'Luis Gómez', rol: 'director_etapa' },
        ],
      },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result[0].tipo).toBe('segmento')
    expect(result[0].parentId).toBe('gdv-root')
    expect(result[0].responsables.map((r) => r.rol)).toEqual(['director_general', 'director_etapa'])
  })

  it('maps a grupo row hanging off its segmento, with líder/colíder responsables', async () => {
    const { client } = makeClient([
      {
        nodo_id: 'grupo-1',
        parent_id: 'segmento-1',
        tipo: 'grupo',
        label: 'Barquisimeto Matrimonios 1',
        responsables: [
          { persona_id: 'p-3', nombre: 'Marta Ruiz', rol: 'lider' },
          { persona_id: 'p-4', nombre: 'Pedro Díaz', rol: 'colider' },
        ],
      },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result[0]).toEqual({
      nodoId: 'grupo-1',
      parentId: 'segmento-1',
      tipo: 'grupo',
      label: 'Barquisimeto Matrimonios 1',
      responsables: [
        { personaId: personaId('p-3'), nombre: 'Marta Ruiz', rol: 'lider' },
        { personaId: personaId('p-4'), nombre: 'Pedro Díaz', rol: 'colider' },
      ],
    })
  })

  it('drops a row whose tipo is not direccion/segmento/grupo', async () => {
    const { client } = makeClient([
      { nodo_id: 'x', parent_id: null, tipo: 'inventado', label: 'X', responsables: [] },
      { nodo_id: 'gdv-root', parent_id: null, tipo: 'direccion', label: 'Dirección', responsables: [] },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result).toHaveLength(1)
    expect(result[0].nodoId).toBe('gdv-root')
  })

  it('drops a responsable whose rol is not one of the four known keys, keeping the rest', async () => {
    const { client } = makeClient([
      {
        nodo_id: 'segmento-1',
        parent_id: 'gdv-root',
        tipo: 'segmento',
        label: 'Matrimonios',
        responsables: [
          { persona_id: 'p-1', nombre: 'Ana Pérez', rol: 'director_general' },
          { persona_id: 'p-2', nombre: 'Rol Inventado', rol: 'inventado' },
        ],
      },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result[0].responsables).toHaveLength(1)
    expect(result[0].responsables[0].nombre).toBe('Ana Pérez')
  })

  it('treats a non-array responsables value defensively as no responsables', async () => {
    const { client } = makeClient([
      { nodo_id: 'gdv-root', parent_id: null, tipo: 'direccion', label: 'Dirección', responsables: null as never },
    ])

    const result = await fetchEstructuraGdv(client)

    expect(result[0].responsables).toEqual([])
  })

  it('returns an empty array when the RPC returns no rows', async () => {
    const { client } = makeClient([])
    const result = await fetchEstructuraGdv(client)
    expect(result).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    const { client } = makeClient([], { message: 'boom' })
    await expect(fetchEstructuraGdv(client)).rejects.toBeTruthy()
  })
})
