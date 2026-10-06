import {
  DATOS_VACIOS,
  coincideRuta,
  cuerpoAltaPersona,
  datosBasicosCompletos,
  esMenorDeEdad,
  rutaDeEquipo,
} from '@/components/dream-team/asignador/logica'

describe('asignador logica', () => {
  const basicos = { ...DATOS_VACIOS, nombre: 'Ana', apellido: 'Pérez', genero: 'Femenino' }

  it('requires the birth date only without a cedula', () => {
    expect(datosBasicosCompletos(basicos)).toBe(false)
    expect(datosBasicosCompletos({ ...basicos, fechaNacimiento: '2017-01-01' })).toBe(true)
    expect(datosBasicosCompletos({ ...basicos, cedula: '123' })).toBe(true)
    expect(datosBasicosCompletos({ ...basicos, cedula: '123', nombre: ' ' })).toBe(false)
  })

  it('tells a minor by the birth date', () => {
    const hoy = new Date(2026, 9, 6)
    expect(esMenorDeEdad('2017-01-01', hoy)).toBe(true)
    expect(esMenorDeEdad('2008-10-07', hoy)).toBe(true)
    expect(esMenorDeEdad('2008-10-06', hoy)).toBe(false)
    expect(esMenorDeEdad('', hoy)).toBe(false)
  })

  it('sends the representative only when one was found, and the baptism date only when baptized', () => {
    const cuerpo = cuerpoAltaPersona({ ...basicos, bautizado: 'no', fechaBautizo: '2020-01-01' }, 'e', 'r')
    expect(cuerpo).toMatchObject({ equipoId: 'e', rolId: 'r', bautizado: false, fechaBautizo: '', representanteId: null, representanteTipo: null })
    const conRep = cuerpoAltaPersona({ ...basicos, representante: { id: 'p', nombre: 'P', apellido: 'Q' }, tipoRepresentante: 'abuelo' }, 'e', 'r')
    expect(conRep).toMatchObject({ bautizado: null, representanteId: 'p', representanteTipo: 'abuelo' })
  })

  it('builds the path from an explicit ruta, else from the label', () => {
    expect(rutaDeEquipo({ etiqueta: '— Desmontaje', ruta: ['Waumba Land', 'Desmontaje'] })).toEqual(['Waumba Land', 'Desmontaje'])
    expect(rutaDeEquipo({ etiqueta: 'Waumba Land › Bebés' })).toEqual(['Waumba Land', 'Bebés'])
    expect(rutaDeEquipo({ etiqueta: '—— Parejas' })).toEqual(['Parejas'])
  })

  it('filters paths ignoring case and accents', () => {
    expect(coincideRuta(['Waumba Land', 'Bebés'], 'bebes')).toBe(true)
    expect(coincideRuta(['Waumba Land', 'Bebés'], 'coro')).toBe(false)
    expect(coincideRuta(['X'], '  ')).toBe(true)
  })
})
