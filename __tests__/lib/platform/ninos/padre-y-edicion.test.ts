import { hijoVacio, mensajeDeErrorFamilia, parseCoincidencias, validarEdicionNino } from '@/lib/platform/ninos/familia'

describe('parseCoincidencias', () => {
  it('keeps only well-formed matches with masked data', () => {
    expect(
      parseCoincidencias([
        { id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '•••1234', cedula: null, coincide_por: 'telefono' },
        { nombre: 'sin id' },
        'x',
      ]),
    ).toEqual([{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '•••1234', cedula: null, coincide_por: 'telefono' }])
  })

  it('returns [] for anything that is not an array', () => {
    expect(parseCoincidencias(null)).toEqual([])
  })
})

describe('mensajeDeErrorFamilia', () => {
  it('explains padre_existente', () => {
    expect(mensajeDeErrorFamilia({ code: '23505', message: 'padre_existente' })).toBe(
      'Ya existe una persona con ese teléfono o cédula. Confírmala antes de guardar.',
    )
  })
})

describe('validarEdicionNino', () => {
  const base = { ...hijoVacio(), nombre: ' Luis ', apellido: 'Pérez', fechaNacimiento: '2022-03-10', genero: 'Masculino', grado: '1' }

  it('sends identity and ficha fields', () => {
    const r = validarEdicionNino(base, '2026-10-08')
    expect(r).toEqual({
      ok: true,
      payload: expect.objectContaining({ nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2022-03-10', genero: 'Masculino', grado: 1 }),
    })
  })

  it('rejects blank names, future dates and a missing gender', () => {
    const r = validarEdicionNino({ ...base, nombre: ' ', fechaNacimiento: '2030-01-01', genero: '' }, '2026-10-08')
    expect(r).toEqual({
      ok: false,
      errores: ['El nombre es obligatorio.', 'La fecha de nacimiento no es válida.', 'El género es obligatorio.'],
    })
  })
})
