import {
  hijoVacio,
  mensajeDeErrorFamilia,
  validarFamilia,
  type FamiliaForm,
} from '@/lib/platform/ninos/familia'

function formValido(): FamiliaForm {
  return {
    padre: { nombre: ' Ana ', apellido: 'Pérez', telefono: '0414-555 1234', cedula: '', genero: 'Femenino' },
    hijos: [
      {
        ...hijoVacio(),
        nombre: 'Luis',
        apellido: 'Pérez',
        fechaNacimiento: '2022-03-10',
        genero: 'Masculino',
        grado: '',
        alergias: ' maní ',
        cambioPanal: true,
      },
    ],
    autorizados: [{ nombre: 'Rosa Pérez', telefono: '04145550000', relacion: 'Abuela' }],
  }
}

describe('validarFamilia', () => {
  it('builds the RPC payload with trimmed values and nulls for empty fields', () => {
    const r = validarFamilia(formValido())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.padre).toEqual({
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '0414-555 1234',
      cedula: null,
      genero: 'Femenino',
    })
    expect(r.payload.hijos[0]).toMatchObject({
      nombre: 'Luis',
      fecha_nacimiento: '2022-03-10',
      genero: 'Masculino',
      grado: null,
      alergias: 'maní',
      habitos: null,
      cambio_panal: true,
      puede_comer: null,
    })
    expect(r.payload.autorizados).toEqual([{ nombre: 'Rosa Pérez', telefono: '04145550000', relacion: 'Abuela' }])
  })

  it('requires the parent name, last name, phone and gender', () => {
    const f = formValido()
    f.padre = { nombre: '', apellido: ' ', telefono: '12', cedula: '', genero: '' }
    const r = validarFamilia(f)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores).toEqual(
      expect.arrayContaining([
        'El nombre del representante es obligatorio.',
        'El apellido del representante es obligatorio.',
        'El teléfono del representante no es válido.',
        'El género del representante es obligatorio.',
      ]),
    )
  })

  it('requires at least one child', () => {
    const f = formValido()
    f.hijos = []
    const r = validarFamilia(f)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores).toContain('Agrega al menos un niño.')
  })

  it('validates each child: name, birth date in the past, gender and grade 0–6', () => {
    const f = formValido()
    f.hijos[0] = { ...hijoVacio(), nombre: 'X', apellido: '', fechaNacimiento: '2999-01-01', genero: '', grado: '9' }
    const r = validarFamilia(f)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores).toEqual(
      expect.arrayContaining([
        'Niño 1: el apellido es obligatorio.',
        'Niño 1: la fecha de nacimiento no es válida.',
        'Niño 1: el género es obligatorio.',
        'Niño 1: el grado no es válido.',
      ]),
    )
  })

  it('accepts PreK as grade 0 and drops blank pickup rows', () => {
    const f = formValido()
    f.hijos[0].grado = '0'
    f.autorizados = [{ nombre: ' ', telefono: '', relacion: '' }]
    const r = validarFamilia(f)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.hijos[0].grado).toBe(0)
    expect(r.payload.autorizados).toEqual([])
  })

  it('needs a name on a pickup person that has a phone or relation', () => {
    const f = formValido()
    f.autorizados = [{ nombre: '', telefono: '0414', relacion: 'Tía' }]
    const r = validarFamilia(f)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores).toContain('Autorizado 1: el nombre es obligatorio.')
  })

  it('skips parent checks when adding a child to an existing parent', () => {
    const f = formValido()
    f.padre = { id: 'p-1', nombre: '', apellido: '', telefono: '', cedula: '', genero: '' }
    const r = validarFamilia(f)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.padre).toEqual({ id: 'p-1' })
  })
})

describe('mensajeDeErrorFamilia', () => {
  it('maps known RPC error codes to Spanish copy', () => {
    expect(mensajeDeErrorFamilia({ code: '42501', message: 'sin_autoridad' })).toBe(
      'No tienes permiso para registrar familias.',
    )
    expect(mensajeDeErrorFamilia({ code: '23505', message: 'hijo_ya_registrado' })).toBe(
      'Uno de los niños ya está registrado con este representante.',
    )
    expect(mensajeDeErrorFamilia({ code: 'XX', message: 'boom' })).toBe('No se pudo guardar. Intenta de nuevo.')
  })
})
