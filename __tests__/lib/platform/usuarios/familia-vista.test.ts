/**
 * Mi familia view model (S15 of odd/tasks/sistema-diseno-v2.md, T11b-1):
 * relation labels by gender, the RPC answer parsers, the tuteo message of
 * every error code, the steps of the "Agregar familiar" sheet and the
 * validation of the homonym datum and of the relative without an account.
 */
import {
  CODIGOS_ERROR_FAMILIA,
  datosSinCuenta,
  etiquetaRelacion,
  menorDe13,
  mensajeFamilia,
  nombreCandidato,
  parseCandidatos,
  parseMiFamilia,
  pasoHoja,
  prellenarSinCuenta,
  textoEspera,
  textoRecibida,
  validarSinCuenta,
  validarVerificacion,
  type FormSinCuenta,
} from '@/lib/platform/usuarios/familia-vista'

const HOY = '2026-10-31'
const FORM: FormSinCuenta = { nombre: 'Rafael', apellido: 'Colmenárez', fechaNacimiento: '1958-03-12', cedula: '', telefono: '', genero: '' }

describe('etiquetaRelacion', () => {
  it('follows the relative gender as in the prototype', () => {
    expect(etiquetaRelacion('conyuge', 'Masculino')).toBe('Esposo')
    expect(etiquetaRelacion('conyuge', 'Femenino')).toBe('Esposa')
    expect(etiquetaRelacion('padre', 'Femenino')).toBe('Madre')
    expect(etiquetaRelacion('hijo', 'Femenino')).toBe('Hija')
    expect(etiquetaRelacion('hermano', 'Masculino')).toBe('Hermano')
    expect(etiquetaRelacion('abuelo', 'Femenino')).toBe('Abuela')
    expect(etiquetaRelacion('tio', 'Femenino')).toBe('Tía')
    expect(etiquetaRelacion('otro_familiar', 'Femenino')).toBe('Familiar')
  })

  it('is neutral when the gender is unknown or Otro', () => {
    expect(etiquetaRelacion('padre', null)).toBe('Padre o madre')
    expect(etiquetaRelacion('hermano', 'Otro')).toBe('Hermano o hermana')
    expect(etiquetaRelacion('conyuge', null)).toBe('Cónyuge')
  })
})

describe('parseMiFamilia', () => {
  it('maps the three lists of familia_mis_solicitudes', () => {
    const r = parseMiFamilia({
      ok: true,
      familiares: [{ relacion_id: 'r1', usuario_id: 'u2', relacion: 'conyuge', nombre: 'José', apellido: 'Pérez', genero: 'Masculino', cuenta: true, puedo_editar: false, es_nino: false }],
      enviadas: [{ id: 's1', tipo_relacion: 'hermano', nombre: 'Luis', apellido: 'Barrios R.', genero: 'Masculino', espera: 'persona', creado_en: '2026-10-29T10:00:00Z' }],
      recibidas: [{ id: 's2', relacion: 'hermano', nombre: 'Lisbeth', apellido: 'Rodríguez', genero: 'Femenino', creado_en: '2026-10-31T08:00:00Z' }],
    })
    expect(r).toEqual({
      familiares: [{ relacionId: 'r1', usuarioId: 'u2', relacion: 'conyuge', nombre: 'José', apellido: 'Pérez', genero: 'Masculino', cuenta: true, puedoEditar: false, esNino: false }],
      enviadas: [{ id: 's1', tipo: 'hermano', nombre: 'Luis', apellido: 'Barrios R.', genero: 'Masculino', espera: 'persona', creadoEn: '2026-10-29T10:00:00Z' }],
      recibidas: [{ id: 's2', relacion: 'hermano', nombre: 'Lisbeth', apellido: 'Rodríguez', genero: 'Femenino', creadoEn: '2026-10-31T08:00:00Z' }],
    })
  })

  it('returns null for an error answer and drops malformed rows', () => {
    expect(parseMiFamilia({ ok: false, codigo: 'SIN_SESION' })).toBeNull()
    expect(parseMiFamilia(null)).toBeNull()
    expect(parseMiFamilia({ ok: true, familiares: [{ relacion_id: 'r1' }], enviadas: 'x', recibidas: [] })).toEqual({ familiares: [], enviadas: [], recibidas: [] })
  })
})

