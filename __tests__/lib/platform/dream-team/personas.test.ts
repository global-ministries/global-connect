/**
 * `fetchNombresPersonas` — bulk display-name resolution for Dream Team
 * screens. `DreamTeamServicio` only carries `personaId` (see types.ts); this
 * resolves it to a display name with a single `usuarios.in(id)` query,
 * never one query per servicio.
 */
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import { personaId } from '@/lib/platform/dream-team/types'

interface FakeRow {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
}

function makeClient(rows: readonly FakeRow[], error: { message: string } | null = null) {
  const inMock = jest.fn().mockResolvedValue({ data: rows, error })
  const selectMock = jest.fn().mockReturnValue({ in: inMock })
  const fromMock = jest.fn().mockReturnValue({ select: selectMock })
  return { client: { from: fromMock } as never, fromMock, selectMock, inMock }
}

describe('fetchNombresPersonas', () => {
  it('returns an empty map without querying when there are no personaIds', async () => {
    const { client, fromMock } = makeClient([])
    const result = await fetchNombresPersonas(client, [])
    expect(result.size).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('resolves nombre + apellido for each distinct personaId in a single query', async () => {
    const { client, fromMock, inMock } = makeClient([
      { id: 'p-1', nombre: 'Ana', apellido: 'Pérez' },
      { id: 'p-2', nombre: 'Luis', apellido: null },
    ])

    const result = await fetchNombresPersonas(client, [personaId('p-1'), personaId('p-1'), personaId('p-2')])

    expect(result.get(personaId('p-1'))).toBe('Ana Pérez')
    expect(result.get(personaId('p-2'))).toBe('Luis')
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(inMock).toHaveBeenCalledWith('id', ['p-1', 'p-2'])
  })

  it('falls back to a placeholder for a usuario row without any name', async () => {
    const { client } = makeClient([{ id: 'p-1', nombre: '', apellido: '' }])
    const result = await fetchNombresPersonas(client, [personaId('p-1')])
    expect(result.get(personaId('p-1'))).toBe('Sin nombre')
  })

  it('throws when the underlying query errors', async () => {
    const { client } = makeClient([], { message: 'boom' })
    await expect(fetchNombresPersonas(client, [personaId('p-1')])).rejects.toBeTruthy()
  })
})
