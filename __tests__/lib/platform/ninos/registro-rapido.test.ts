/**
 * One-screen family registration (odd/tasks/ninos-v2.md N4b, S5–S6): what is
 * missing per section, folding, the default pickup person and the payloads of
 * the public QR page and the desk.
 */
import {
  conFechaNacimiento,
  cuerpoPublico,
  datosIniciales,
  debePlegarse,
  estadoBarra,
  faltantes,
  familiaMesa,
  hijoRapidoVacio,
  idRapido,
  personasRetiran,
  resumenSeccion,
  salonVivo,
  seccionCompleta,
  seleccionIngreso,
  textoBarra,
  type DatosRapido,
} from '@/lib/platform/ninos/registro-rapido'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

const HOY = '2026-11-01'
const CAMPUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MATERNAL = '00000000-0000-4000-8000-000000000001'
const PREESCOLAR = '00000000-0000-4000-8000-000000000002'

const salones: SalonNivel[] = [
  { id: MATERNAL, nombre: 'Caminantes', area: 'waumba', edadMinMeses: 12, edadMaxMeses: 35, gradoMin: null, gradoMax: null, esNecesidadesEspeciales: false, activo: true, orden: 1 },
  { id: PREESCOLAR, nombre: 'Preescolar', area: 'waumba', edadMinMeses: 36, edadMaxMeses: 71, gradoMin: null, gradoMax: null, esNecesidadesEspeciales: false, activo: true, orden: 2 },
]

function completos(): DatosRapido {
  const d = datosIniciales({ campusId: CAMPUS })
  d.padre = { nombre: 'María', apellido: 'Linárez', telefono: '0414 512 3388', genero: 'Femenino', cedula: '', email: '' }
  d.hijos = [{ ...hijoRapidoVacio('Linárez'), nombre: 'Camila', fechaNacimiento: '2022-02-09', genero: 'Femenino', tieneAlergias: false, tieneNecesidades: false }]
  return d
}

const publico = { modo: 'publico' as const, hoy: HOY, campusIds: [CAMPUS] }
const mesa = { modo: 'mesa' as const, hoy: HOY }

describe('faltantes', () => {
  it('a complete public registration misses nothing', () => {
    expect(faltantes(completos(), publico)).toEqual([])
  })

  it('lists every missing field in form order with its section, label and message', () => {
    const d = datosIniciales()
    const f = faltantes(d, publico)
    expect(f.map((x) => x.id)).toEqual([
      idRapido.campus,
      idRapido.padre('nombre'),
      idRapido.padre('apellido'),
      idRapido.padre('telefono'),
      idRapido.padre('genero'),
      idRapido.hijo(0, 'nombre'),
      idRapido.hijo(0, 'apellido'),
      idRapido.hijo(0, 'nacimiento'),
      idRapido.hijo(0, 'genero'),
      idRapido.hijo(0, 'tiene-alergias'),
      idRapido.hijo(0, 'tiene-nee'),
    ])
    expect(f[1]).toEqual({ id: 'rr-padre-nombre', seccion: 'tu', etiqueta: 'Tu nombre', mensaje: 'Escribe tu nombre.' })
    expect(f[4].mensaje).toBe('Elige mamá o papá.')
  })

  it('the parent género is required in both modes', () => {
    const d = completos()
    d.padre.genero = ''
    expect(faltantes(d, publico).map((x) => x.id)).toEqual([idRapido.padre('genero')])
    expect(faltantes(d, mesa)).toEqual([
      { id: 'rr-padre-genero', seccion: 'tu', etiqueta: 'Género del representante', mensaje: 'Elige mamá o papá.' },
    ])
  })

  it('a known parent (existing or confirmed) skips the parent fields', () => {
    const d = completos()
    d.padre = { nombre: '', apellido: '', telefono: '', genero: '', cedula: '', email: '' }
    expect(faltantes(d, { ...mesa, padreConocido: true })).toEqual([])
  })

  it('health answers are required on the public page and optional at the desk; a Sí needs the text', () => {
    const d = completos()
    d.hijos[0] = { ...d.hijos[0], tieneAlergias: null, tieneNecesidades: true }
    expect(faltantes(d, publico)).toEqual([
      { id: idRapido.hijo(0, 'tiene-alergias'), seccion: 'ninos', etiqueta: 'Alergias de Camila', mensaje: 'Elige Sí o No.' },
      { id: idRapido.hijo(0, 'nee'), seccion: 'ninos', etiqueta: 'Condición médica de Camila: ¿cuál?', mensaje: 'Cuéntanos cuál.' },
    ])
    expect(faltantes(d, mesa).map((x) => x.id)).toEqual([idRapido.hijo(0, 'nee')])
  })

  it('a child of 13 or more is refused with the under-13 rule on its card', () => {
    const d = completos()
    d.hijos[0].fechaNacimiento = '2012-08-30'
    expect(faltantes(d, mesa)).toEqual([
      {
        id: idRapido.hijo(0, 'nacimiento'),
        seccion: 'ninos',
        etiqueta: 'Edad de Camila',
        mensaje: 'Con esa fecha Camila tendría 14 años. Niños recibe menores de 13: revisa la fecha o quita a Camila de este registro.',
      },
    ])
  })

  it('a future or invalid birth date asks for a valid one', () => {
    const d = completos()
    d.hijos[0].fechaNacimiento = '2099-01-01'
    expect(faltantes(d, mesa)[0]).toMatchObject({ etiqueta: 'Fecha de nacimiento de Camila', mensaje: 'Elige una fecha de nacimiento válida.' })
  })

  it('a pickup person with data but no name blocks; a blank one is ignored', () => {
    const d = completos()
    d.autorizados = [{ nombre: '', telefono: '', relacion: '' }, { nombre: '', telefono: '0424', relacion: '' }]
    expect(faltantes(d, publico)).toEqual([
      { id: idRapido.autorizado(1), seccion: 'retiran', etiqueta: 'Nombre de la persona 2 que retira', mensaje: 'Escribe su nombre o quita esta persona.' },
    ])
  })

  it('an invalid optional email belongs to «Para después»; the desk has no email field', () => {
    const d = completos()
    d.padre.email = 'no-es-correo'
    expect(faltantes(d, publico)).toEqual([
      { id: idRapido.padre('email'), seccion: 'despues', etiqueta: 'Tu correo', mensaje: 'Escribe un correo válido o déjalo vacío.' },
    ])
    expect(faltantes(d, mesa)).toEqual([])
  })

  it('without children it asks for one', () => {
    const d = completos()
    d.hijos = []
    expect(faltantes(d, publico)).toEqual([{ id: idRapido.agregarHijo, seccion: 'ninos', etiqueta: 'Un niño', mensaje: 'Agrega al menos un niño.' }])
  })
})