describe('search results', () => {
  it('parses masked candidates and shows nombres + primer apellido + inicial', () => {
    const [c] = parseCandidatos({ ok: true, resultados: [{ token: 't1', nombres: 'Lisbeth', primer_apellido: 'Rodríguez', inicial_segundo_apellido: 'G', campus: 'Barquisimeto', homonimo: true }] })
    expect(c).toEqual({ token: 't1', nombres: 'Lisbeth', primerApellido: 'Rodríguez', inicialSegundoApellido: 'G', campus: 'Barquisimeto', homonimo: true })
    expect(nombreCandidato(c)).toBe('Lisbeth Rodríguez G.')
    expect(nombreCandidato({ ...c, inicialSegundoApellido: '' })).toBe('Lisbeth Rodríguez')
  })

  it('keeps at most 8 results', () => {
    const fila = (i: number) => ({ token: `t${i}`, nombres: 'Ana', primer_apellido: 'Gil', inicial_segundo_apellido: '', campus: 'Cabudare', homonimo: false })
    expect(parseCandidatos({ ok: true, resultados: Array.from({ length: 10 }, (_, i) => fila(i)) })).toHaveLength(8)
  })
})

describe('mensajeFamilia', () => {
  it('has a tuteo message for every RPC error code', () => {
    for (const codigo of CODIGOS_ERROR_FAMILIA) {
      const m = mensajeFamilia(codigo)
      expect(m).not.toBe(mensajeFamilia('DESCONOCIDO'))
      // No voseo forms in UI copy.
      expect(m).not.toMatch(/\b(querés|podés|tenés|escribí|revisá|intentá|vos)\b/i)
    }
    expect(CODIGOS_ERROR_FAMILIA).toEqual(expect.arrayContaining([
      'BUSQUEDA_CORTA', 'LIMITE_BUSQUEDAS', 'LIMITE_INTENTOS', 'LIMITE_DIARIO', 'VERIFICACION_REQUERIDA', 'YA_SOLICITADO',
      'YA_RELACIONADOS', 'YA_TIENE_CONYUGE', 'USAR_MIS_HIJOS', 'DATOS_INVALIDOS', 'CAMPO_NO_PERMITIDO', 'SIN_CAMPUS',
      'NO_ENCONTRADO', 'TIPO_INVALIDO', 'YA_RESUELTO', 'SIN_SESION', 'SIN_FICHA',
    ]))
  })

  it('names specific cases clearly and falls back to a generic message', () => {
    expect(mensajeFamilia('BUSQUEDA_CORTA')).toBe('Escribe al menos 3 letras del nombre.')
    expect(mensajeFamilia('YA_TIENE_CONYUGE')).toBe('Ya hay un cónyuge registrado. Cada persona puede tener uno solo.')
    expect(mensajeFamilia(null)).toBe('No se pudo completar. Inténtalo de nuevo.')
  })
})

describe('texts of the requests', () => {
  it('"X dice que es tu hermana" uses the solicitante gender', () => {
    expect(textoRecibida({ id: 's', relacion: 'hermano', nombre: 'Lisbeth', apellido: 'Rodríguez', genero: 'Femenino', creadoEn: '' })).toBe(
      'Lisbeth Rodríguez dice que es tu hermana',
    )
  })

  it('a sent request waits for the person or the campus', () => {
    const base = { id: 's', tipo: 'hermano' as const, nombre: 'Luis', apellido: 'Barrios', genero: null, creadoEn: '' }
    expect(textoEspera({ ...base, espera: 'persona' })).toBe('Esperando que Luis confirme')
    expect(textoEspera({ ...base, espera: 'campus' })).toBe('Esperando la revisión de tu campus')
  })
})

