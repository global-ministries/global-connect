import { directoresDeAsignaciones, unirNombresDirectores } from '@/lib/platform/grupos-vida/directores-nombres'

describe('unirNombresDirectores', () => {
  it('returns an empty string without directors', () => {
    expect(unirNombresDirectores([])).toBe('')
  })

  it('returns one full name', () => {
    expect(unirNombresDirectores([{ nombre: 'Ana', apellido: 'Pérez' }])).toBe('Ana Pérez')
  })

  it('joins two names with "y"', () => {
    expect(
      unirNombresDirectores([
        { nombre: 'Ana', apellido: 'Pérez' },
        { nombre: 'Luis', apellido: 'Gómez' },
      ]),
    ).toBe('Ana Pérez y Luis Gómez')
  })

  it('separates more than two names with commas and a final "y"', () => {
    expect(
      unirNombresDirectores([
        { nombre: 'Ana', apellido: 'Pérez' },
        { nombre: 'Luis', apellido: 'Gómez' },
        { nombre: 'Sara', apellido: 'Díaz' },
      ]),
    ).toBe('Ana Pérez, Luis Gómez y Sara Díaz')
  })

  it('skips directors without a name', () => {
    expect(unirNombresDirectores([{ nombre: null, apellido: null }, { nombre: 'Ana', apellido: '' }])).toBe('Ana')
  })
})

describe('directoresDeAsignaciones', () => {
  it('extracts every director, accepting object or array relations', () => {
    const asignaciones = [
      { segmento_lideres: { usuario: { nombre: 'Ana', apellido: 'Pérez' } } },
      { segmento_lideres: [{ usuario: [{ nombre: 'Luis', apellido: 'Gómez' }] }] },
      { segmento_lideres: null },
      { segmento_lideres: { usuario: null } },
    ]

    expect(directoresDeAsignaciones(asignaciones)).toEqual([
      { nombre: 'Ana', apellido: 'Pérez' },
      { nombre: 'Luis', apellido: 'Gómez' },
    ])
  })

  it('returns an empty list for missing input', () => {
    expect(directoresDeAsignaciones(undefined)).toEqual([])
  })
})