describe('sections and folding', () => {
  it('a section is complete when nothing of it is missing', () => {
    const d = completos()
    d.hijos[0].genero = ''
    const f = faltantes(d, publico)
    expect(seccionCompleta(f, 'tu')).toBe(true)
    expect(seccionCompleta(f, 'ninos')).toBe(false)
  })

  it('folds only a complete section the person already left', () => {
    expect(debePlegarse(true, true)).toBe(true)
    expect(debePlegarse(true, false)).toBe(false)
    expect(debePlegarse(false, true)).toBe(false)
  })

  it('summarizes each folded section in one line', () => {
    const d = completos()
    d.autorizados = [{ nombre: 'Carmen Rosa Escalona', telefono: '0424 530 1172', relacion: 'Abuela' }]
    expect(resumenSeccion(d, 'tu', publico)).toEqual({ texto: 'María Linárez · mamá', numero: '0414 512 3388' })
    expect(resumenSeccion(d, 'ninos', publico)).toEqual({ texto: 'Camila (4 años)' })
    expect(resumenSeccion(d, 'retiran', publico)).toEqual({ texto: 'Tú y Carmen Rosa Escalona' })
  })
})

describe('bar and pickup people', () => {
  it('the parent always picks up first; others follow with their relation and phone', () => {
    const d = completos()
    d.autorizados = [{ nombre: 'Carmen Rosa', telefono: '0424', relacion: 'Abuela' }, { nombre: '', telefono: '', relacion: '' }]
    expect(personasRetiran(d, publico)).toEqual([
      { nombre: 'María Linárez', detalle: 'Tú · siempre', numero: null, indice: null },
      { nombre: 'Carmen Rosa', detalle: 'Abuela', numero: '0424', indice: 0 },
    ])
    expect(personasRetiran(d, { ...mesa, padreNombre: 'Pedro Ruiz' })[0]).toEqual({ nombre: 'Pedro Ruiz', detalle: 'Representante · siempre', numero: null, indice: null })
  })

  it('says how much is missing, or that all is ready with the counts', () => {
    const d = completos()
    expect(estadoBarra(faltantes(d, publico), d, publico)).toEqual({ faltan: 0, primero: null, ninos: 1, retiran: 1 })
    expect(textoBarra({ faltan: 0, primero: null, ninos: 2, retiran: 2 })).toBe('Todo listo: 2 niños · 2 personas retiran')
    d.padre.telefono = ''
    d.hijos[0].genero = ''
    const e = estadoBarra(faltantes(d, publico), d, publico)
    expect(e).toMatchObject({ faltan: 2, primero: 'Tu teléfono' })
    expect(textoBarra(e)).toBe('Faltan 2 datos: Tu teléfono…')
    expect(textoBarra({ faltan: 1, primero: 'Tu teléfono', ninos: 1, retiran: 1 })).toBe('Falta 1 dato: Tu teléfono')
  })
})