describe('pasoHoja', () => {
  it('asks the relation first', () => {
    expect(pasoHoja({ relacion: null, hijoMayor: false, camino: null })).toBe('relacion')
  })

  it('hijo asks "Ir a Mis hijos" or "Tiene 13 años o más" before the paths', () => {
    expect(pasoHoja({ relacion: 'hijo', hijoMayor: false, camino: null })).toBe('hijo')
    expect(pasoHoja({ relacion: 'hijo', hijoMayor: true, camino: null })).toBe('camino')
  })

  it('then the chosen path', () => {
    expect(pasoHoja({ relacion: 'hermano', hijoMayor: false, camino: null })).toBe('camino')
    expect(pasoHoja({ relacion: 'hermano', hijoMayor: false, camino: 'buscar' })).toBe('buscar')
    expect(pasoHoja({ relacion: 'padre', hijoMayor: false, camino: 'sincuenta' })).toBe('sincuenta')
  })
})

describe('validarVerificacion', () => {
  it('accepts day + month or the last 4 cédula digits', () => {
    expect(validarVerificacion({ modo: 'fecha', dia: '29', mes: '2', ultimos4: '' })).toEqual({ ok: true, datos: { dia: 29, mes: 2 } })
    expect(validarVerificacion({ modo: 'cedula', dia: '', mes: '', ultimos4: '6789' })).toEqual({ ok: true, datos: { ultimos4: '6789' } })
  })

  it('refuses impossible dates and anything but 4 digits', () => {
    expect(validarVerificacion({ modo: 'fecha', dia: '31', mes: '4', ultimos4: '' })).toEqual({ ok: false, error: 'Elige un día y un mes que existan.' })
    expect(validarVerificacion({ modo: 'fecha', dia: '', mes: '3', ultimos4: '' })).toEqual({ ok: false, error: 'Elige un día y un mes que existan.' })
    expect(validarVerificacion({ modo: 'cedula', dia: '', mes: '', ultimos4: '12a4' })).toEqual({ ok: false, error: 'Escribe los últimos 4 dígitos de su cédula.' })
  })
})

describe('validarSinCuenta', () => {
  it('requires nombre, apellido and fecha de nacimiento', () => {
    const r = validarSinCuenta({ ...FORM, nombre: ' ', apellido: '', fechaNacimiento: '' }, 'padre', HOY)
    expect(r.errores).toEqual({
      nombre: 'Escribe su nombre.',
      apellido: 'Escribe su apellido.',
      fechaNacimiento: 'Escribe su fecha de nacimiento.',
    })
    expect(r.menor).toBe(false)
  })

  it('refuses a future birth date', () => {
    expect(validarSinCuenta({ ...FORM, fechaNacimiento: '2026-11-01' }, 'padre', HOY).errores).toEqual({
      fechaNacimiento: 'La fecha de nacimiento no puede ser futura.',
    })
  })

  it('under 13 goes to Mis hijos', () => {
    const r = validarSinCuenta({ ...FORM, fechaNacimiento: '2014-01-01' }, 'hijo', HOY)
    expect(r.menor).toBe(true)
    expect(r.errores.fechaNacimiento).toBe('Tiene menos de 13 años: regístralo en Mis hijos.')
    expect(menorDe13('2013-11-01', HOY)).toBe(true)
    expect(menorDe13('2013-10-31', HOY)).toBe(false)
  })

  it('passes a complete form and builds only the allowed keys', () => {
    expect(validarSinCuenta(FORM, 'padre', HOY)).toEqual({ errores: {}, menor: false })
    expect(datosSinCuenta({ ...FORM, nombre: ' Rafael ', cedula: 'V-12345678', genero: 'Masculino' })).toEqual({
      nombre: 'Rafael', apellido: 'Colmenárez', fecha_nacimiento: '1958-03-12', cedula: 'V-12345678', genero: 'Masculino',
    })
  })

  it('pre-fills the form from the search text', () => {
    expect(prellenarSinCuenta('  Rafael  Colmenárez Pérez ')).toEqual({ nombre: 'Rafael', apellido: 'Colmenárez Pérez' })
  })
})
