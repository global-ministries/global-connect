/**
 * Pure rules of the public reservation (T5b of odd/tasks/talleres-reserva-publica.md):
 * catalog parsing, labels, cédula, the new-person ficha and the request parsers.
 */
import {
  estadoCupo,
  formatoCedula,
  horaLegible,
  normalizarCedula,
  parseAvisame,
  parseCatalogo,
  parseCrear,
  parseIdentificar,
  parseTallerPublico,
  parseVerificar,
  tituloEdicion,
  validarFicha,
  type EdicionPublica,
} from '@/lib/platform/talleres/reserva-publica'

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const crudo = {
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  descripcion: 'Seis encuentros',
  tipo: 'individual',
  vinculo: null,
  genero_requerido: 'Femenino',
  duracion_minutos: 90,
  ediciones: [
    {
      id: EDICION,
      fecha_inicio: '2026-11-19',
      fecha_fin: '2027-01-07',
      cierre_inscripcion: '2026-11-17',
      lugar: 'Salón 4',
      clases: 6,
      hora: '19:00',
      cupo: 30,
      lugares_libres: 6,
      lleno: false,
      facilitadores: ['Andreína', 'Mariela'],
    },
    { id: 'no-uuid', fecha_inicio: '2026-11-21' },
  ],
}

const edicion = (cambios: Partial<EdicionPublica> = {}): EdicionPublica => ({
  id: EDICION,
  fechaInicio: '2026-11-19',
  fechaFin: null,
  cierreInscripcion: null,
  lugar: null,
  clases: 6,
  hora: '19:00',
  cupo: 30,
  lugaresLibres: 14,
  lleno: false,
  facilitadores: [],
  ...cambios,
})

describe('parseTallerPublico', () => {
  it('maps the RPC json and drops ediciones without a valid id', () => {
    const t = parseTallerPublico(crudo)
    expect(t).toEqual({
      slug: 'mujer-de-hoy',
      nombre: 'Mujer de Hoy',
      descripcion: 'Seis encuentros',
      pareja: false,
      vinculo: null,
      generoRequerido: 'Femenino',
      duracionMinutos: 90,
      ediciones: [
        {
          id: EDICION,
          fechaInicio: '2026-11-19',
          fechaFin: '2027-01-07',
          cierreInscripcion: '2026-11-17',
          lugar: 'Salón 4',
          clases: 6,
          hora: '19:00',
          cupo: 30,
          lugaresLibres: 6,
          lleno: false,
          facilitadores: ['Andreína', 'Mariela'],
        },
      ],
    })
  })

  it('reads a pareja taller and rejects a value without slug or nombre', () => {
    expect(parseTallerPublico({ ...crudo, tipo: 'pareja', vinculo: 'matrimonio' })).toMatchObject({ pareja: true, vinculo: 'matrimonio' })
    expect(parseTallerPublico({ ...crudo, slug: '' })).toBeNull()
    expect(parseTallerPublico(null)).toBeNull()
  })

  it('parseCatalogo keeps only valid talleres', () => {
    expect(parseCatalogo([crudo, { nombre: 'x' }, 3]).map((t) => t.slug)).toEqual(['mujer-de-hoy'])
    expect(parseCatalogo('nada')).toEqual([])
  })
})

describe('labels', () => {
  it('formats the hour in 12 h Spanish style', () => {
    expect(horaLegible('19:00')).toBe('7:00 p.m.')
    expect(horaLegible('08:30')).toBe('8:30 a.m.')
    expect(horaLegible('12:00')).toBe('12:00 p.m.')
    expect(horaLegible(null)).toBeNull()
  })

  it('titles an edición with its weekday and hour', () => {
    expect(tituloEdicion(edicion())).toBe('Jueves · 7:00 p.m.')
    expect(tituloEdicion(edicion({ hora: null }))).toBe('Jueves')
  })

  it('never says the status with color alone and warns when few places remain', () => {
    expect(estadoCupo(edicion({ lleno: true, lugaresLibres: 0 }))).toEqual({ tono: 'danger', etiqueta: 'Lleno', ocupado: 1 })
    expect(estadoCupo(edicion({ lugaresLibres: 3 }))).toMatchObject({ tono: 'warning', etiqueta: 'Quedan 3 lugares' })
    expect(estadoCupo(edicion({ lugaresLibres: 1 }))).toMatchObject({ etiqueta: 'Queda 1 lugar' })
    expect(estadoCupo(edicion({ lugaresLibres: 14 }))).toMatchObject({ tono: 'success', etiqueta: 'Quedan 14 de 30 lugares' })
    expect(estadoCupo(edicion({ cupo: null, lugaresLibres: null }))).toEqual({ tono: 'success', etiqueta: 'Inscripción abierta', ocupado: null })
  })
})