describe('payloads', () => {
  it('the public body keeps the old shape and now carries the parent género and the photo answer', () => {
    const d = completos()
    d.fotos = false
    d.hijos[0] = { ...d.hijos[0], tieneAlergias: true, alergias: 'Maní', tieneNecesidades: false, necesidadesEspeciales: 'borrado' }
    d.autorizados = [{ nombre: 'Abuela', telefono: '0424', relacion: '' }, { nombre: '', telefono: '', relacion: '' }]
    const body = cuerpoPublico(d, '')
    expect(Object.keys(body).sort()).toEqual(['autorizados', 'campusId', 'hijos', 'padre', 'sitioWeb'])
    expect(body.padre).toEqual({ nombre: 'María', apellido: 'Linárez', telefono: '0414 512 3388', genero: 'Femenino', cedula: '', email: '' })
    expect(body.autorizados).toEqual([{ nombre: 'Abuela', telefono: '0424', relacion: '' }])
    expect(body.hijos).toEqual([
      {
        nombre: 'Camila', apellido: 'Linárez', fechaNacimiento: '2022-02-09', genero: 'Femenino', grado: '', salonPreferidoId: '',
        alergias: 'Maní', necesidadesEspeciales: '', habitos: '', notas: '', puedeComer: null, cambioPanal: null, autorizaImagen: false, escolarizado: null,
      },
    ])
  })

  it('the desk form keeps the ficha extras per child and the parent id when known', () => {
    const d = completos()
    d.hijos[0] = { ...d.hijos[0], grado: '2', habitos: 'Siesta', autorizaImagen: true }
    const f = familiaMesa(d, 'p9')
    expect(f.padre).toEqual({ id: 'p9', nombre: 'María', apellido: 'Linárez', telefono: '0414 512 3388', cedula: '', genero: 'Femenino' })
    expect(f.hijos[0]).toMatchObject({ grado: '2', habitos: 'Siesta', autorizaImagen: true, alergias: '' })
    expect(familiaMesa(d).padre.id).toBeUndefined()
  })

  it('prefills from a stored form (a pre-registration under review)', () => {
    const d = datosIniciales({
      form: {
        padre: { nombre: 'Ana', apellido: 'P', telefono: '0414', cedula: '1', genero: '' },
        hijos: [{ ...hijoRapidoVacio('P'), nombre: 'Sol', alergias: 'Maní' }],
        autorizados: [],
      },
      email: 'a@b.co',
    })
    expect(d.padre).toEqual({ nombre: 'Ana', apellido: 'P', telefono: '0414', cedula: '1', genero: '', email: 'a@b.co' })
    expect(d.hijos[0]).toMatchObject({ nombre: 'Sol', alergias: 'Maní', tieneAlergias: true, tieneNecesidades: null })
  })
})

describe('salón', () => {
  it('a new birth date preselects the suggested level at the desk, never over a hand-picked one', () => {
    const h = conFechaNacimiento(hijoRapidoVacio(), '2022-02-09', salones, HOY)
    expect(h).toMatchObject({ fechaNacimiento: '2022-02-09', salonPreferidoId: PREESCOLAR, nivelAuto: `salon:${PREESCOLAR}` })
    expect(conFechaNacimiento(h, '2024-07-21', salones, HOY).salonPreferidoId).toBe(MATERNAL)
    const aMano = { ...h, salonPreferidoId: MATERNAL, nivelAuto: '' }
    expect(conFechaNacimiento(aMano, '2022-03-01', salones, HOY).salonPreferidoId).toBe(MATERNAL)
  })

  it('shows the salón live from the level or the age', () => {
    expect(salonVivo({ ...hijoRapidoVacio(), fechaNacimiento: '2024-07-21' }, salones, HOY)?.nombre).toBe('Caminantes')
    expect(salonVivo({ ...hijoRapidoVacio(), fechaNacimiento: '2024-07-21', salonPreferidoId: PREESCOLAR }, salones, HOY)?.nombre).toBe('Preescolar')
    expect(salonVivo(hijoRapidoVacio(), salones, HOY)).toBeNull()
  })

  it('pairs the registered children with their ids and salón for the check-in', () => {
    const hijos = familiaMesa(completos()).hijos.map((h) => ({ nombre: h.nombre, apellido: h.apellido, fecha_nacimiento: h.fechaNacimiento, grado: null, salon_preferido_id: null, necesidades_especiales: null }))
    expect(seleccionIngreso(hijos, ['n1'], salones, HOY)).toEqual([{ ninoId: 'n1', salonId: PREESCOLAR, nombre: 'Camila' }])
    expect(seleccionIngreso([{ ...hijos[0], fecha_nacimiento: '2010-01-01' }], ['n1'], salones, HOY)).toEqual([{ ninoId: 'n1', salonId: null, nombre: 'Camila' }])
  })
})
