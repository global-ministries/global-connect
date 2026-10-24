import { hijoVacio, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import {
  LIMITES_MIS_HIJOS,
  mensajeDeErrorMisHijos,
  miHijoAEncontrado,
  parseMisHijos,
  resumenAlergias,
  textoEdad,
  textoOtrosPadres,
  validarEdicionMisHijos,
  type MiHijo,
} from '@/lib/platform/ninos/mis-hijos'

const HOY = '2026-10-10'

const fila = {
  id: 'h1',
  nombre: 'Luis',
  apellido: 'Pérez',
  fecha_nacimiento: '2021-05-05',
  genero: 'Masculino',
  edad: 5,
  tiene_ficha: true,
  grado: null,
  alergias: 'Maní',
  necesidades_especiales: null,
  habitos: null,
  notas: null,
  puede_comer: true,
  cambio_panal: null,
  autoriza_imagen: false,
  escolarizado: null,
  autorizados: [{ id: 'a1', nombre: 'Abuela', telefono: '04140000000', relacion: 'Abuela' }],
  otros_padres: [{ nombre: 'Juan', apellido: 'Pérez' }],
  puede_editar_identidad: true,
}

describe('parseMisHijos', () => {
  it('keeps well-formed children and normalizes their lists', () => {
    const [h] = parseMisHijos([fila, { nombre: 'sin id' }, 'x'])
    expect(h).toMatchObject({ id: 'h1', nombre: 'Luis', edad: 5, tiene_ficha: true, puede_editar_identidad: true })
    expect(h.autorizados).toEqual([{ id: 'a1', nombre: 'Abuela', telefono: '04140000000', relacion: 'Abuela' }])
    expect(h.otros_padres).toEqual([{ nombre: 'Juan', apellido: 'Pérez' }])
    expect(parseMisHijos([fila, { nombre: 'sin id' }])).toHaveLength(1)
  })

  it('fails closed: identity not editable unless the RPC says so, empty lists when missing', () => {
    const [h] = parseMisHijos([{ id: 'h2', nombre: 'Eva', apellido: 'Pérez' }])
    expect(h).toMatchObject({ puede_editar_identidad: false, autorizados: [], otros_padres: [], edad: null })
  })

  it('returns [] for anything that is not an array', () => {
    expect(parseMisHijos(null)).toEqual([])
    expect(parseMisHijos({ id: 'h1' })).toEqual([])
  })
})

describe('textoEdad', () => {
  it('reads the age in years', () => {
    expect(textoEdad(null)).toBe('')
    expect(textoEdad(0)).toBe('Menos de 1 año')
    expect(textoEdad(1)).toBe('1 año')
    expect(textoEdad(7)).toBe('7 años')
  })
})

describe('textoOtrosPadres', () => {
  it('joins the names only', () => {
    expect(textoOtrosPadres([])).toBe('')
    expect(textoOtrosPadres([{ nombre: 'Juan', apellido: 'Pérez' }])).toBe('Juan Pérez')
    expect(
      textoOtrosPadres([
        { nombre: 'Juan', apellido: 'Pérez' },
        { nombre: 'Rosa', apellido: 'Gil' },
      ]),
    ).toBe('Juan Pérez y Rosa Gil')
    expect(
      textoOtrosPadres([
        { nombre: 'Juan', apellido: 'Pérez' },
        { nombre: 'Rosa', apellido: 'Gil' },
        { nombre: 'Ana', apellido: 'Ruiz' },
      ]),
    ).toBe('Juan Pérez, Rosa Gil y Ana Ruiz')
  })
})

describe('resumenAlergias', () => {
  it('is empty without allergies and cuts long texts', () => {
    expect(resumenAlergias(null)).toBe('')
    expect(resumenAlergias('  ')).toBe('')
    expect(resumenAlergias('Maní')).toBe('Maní')
    const largo = resumenAlergias('a'.repeat(120))
    expect(largo).toHaveLength(80)
    expect(largo.endsWith('…')).toBe(true)
  })
})

describe('miHijoAEncontrado', () => {
  it('leaves the staff-only fields empty for the shared edit form', () => {
    const h: MiHijo = parseMisHijos([fila])[0]
    expect(miHijoAEncontrado(h)).toMatchObject({
      id: 'h1',
      alergias: 'Maní',
      puede_comer: true,
      salon_preferido_id: null,
      es_vip_desde: null,
      tiene_ficha: true,
      autorizados: [{ id: 'a1', nombre: 'Abuela', telefono: '04140000000', relacion: 'Abuela' }],
    })
  })
})

describe('validarEdicionMisHijos', () => {
  const base: HijoForm = {
    ...hijoVacio(),
    nombre: ' Luis ',
    apellido: 'Pérez',
    fechaNacimiento: '2021-05-05',
    genero: 'Masculino',
    grado: '1',
    salonPreferidoId: 'f9a10000-0000-4000-9a06-000000000001',
    alergias: ' Maní ',
  }
  const autorizados: AutorizadoForm[] = [{ nombre: 'Abuela', telefono: '', relacion: 'Abuela' }]
  const CAMPOS_FICHA = [
    'alergias',
    'autoriza_imagen',
    'autorizados',
    'cambio_panal',
    'escolarizado',
    'grado',
    'habitos',
    'necesidades_especiales',
    'notas',
    'puede_comer',
  ]

  it('sends identity, the parent ficha fields and the pickup list, never the room', () => {
    const r = validarEdicionMisHijos(base, autorizados, { identidadEditable: true }, HOY)
    if (!r.ok) throw new Error(r.errores.join(' '))
    expect(Object.keys(r.payload).sort()).toEqual([...CAMPOS_FICHA, 'apellido', 'fecha_nacimiento', 'genero', 'nombre'].sort())
    expect(r.payload).toMatchObject({ nombre: 'Luis', grado: 1, alergias: 'Maní', autorizados: [{ nombre: 'Abuela', telefono: null, relacion: 'Abuela' }] })
  })

  it('without identity rights sends no identity keys and ignores the hidden identity fields', () => {
    const r = validarEdicionMisHijos({ ...base, nombre: '', genero: 'Otro' }, autorizados, { identidadEditable: false }, HOY)
    if (!r.ok) throw new Error(r.errores.join(' '))
    expect(Object.keys(r.payload).sort()).toEqual(CAMPOS_FICHA)
  })

  it('applies the SQL limits: 6 pickup people and 500 characters', () => {
    const siete = Array.from({ length: LIMITES_MIS_HIJOS.autorizados + 1 }, (_, i) => ({ nombre: `P${i}`, telefono: '', relacion: '' }))
    expect(validarEdicionMisHijos(base, siete, { identidadEditable: true }, HOY)).toEqual({
      ok: false,
      errores: ['Puedes indicar hasta 6 personas autorizadas.'],
    })
    expect(validarEdicionMisHijos({ ...base, notas: 'n'.repeat(501) }, autorizados, { identidadEditable: true }, HOY)).toEqual({
      ok: false,
      errores: ['Cada campo admite hasta 500 caracteres.'],
    })
    expect(
      validarEdicionMisHijos(base, [{ nombre: 'x'.repeat(501), telefono: '', relacion: '' }], { identidadEditable: false }, HOY),
    ).toEqual({ ok: false, errores: ['Cada campo admite hasta 500 caracteres.'] })
    expect(validarEdicionMisHijos({ ...base, notas: 'n'.repeat(500) }, autorizados, { identidadEditable: true }, HOY).ok).toBe(true)
  })

  it('reports invalid identity and grade', () => {
    const r = validarEdicionMisHijos({ ...base, nombre: ' ', fechaNacimiento: '2030-01-01' }, autorizados, { identidadEditable: true }, HOY)
    expect(r).toEqual({ ok: false, errores: ['El nombre es obligatorio.', 'La fecha de nacimiento no es válida.'] })
    expect(validarEdicionMisHijos({ ...base, grado: '9' }, autorizados, { identidadEditable: false }, HOY)).toEqual({
      ok: false,
      errores: ['El grado no es válido.'],
    })
  })
})

describe('mensajeDeErrorMisHijos', () => {
  it('explains each code of ninos_mis_hijos_guardar in Spanish', () => {
    expect(mensajeDeErrorMisHijos({ code: '22023', message: 'nino_no_encontrado' })).toBe(
      'No encontramos a este niño entre tus hijos. Recarga la página.',
    )
    expect(mensajeDeErrorMisHijos({ code: '42501', message: 'campo_no_permitido' })).toBe('Hay un dato que no puedes cambiar desde aquí.')
    expect(mensajeDeErrorMisHijos({ code: '22023', message: 'limite_autorizados' })).toBe('Puedes indicar hasta 6 personas autorizadas.')
    expect(mensajeDeErrorMisHijos({ code: '22023', message: 'texto_muy_largo' })).toBe('Cada campo admite hasta 500 caracteres.')
    expect(mensajeDeErrorMisHijos({ code: '22023', message: 'edad_fuera_de_rango' })).toBe(
      'Con esa fecha de nacimiento no estaría en Niños (solo menores de 13 años).',
    )
    expect(mensajeDeErrorMisHijos({ code: '42501', message: 'sin_autoridad' })).toBe('Tu sesión expiró. Vuelve a iniciar sesión.')
  })

  it('falls back by error class', () => {
    expect(mensajeDeErrorMisHijos({ code: '42501', message: 'permission denied for function x' })).toBe(
      'No tienes permiso para hacer este cambio.',
    )
    expect(mensajeDeErrorMisHijos({ code: '22023', message: 'datos_invalidos' })).toBe('Revisa los datos: hay campos inválidos.')
    expect(mensajeDeErrorMisHijos(null)).toBe('No se pudo guardar. Intenta de nuevo.')
  })
})