describe('cédula', () => {
  it('normalizes what people type and rejects the rest', () => {
    expect(normalizarCedula('V-15.598.745')).toBe('15598745')
    expect(normalizarCedula(' 15598745 ')).toBe('15598745')
    expect(normalizarCedula('e-1234567')).toBe('E1234567')
    expect(normalizarCedula('12345')).toBeNull()
    expect(normalizarCedula('123456789')).toBeNull()
    expect(normalizarCedula('abc')).toBeNull()
  })

  it('formats it for display', () => {
    expect(formatoCedula('15598745')).toBe('V-15.598.745')
    expect(formatoCedula('E1234567')).toBe('E-1.234.567')
  })
})

describe('validarFicha', () => {
  const ficha = {
    cedula: '27441903',
    nombre: 'Daniela',
    apellido: 'Mujica',
    fecha_nacimiento: '1995-04-02',
    telefono: '0414 123 4567',
    email: 'daniela@example.com',
    genero: 'Femenino',
  }
  const hoy = '2026-11-10'

  it('accepts a complete adult ficha', () => {
    expect(validarFicha(ficha, { hoy, contactoRequerido: true })).toEqual({})
  })

  it('names every missing or malformed field', () => {
    const errores = validarFicha({ ...ficha, apellido: ' ', email: 'daniela@', fecha_nacimiento: '', genero: '' }, { hoy, contactoRequerido: true })
    expect(Object.keys(errores).sort()).toEqual(['apellido', 'email', 'fecha_nacimiento', 'genero'])
  })

  it('refuses a minor and the other género when the taller requires one', () => {
    expect(validarFicha({ ...ficha, fecha_nacimiento: '2010-01-01' }, { hoy, contactoRequerido: true }).fecha_nacimiento).toMatch(/18 años/)
    expect(validarFicha({ ...ficha, genero: 'Masculino' }, { hoy, contactoRequerido: true, generoRequerido: 'Femenino' }).genero).toBe(
      'Este taller es solo para mujeres.',
    )
  })

  it('lets a new spouse leave email and phone empty', () => {
    expect(validarFicha({ ...ficha, email: '', telefono: '' }, { hoy, contactoRequerido: false })).toEqual({})
  })
})

describe('request parsers', () => {
  it('parseIdentificar reads the honeypot and normalizes nothing it cannot trust', () => {
    expect(parseIdentificar({ edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '155', sitio_web: '' })).toEqual({
      edicionId: EDICION,
      slug: 'mujer-de-hoy',
      cedula: '155',
      honeypot: false,
    })
    expect(parseIdentificar({ edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '1', sitio_web: 'spam' })?.honeypot).toBe(true)
    expect(parseIdentificar({ edicionId: 'x', slug: 'a', cedula: '1' })).toBeNull()
    expect(parseIdentificar({ edicionId: EDICION, slug: 'A B', cedula: '1' })).toBeNull()
  })

  it('parseVerificar requires a uuid and six digits', () => {
    expect(parseVerificar({ codigoId: EDICION, codigo: '123456' })).toEqual({ codigoId: EDICION, codigo: '123456' })
    expect(parseVerificar({ codigoId: EDICION, codigo: '12345' })).toBeNull()
  })

  it('parseCrear accepts exactly one principal shape and keeps only known ficha keys', () => {
    const token = 'a'.repeat(43)
    expect(parseCrear({ edicionId: EDICION, principal: { token } })).toEqual({
      edicionId: EDICION,
      principal: { token },
      pareja: null,
      vinculo: null,
      honeypot: false,
    })
    const r = parseCrear({
      edicionId: EDICION,
      principal: { ficha_nueva: { nombre: 'Ana', extra: 'x' } },
      pareja: { pendiente_cedula: '12345678' },
      vinculo: 'matrimonio',
    })
    expect(r?.principal).toEqual({ ficha_nueva: { cedula: '', nombre: 'Ana', apellido: '', fecha_nacimiento: '', telefono: '', email: '', genero: '' } })
    expect(r?.pareja).toEqual({ pendiente_cedula: '12345678' })
    expect(r?.vinculo).toBe('matrimonio')
    expect(parseCrear({ edicionId: EDICION, principal: { token, por_verificar: { cedula: '1' } } })).toBeNull()
    expect(parseCrear({ edicionId: EDICION, principal: { token: 'corto' } })).toBeNull()
  })

  it('parseAvisame reads nombre, email and the honeypot', () => {
    expect(parseAvisame({ edicionId: EDICION, nombre: 'Ana', email: 'ana@example.com', sitio_web: 'x' })).toEqual({
      edicionId: EDICION,
      nombre: 'Ana',
      email: 'ana@example.com',
      honeypot: true,
    })
    expect(parseAvisame({ edicionId: EDICION, nombre: 3, email: 'a' })).toBeNull()
  })
})
