import {
  estadoInscripcion,
  fechaDomingo,
  loginProximoPaso,
  mensajeInscrito,
  mensajePendiente,
  parseEdicionesProximoPaso,
  rutaProximoPaso,
  validarRegistro,
} from '@/lib/platform/talleres/proximo-paso-registro'

const fila = {
  edicion_id: 'ed-1',
  nombre: 'Diciembre 2026',
  fecha_inicio: '2026-12-06',
  fecha_fin: '2026-12-27',
  cupo_restante: null,
  clases: [
    { numero: 2, tema: 'Intimidad con Dios', fecha: '2026-12-13' },
    { numero: 1, tema: 'Sígueme', fecha: '2026-12-06' },
  ],
}

describe('parseEdicionesProximoPaso', () => {
  it('maps the RPC rows and sorts the clases by numero', () => {
    expect(parseEdicionesProximoPaso([fila])).toEqual([
      {
        id: 'ed-1',
        nombre: 'Diciembre 2026',
        fechaInicio: '2026-12-06',
        fechaFin: '2026-12-27',
        cupoRestante: null,
        clases: [
          { numero: 1, tema: 'Sígueme', fecha: '2026-12-06' },
          { numero: 2, tema: 'Intimidad con Dios', fecha: '2026-12-13' },
        ],
      },
    ])
  })

  it('keeps a numeric cupo and drops rows without id or fecha de inicio', () => {
    const resultado = parseEdicionesProximoPaso([
      { ...fila, cupo_restante: 3 },
      { ...fila, edicion_id: null },
      { ...fila, edicion_id: 'ed-2', fecha_inicio: null },
      'basura',
    ])
    expect(resultado.map((e) => [e.id, e.cupoRestante])).toEqual([['ed-1', 3]])
  })

  it.each([null, undefined, {}, 'x'])('reads %j as no ediciones', (raw) => {
    expect(parseEdicionesProximoPaso(raw)).toEqual([])
  })
})

describe('routes', () => {
  it('builds the public page with the edición preselected', () => {
    expect(rutaProximoPaso()).toBe('/proximo-paso')
    expect(rutaProximoPaso('ed 1')).toBe('/proximo-paso?edicion=ed%201')
  })

  it('sends the login back to the public page', () => {
    expect(loginProximoPaso('ed-1')).toBe(`/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-1')}`)
    expect(loginProximoPaso(null)).toBe(`/?redirect=${encodeURIComponent('/proximo-paso')}`)
  })
})

describe('copy', () => {
  it('names the Sunday without a timezone shift', () => {
    expect(fechaDomingo('2026-12-06')).toBe('6 de diciembre')
    expect(fechaDomingo('2027-01-03')).toBe('3 de enero')
  })

  it('confirms the inscripción with the month and the first clase', () => {
    expect(mensajeInscrito({ nombre: 'Diciembre 2026', fechaInicio: '2026-12-06' })).toBe(
      'Quedaste inscrito en Próximo Paso — Diciembre 2026, primera clase el domingo 6 de diciembre',
    )
  })
})

describe('estadoInscripcion', () => {
  it('reads only an explicit aprobado as inscrito', () => {
    expect(estadoInscripcion({ ok: true, inscripcion_id: 'i', estado: 'aprobado' })).toBe('inscrito')
    expect(estadoInscripcion({ estado: 'aprobado' })).toBe('inscrito')
  })

  it.each([{ estado: 'pendiente' }, { estado: 'retirado' }, {}, null, undefined, 'aprobado'])(
    'never claims more than pendiente for %j',
    (raw) => {
      expect(estadoInscripcion(raw)).toBe('pendiente')
    },
  )

  it('titles a pendiente enrollment without claiming it is done', () => {
    expect(mensajePendiente({ nombre: 'Diciembre 2026' })).toBe('Recibimos tu inscripción en Próximo Paso — Diciembre 2026')
  })
})

describe('validarRegistro', () => {
  const valido = {
    nombre: '  Ana   María ',
    apellido: 'Pérez',
    telefono: '0412-555.12.34',
    email: ' Ana@Example.COM ',
    password: 'secreto123',
  }

  it('normalizes a valid registration', () => {
    expect(validarRegistro(valido)).toEqual({
      ok: true,
      datos: {
        nombre: 'Ana María',
        apellido: 'Pérez',
        telefono: '04125551234',
        email: 'ana@example.com',
        password: 'secreto123',
      },
    })
  })

  it('accepts an international number written with +', () => {
    const r = validarRegistro({ ...valido, telefono: '+1 (305) 555-0101' })
    expect(r.ok && r.datos.telefono).toBe('+13055550101')
  })

  it('names every invalid field', () => {
    expect(validarRegistro({ nombre: ' ', apellido: '', telefono: '123', email: 'ana@', password: 'corta' })).toEqual({
      ok: false,
      errores: {
        nombre: 'Escribe tu nombre.',
        apellido: 'Escribe tu apellido.',
        telefono: 'Escribe tu teléfono, por ejemplo 0412 123 4567.',
        email: 'Revisa tu correo: no parece una dirección válida.',
        password: 'La contraseña debe tener al menos 8 caracteres.',
      },
    })
  })

  it.each([null, 'x', 42])('rejects %j as every field missing', (raw) => {
    const r = validarRegistro(raw)
    expect(r.ok).toBe(false)
    expect(Object.keys(!r.ok ? r.errores : {})).toEqual(['nombre', 'apellido', 'telefono', 'email', 'password'])
  })
})
