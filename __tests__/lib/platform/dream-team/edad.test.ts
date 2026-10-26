/**
 * `edad` — age ranges of Dream Team volunteers (D10 of
 * odd/tasks/ninos-voluntarios-waumba.md): <12, 12–17, 18–25, 26+ and "sin
 * fecha", counted per person over whatever the screen has selected. The range
 * comes from the scoped `dream_team_rangos_edad` RPC; the birth date never
 * reaches the client.
 */
import {
  RANGOS_EDAD,
  RANGO_EDAD_LABELS,
  contarPorRangoEdad,
  esRangoEdad,
  fetchRangosEdad,
} from '@/lib/platform/dream-team/edad'
import { personaId } from '@/lib/platform/dream-team/types'

function makeClient(rows: readonly { id: string; rango: string }[] | null, error: { message: string } | null = null) {
  const rpcMock = jest.fn().mockResolvedValue({ data: rows, error })
  return { client: { rpc: rpcMock } as never, rpcMock }
}

describe('age ranges', () => {
  it('are the five of D10, in order, with their labels', () => {
    expect(RANGOS_EDAD).toEqual(['menor_12', '12_17', '18_25', '26_mas', 'sin_fecha'])
    expect(RANGOS_EDAD.map((rango) => RANGO_EDAD_LABELS[rango])).toEqual([
      'Menos de 12',
      '12–17',
      '18–25',
      '26+',
      'Sin fecha',
    ])
  })

  it('recognizes only those keys', () => {
    expect(esRangoEdad('12_17')).toBe(true)
    expect(esRangoEdad('sin_fecha')).toBe(true)
    expect(esRangoEdad('17')).toBe(false)
    expect(esRangoEdad(null)).toBe(false)
  })
})

describe('contarPorRangoEdad', () => {
  it('counts each person once per range and leaves out people without a known range', () => {
    const conteo = contarPorRangoEdad([
      { personaId: 'a', rangoEdad: '12_17' },
      { personaId: 'a', rangoEdad: '12_17' }, // the same person in a second equipo
      { personaId: 'b', rangoEdad: '12_17' },
      { personaId: 'c', rangoEdad: 'menor_12' },
      { personaId: 'd', rangoEdad: 'sin_fecha' },
      { personaId: 'e' }, // not visible to the caller: not counted anywhere
    ])
    expect(conteo).toEqual({ menor_12: 1, '12_17': 2, '18_25': 0, '26_mas': 0, sin_fecha: 1 })
  })

  it('is all zeros for an empty selection', () => {
    expect(contarPorRangoEdad([])).toEqual({ menor_12: 0, '12_17': 0, '18_25': 0, '26_mas': 0, sin_fecha: 0 })
  })
})

describe('fetchRangosEdad', () => {
  it('returns an empty map without calling the database when there are no personaIds', async () => {
    const { client, rpcMock } = makeClient([])
    expect((await fetchRangosEdad(client, [])).size).toBe(0)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('asks the scoped RPC once, deduplicating ids, and drops unknown ranges', async () => {
    const { client, rpcMock } = makeClient([
      { id: 'p-1', rango: '18_25' },
      { id: 'p-2', rango: 'sin_fecha' },
      { id: 'p-3', rango: 'otro' },
    ])
    const rangos = await fetchRangosEdad(client, [personaId('p-1'), personaId('p-2'), personaId('p-1'), personaId('p-3')])
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('dream_team_rangos_edad', { p_persona_ids: ['p-1', 'p-2', 'p-3'] })
    expect([...rangos]).toEqual([
      ['p-1', '18_25'],
      ['p-2', 'sin_fecha'],
    ])
  })

  it('throws the database error', async () => {
    const { client } = makeClient(null, { message: 'boom' })
    await expect(fetchRangosEdad(client, [personaId('p-1')])).rejects.toEqual({ message: 'boom' })
  })
})
