/**
 * The "Año escolar" editor of the person detail (C6b4, S16): parsing
 * estudiantes_ficha, the options of both selects, the draft, the validation
 * and the Spanish error messages.
 */
import {
  MENSAJES_ERROR_FICHA,
  borradorInicial,
  cambiarAnioActual,
  codigoErrorFicha,
  mensajeErrorFicha,
  opcionesAnioActual,
  opcionesAnioFinal,
  parsearFicha,
  resumenFicha,
  sinCambios,
  validarFicha,
  type FichaEstudiante,
} from '@/lib/platform/estudiantes/ficha'

const ESCALA = [
  { numero: 1, etiqueta: '1er año', ambito: 'Transit' },
  { numero: 2, etiqueta: '2do año', ambito: 'Transit' },
  { numero: 3, etiqueta: '3er año', ambito: 'Transit' },
  { numero: 4, etiqueta: '4to año', ambito: 'Inside Out' },
  { numero: 5, etiqueta: '5to año', ambito: 'Inside Out' },
  { numero: 6, etiqueta: '6to año', ambito: 'Inside Out' },
]

const RPC = {
  persona_id: 'p1',
  campus_id: 'c1',
  anio_actual: 2,
  anio_final: 6,
  egresado: false,
  puede_editar: true,
  escala: ESCALA,
}

const ficha = (extra: Partial<FichaEstudiante> = {}): FichaEstudiante => ({ ...(parsearFicha(RPC) as FichaEstudiante), ...extra })

describe('parsearFicha', () => {
  it('reads the RPC jsonb', () => {
    expect(parsearFicha(RPC)).toEqual({
      personaId: 'p1',
      campusId: 'c1',
      anioActual: 2,
      anioFinal: 6,
      egresado: false,
      puedeEditar: true,
      escala: ESCALA,
    })
  })

  it('keeps NULL years and leaves malformed scale rows out', () => {
    expect(
      parsearFicha({ ...RPC, anio_actual: null, anio_final: null, escala: [ESCALA[0], { numero: 'x', etiqueta: 'Mal' }, null, { numero: 2 }] }),
    ).toMatchObject({ anioActual: null, anioFinal: null, escala: [ESCALA[0]] })
  })

  it('cannot edit without a scale even when the RPC says so', () => {
    expect(parsearFicha({ ...RPC, escala: [] })).toMatchObject({ puedeEditar: false })
  })

  it.each([[null], ['texto'], [[]], [{ ...RPC, persona_id: null }], [{ ...RPC, campus_id: 3 }]])('returns null for %p', (valor) => {
    expect(parsearFicha(valor)).toBeNull()
  })
})

describe('options', () => {
  it('"Año actual" offers the whole scale', () => {
    expect(opcionesAnioActual(ficha())).toEqual(ESCALA.map((e) => ({ valor: String(e.numero), etiqueta: e.etiqueta })))
  })

  it('"Termina el colegio en" offers only years from the año actual on', () => {
    expect(opcionesAnioFinal(ficha(), '4')).toEqual([
      { valor: '4', etiqueta: '4to año' },
      { valor: '5', etiqueta: '5to año' },
      { valor: '6', etiqueta: '6to año' },
    ])
  })

  it('offers the whole scale while no año actual is chosen', () => {
    expect(opcionesAnioFinal(ficha(), '')).toHaveLength(6)
  })
})

describe('resumenFicha', () => {
  it('names both years', () => {
    expect(resumenFicha(ficha())).toBe('2do año · termina en 6to año')
  })

  it('names only the current year without año final', () => {
    expect(resumenFicha(ficha({ anioFinal: null }))).toBe('2do año')
  })

  it('says when there is none', () => {
    expect(resumenFicha(ficha({ anioActual: null, anioFinal: null }))).toBe('Sin año escolar')
  })

  it('says when the person graduated', () => {
    expect(resumenFicha(ficha({ anioActual: 6, egresado: true, puedeEditar: false }))).toBe('6to año · egresó')
  })
})

describe('draft', () => {
  it('starts from the stored years', () => {
    expect(borradorInicial(ficha())).toEqual({ anioActual: '2', anioFinal: '6' })
  })

  it('without ficha: no año actual and the last year of the scale as año final', () => {
    expect(borradorInicial(ficha({ anioActual: null, anioFinal: null }))).toEqual({ anioActual: '', anioFinal: '6' })
  })

  it('keeps a still valid año final when the año actual changes', () => {
    expect(cambiarAnioActual(ficha(), { anioActual: '2', anioFinal: '5' }, '4')).toEqual({ anioActual: '4', anioFinal: '5' })
  })

  it('moves an año final that became earlier to the last year of the scale', () => {
    expect(cambiarAnioActual(ficha(), { anioActual: '2', anioFinal: '3' }, '5')).toEqual({ anioActual: '5', anioFinal: '6' })
  })

  it('knows when nothing changed', () => {
    expect(sinCambios(ficha(), { anioActual: '2', anioFinal: '6' })).toBe(true)
    expect(sinCambios(ficha(), { anioActual: '3', anioFinal: '6' })).toBe(false)
  })
})

describe('validarFicha', () => {
  it('returns both numbers', () => {
    expect(validarFicha(ficha(), { anioActual: '3', anioFinal: '5' })).toEqual({ ok: true, anioActual: 3, anioFinal: 5 })
  })

  it.each([
    [{ anioActual: '', anioFinal: '6' }, 'Elige el año actual.'],
    [{ anioActual: '9', anioFinal: '6' }, 'Elige el año actual de la escala de tu campus.'],
    [{ anioActual: '3', anioFinal: '' }, 'Elige el año en que termina el colegio.'],
    [{ anioActual: '3', anioFinal: '9' }, 'Elige el año en que termina el colegio de la escala de tu campus.'],
    [{ anioActual: '5', anioFinal: '4' }, 'El año en que termina el colegio no puede ser anterior al año actual.'],
  ])('rejects %o', (borrador, mensaje) => {
    expect(validarFicha(ficha(), borrador)).toEqual({ ok: false, mensaje })
  })
})

describe('errors', () => {
  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 'sin_autoridad', 'No tienes permiso para editar el año escolar de esta persona.'],
    [{ code: '22023', message: 'anio_invalido' }, 'anio_invalido', 'Elige años de la escala de tu campus. El año final no puede ser anterior al actual.'],
    [{ code: '22023', message: 'anio_no_aplica' }, 'anio_no_aplica', 'The Living Room no lleva año escolar.'],
    [{ code: '42501', message: 'permission denied' }, 'sin_autoridad', 'No tienes permiso para editar el año escolar de esta persona.'],
  ])('maps %o', (error, codigo, mensaje) => {
    expect(codigoErrorFicha(error)).toBe(codigo)
    expect(mensajeErrorFicha(error)).toBe(mensaje)
  })

  it('falls back to a generic message', () => {
    expect(codigoErrorFicha({ code: 'XX000', message: 'boom' })).toBeNull()
    expect(mensajeErrorFicha({ code: 'XX000', message: 'boom' })).toBe('No se pudo guardar el año escolar. Inténtalo de nuevo.')
    expect(mensajeErrorFicha(null, 'Otro')).toBe('Otro')
  })

  it('has a message for invalid input', () => {
    expect(MENSAJES_ERROR_FICHA.datos_invalidos).toBe('Revisa los datos e inténtalo de nuevo.')
  })
})
