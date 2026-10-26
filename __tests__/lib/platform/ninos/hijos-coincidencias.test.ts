import { avisoHijoCoincidencia, parseHijosCoincidencias } from '@/lib/platform/ninos/familia'

const fila = {
  indice: 0,
  nino_id: 'n1',
  nombre: 'José Ángel',
  apellido: 'Pérez',
  padre_id: 'p3',
  padres: ['Ana Pérez', 'Luis Gómez'],
}

describe('parseHijosCoincidencias', () => {
  it('maps the RPC rows', () => {
    expect(parseHijosCoincidencias([fila])).toEqual([
      { indice: 0, ninoId: 'n1', nombre: 'José Ángel', apellido: 'Pérez', padreId: 'p3', padres: ['Ana Pérez', 'Luis Gómez'] },
    ])
  })

  it('returns [] for anything that is not an array', () => {
    expect(parseHijosCoincidencias(null)).toEqual([])
    expect(parseHijosCoincidencias({ padre_id: 'p1' })).toEqual([])
  })

  it('drops malformed rows and non-string parent names', () => {
    expect(
      parseHijosCoincidencias([
        { ...fila, nino_id: 1 },
        { ...fila, padre_id: null },
        { ...fila, indice: 'x' },
        { ...fila, apellido: null, padres: ['Ana Pérez', 3] },
      ]),
    ).toEqual([{ indice: 0, ninoId: 'n1', nombre: 'José Ángel', apellido: '', padreId: 'p3', padres: ['Ana Pérez'] }])
  })
})

describe('avisoHijoCoincidencia', () => {
  it('names the child and the other family', () => {
    expect(avisoHijoCoincidencia(parseHijosCoincidencias([fila])[0])).toBe(
      'José Ángel Pérez ya está registrado en la familia de Ana Pérez y Luis Gómez.',
    )
  })

  it('works with one parent', () => {
    expect(avisoHijoCoincidencia(parseHijosCoincidencias([{ ...fila, padres: ['Ana Pérez'] }])[0])).toBe(
      'José Ángel Pérez ya está registrado en la familia de Ana Pérez.',
    )
  })
})
