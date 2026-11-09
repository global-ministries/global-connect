/**
 * The person search of the programming sheet (odd/tasks/dps-asistencia-pco.md,
 * T11c; S11, S7.3): what is worth sending to dps_buscar_personas and how its
 * rows are read (id, nombre, apellido and iniciales only). Every name is
 * fictitious.
 */
import { filtrarPersonas, leerPersonasBuscadas, textoParaBuscar } from '@/lib/platform/dps/personas'

const ID = '11111111-1111-4111-8111-111111111111'

describe('textoParaBuscar', () => {
  it('searches from 2 to 100 characters, trimmed', () => {
    expect(textoParaBuscar('  Ana  ')).toBe('Ana')
    expect(textoParaBuscar('An')).toBe('An')
    expect(textoParaBuscar('a'.repeat(100))).toBe('a'.repeat(100))
  })

  it('skips fewer than 2 characters and more than 100', () => {
    expect(textoParaBuscar('')).toBeNull()
    expect(textoParaBuscar(' A ')).toBeNull()
    expect(textoParaBuscar('a'.repeat(101))).toBeNull()
  })
})

describe('leerPersonasBuscadas', () => {
  it('reads id, full name and initials', () => {
    expect(leerPersonasBuscadas([{ id: ID, nombre: 'Ana', apellido: 'Pérez', iniciales: 'AP' }])).toEqual([
      { personaId: ID, nombre: 'Ana Pérez', iniciales: 'AP' },
    ])
  })

  it('keeps a person without apellido and drops rows without a valid id', () => {
    expect(leerPersonasBuscadas([{ id: ID, nombre: 'Ana', apellido: null, iniciales: 'A' }, { id: 'x', nombre: 'Otra' }, null, 'x'])).toEqual([
      { personaId: ID, nombre: 'Ana', iniciales: 'A' },
    ])
    expect(leerPersonasBuscadas(null)).toEqual([])
  })
})

describe('filtrarPersonas (the suggestions of a list, S12.3)', () => {
  const LISTA = [
    { personaId: 'a', nombre: 'Ana Pérez', iniciales: 'AP' },
    { personaId: 'b', nombre: 'Andrés Valero', iniciales: 'AV' },
    { personaId: 'c', nombre: 'Lía Soto', iniciales: 'LS' },
  ]

  it('is the whole list for an empty text, minus the people already in the cell', () => {
    expect(filtrarPersonas(LISTA, '  ', ['b']).map((p) => p.personaId)).toEqual(['a', 'c'])
  })

  it('keeps who has every word, ignoring case, accents and order', () => {
    expect(filtrarPersonas(LISTA, 'an', []).map((p) => p.personaId)).toEqual(['a', 'b'])
    expect(filtrarPersonas(LISTA, 'perez ANA', []).map((p) => p.personaId)).toEqual(['a'])
    expect(filtrarPersonas(LISTA, 'lia', []).map((p) => p.personaId)).toEqual(['c'])
    expect(filtrarPersonas(LISTA, 'zz', [])).toEqual([])
  })
})
