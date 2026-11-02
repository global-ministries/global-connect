/**
 * The order of the ámbitos in every Estudiantes screen (S20 of
 * odd/tasks/estudiantes-fase-b.md): Transit → Inside Out → The Living Room,
 * never alphabetical; anything else after them, A–Z.
 */
import { compararAmbitos, ordenarPorAmbito, rangoAmbito } from '@/lib/platform/estudiantes/orden-ambitos'

describe('rangoAmbito', () => {
  it('ranks Transit, Inside Out and The Living Room, ignoring case, accents and spacing', () => {
    expect(rangoAmbito('Transit')).toBe(1)
    expect(rangoAmbito('TRANSÍT')).toBe(1)
    expect(rangoAmbito('Inside Out')).toBe(2)
    expect(rangoAmbito('inside-out')).toBe(2)
    expect(rangoAmbito('The Living Room')).toBe(3)
    expect(rangoAmbito('  living   room ')).toBe(3)
  })

  it('ranks The Living Room by its experiencia whatever its label', () => {
    expect(rangoAmbito('TLR', 'the_living_room')).toBe(3)
    expect(rangoAmbito('Transit', 'estudiantes')).toBe(1)
  })

  it('puts an unknown label last', () => {
    expect(rangoAmbito('Global Kids')).toBe(4)
    expect(rangoAmbito('')).toBe(4)
  })
})

describe('compararAmbitos and ordenarPorAmbito', () => {
  it('orders alphabetical input Transit → Inside Out → The Living Room, unknown ones after them A–Z', () => {
    const ambitos = ['Alfa', 'Inside Out', 'The Living Room', 'Transit', 'Zeta'].map((ambito) => ({ ambito }))
    expect([...ambitos].sort(compararAmbitos).map((a) => a.ambito)).toEqual(['Transit', 'Inside Out', 'The Living Room', 'Alfa', 'Zeta'])
  })

  it('uses the experiencia to place The Living Room', () => {
    const ambitos = [
      { ambito: 'Inside Out', experiencia: 'estudiantes' },
      { ambito: 'Jóvenes', experiencia: 'the_living_room' },
      { ambito: 'Transit', experiencia: 'estudiantes' },
    ]
    expect([...ambitos].sort(compararAmbitos).map((a) => a.ambito)).toEqual(['Transit', 'Inside Out', 'Jóvenes'])
  })

  it('keeps the incoming order inside one ámbito and leaves the input untouched', () => {
    const filas = [
      { id: 'io-1', ambito: 'Inside Out' },
      { id: 't-2', ambito: 'Transit' },
      { id: 'io-2', ambito: 'Inside Out' },
      { id: 't-1', ambito: 'Transit' },
    ]
    expect(ordenarPorAmbito(filas, (f) => f).map((f) => f.id)).toEqual(['t-2', 't-1', 'io-1', 'io-2'])
    expect(filas[0].id).toBe('io-1')
  })
})
