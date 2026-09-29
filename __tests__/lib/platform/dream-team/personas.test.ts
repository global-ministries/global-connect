/**
 * `fetchNombresPersonas` — bulk display-name resolution for Dream Team
 * screens. `DreamTeamServicio` only carries `personaId` (see types.ts); this
 * resolves it to a display name in a single round trip, never one per servicio.
 *
 * It goes through the `dream_team_resolver_nombres` RPC, NOT a direct
 * `usuarios` select. `usuarios` has its own role-based RLS, which denies an
 * area director the names of volunteers outside their Grupo de Vida — even
 * though `dream_team_servicios` RLS correctly lets them see those servicios.
 * A direct select rendered "Persona no encontrada" on every row of the area
 * director's own team. The RPC resolves names only for people the caller has
 * tree-proven authority over.
 */
import { fetchContactosPersonas, fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import { personaId } from '@/lib/platform/dream-team/types'

interface FakeRow {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
}

function makeClient(rows: readonly FakeRow[], error: { message: string } | null = null) {
  const rpcMock = jest.fn().mockResolvedValue({ data: rows, error })
  const fromMock = jest.fn()
  return { client: { rpc: rpcMock, from: fromMock } as never, rpcMock, fromMock }
}

describe('fetchNombresPersonas', () => {
  it('returns an empty map without calling the database when there are no personaIds', async () => {
    const { client, rpcMock } = makeClient([])
    const result = await fetchNombresPersonas(client, [])
    expect(result.size).toBe(0)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('resolves names through the scoped RPC, deduplicating ids, in a single call', async () => {
    const { client, rpcMock } = makeClient([
      { id: 'p-1', nombre: 'Ana', apellido: 'Pérez' },
      { id: 'p-2', nombre: 'Luis', apellido: null },
    ])

    const result = await fetchNombresPersonas(client, [personaId('p-1'), personaId('p-1'), personaId('p-2')])

    expect(result.get(personaId('p-1'))).toBe('Ana Pérez')
    expect(result.get(personaId('p-2'))).toBe('Luis')
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('dream_team_resolver_nombres', { p_persona_ids: ['p-1', 'p-2'] })
  })

  it('never reads the usuarios table directly — its role-based RLS hides names from area directors', async () => {
    const { client, fromMock } = makeClient([{ id: 'p-1', nombre: 'Ana', apellido: 'Pérez' }])
    await fetchNombresPersonas(client, [personaId('p-1')])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('leaves out ids the RPC does not return, so the caller can tell unresolved from unnamed', async () => {
    const { client } = makeClient([{ id: 'p-1', nombre: 'Ana', apellido: 'Pérez' }])
    const result = await fetchNombresPersonas(client, [personaId('p-1'), personaId('p-fuera-de-rama')])
    expect(result.has(personaId('p-1'))).toBe(true)
    expect(result.has(personaId('p-fuera-de-rama'))).toBe(false)
  })

  it('falls back to a placeholder for a returned row without any name', async () => {
    const { client } = makeClient([{ id: 'p-1', nombre: '', apellido: '' }])
    const result = await fetchNombresPersonas(client, [personaId('p-1')])
    expect(result.get(personaId('p-1'))).toBe('Sin nombre')
  })

  it('throws when the RPC errors', async () => {
    const { client } = makeClient([], { message: 'boom' })
    await expect(fetchNombresPersonas(client, [personaId('p-1')])).rejects.toBeTruthy()
  })
})

describe('fetchContactosPersonas', () => {
  function makeContactosClient(
    rows: ReadonlyArray<{ id: string; telefono: string | null; tiene_cuenta: boolean }>,
    error: { message: string } | null = null,
  ) {
    const rpcMock = jest.fn().mockResolvedValue({ data: rows, error })
    const fromMock = jest.fn()
    return { client: { rpc: rpcMock, from: fromMock } as never, rpcMock, fromMock }
  }

  it('returns an empty map without calling the database when there are no personaIds', async () => {
    const { client, rpcMock } = makeContactosClient([])
    const result = await fetchContactosPersonas(client, [])
    expect(result.size).toBe(0)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('goes through the scoped RPC once, deduplicating ids, never reading usuarios', async () => {
    const { client, rpcMock, fromMock } = makeContactosClient([
      { id: 'p-1', telefono: '04125457346', tiene_cuenta: true },
      { id: 'p-2', telefono: null, tiene_cuenta: false },
    ])

    const result = await fetchContactosPersonas(client, [personaId('p-1'), personaId('p-1'), personaId('p-2')])

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('dream_team_contactos_personas', { p_persona_ids: ['p-1', 'p-2'] })
    expect(fromMock).not.toHaveBeenCalled()
    expect(result.get(personaId('p-1'))).toEqual({ telefono: '04125457346', tieneCuenta: true })
    expect(result.get(personaId('p-2'))).toEqual({ telefono: null, tieneCuenta: false })
  })

  it('leaves out ids the RPC does not return (people the caller does not reach)', async () => {
    const { client } = makeContactosClient([{ id: 'p-1', telefono: '04125457346', tiene_cuenta: false }])
    const result = await fetchContactosPersonas(client, [personaId('p-1'), personaId('p-otra-rama')])
    expect(result.has(personaId('p-otra-rama'))).toBe(false)
  })

  it('throws when the RPC errors', async () => {
    const { client } = makeContactosClient([], { message: 'boom' })
    await expect(fetchContactosPersonas(client, [personaId('p-1')])).rejects.toBeTruthy()
  })
})
