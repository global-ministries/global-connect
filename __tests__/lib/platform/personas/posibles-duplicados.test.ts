/**
 * Personas — the «¿Es alguna de estas personas?» check before registering a
 * person (odd/tasks/dream-team-estructura-correcciones.md, T4, S6b): parsing
 * the request, the RPC arguments, the mapping of personas_posibles_duplicados
 * rows and the short name and reason texts the panel shows.
 */
import {
  mapPosiblesDuplicados,
  parsePosiblesDuplicados,
  rpcArgsPosiblesDuplicados,
  textoCoincidencia,
  urlPosiblesDuplicados,
} from '@/lib/platform/personas/posibles-duplicados'
import { nombreCorto } from '@/lib/platform/personas/nombre'
import { nombreCorto as nombreCortoCompartido } from '@/lib/platform/nombres'

describe('nombreCorto', () => {
  it('is the first nombre and the first apellido', () => {
    expect(nombreCorto('Isaac José', 'Paez Cordero')).toBe('Isaac Paez')
  })
  it('trims and collapses blanks, and survives missing parts', () => {
    expect(nombreCorto('  Kelly  ', '  Chaviel ')).toBe('Kelly Chaviel')
    expect(nombreCorto('Ana', null)).toBe('Ana')
    expect(nombreCorto(null, 'Pérez')).toBe('Pérez')
    expect(nombreCorto('', '')).toBe('')
  })
  it('is the shared short name of the org chart: the first surname keeps its particles, a couple stays whole', () => {
    expect(nombreCorto('María', 'De la Cruz Pérez')).toBe('María De la Cruz')
    expect(nombreCorto('Carlos y Ana', 'Rojas')).toBe('Carlos y Ana Rojas')
    expect(nombreCorto).toBe(nombreCortoCompartido)
  })
})

describe('parsePosiblesDuplicados', () => {
  const params = (q: Record<string, string>) => new URLSearchParams(q)

  it('requires nombre and apellido', () => {
    expect(parsePosiblesDuplicados(params({ nombre: 'Ana' }))).toEqual({ error: 'Nombre y apellido son requeridos' })
    expect(parsePosiblesDuplicados(params({ nombre: ' ', apellido: 'Pérez' }))).toEqual({ error: 'Nombre y apellido son requeridos' })
  })

  it('trims the values and keeps empty cédula and teléfono as null', () => {
    expect(parsePosiblesDuplicados(params({ nombre: ' Ana ', apellido: ' Pérez ', cedula: ' ', telefono: '' }))).toEqual({
      nombre: 'Ana',
      apellido: 'Pérez',
      cedula: null,
      telefono: null,
    })
  })

  it('normalizes the cédula like the registration does and keeps the phone as typed', () => {
    expect(parsePosiblesDuplicados(params({ nombre: 'Ana', apellido: 'Pérez', cedula: 'V-12.345.678', telefono: '0414 123 4567' }))).toEqual({
      nombre: 'Ana',
      apellido: 'Pérez',
      cedula: '12345678',
      telefono: '0414 123 4567',
    })
  })

  it('refuses values over 100 characters', () => {
    expect(parsePosiblesDuplicados(params({ nombre: 'a'.repeat(101), apellido: 'Pérez' }))).toEqual({ error: 'Datos inválidos' })
  })
})

describe('rpcArgsPosiblesDuplicados', () => {
  it('leaves out the optional arguments that are null', () => {
    expect(rpcArgsPosiblesDuplicados({ nombre: 'Ana', apellido: 'Pérez', cedula: null, telefono: null })).toEqual({
      p_nombre: 'Ana',
      p_apellido: 'Pérez',
    })
    expect(rpcArgsPosiblesDuplicados({ nombre: 'Ana', apellido: 'Pérez', cedula: '123', telefono: '0414' })).toEqual({
      p_nombre: 'Ana',
      p_apellido: 'Pérez',
      p_cedula: '123',
      p_telefono: '0414',
    })
  })
})

describe('urlPosiblesDuplicados', () => {
  it('builds the GET url with only the typed values', () => {
    expect(urlPosiblesDuplicados({ nombre: 'Ana María', apellido: 'Pérez', cedula: '', telefono: ' 0414 ' })).toBe(
      '/api/dream-team/usuarios/posibles-duplicados?nombre=Ana+Mar%C3%ADa&apellido=P%C3%A9rez&telefono=0414',
    )
  })
})

describe('mapPosiblesDuplicados', () => {
  it('maps the rows (reasons strongest first: cédula, teléfono, nombre) and drops malformed ones', () => {
    expect(
      mapPosiblesDuplicados([
        { id: 'u1', nombre: 'Isaac José', apellido: 'Paez Cordero', campus: 'Valencia', servicios: 2, tiene_cuenta: true, coincide: ['nombre', 'telefono'] },
        { id: 'u2', nombre: 'Ana', apellido: 'Pérez', campus: null, servicios: null, tiene_cuenta: false, coincide: ['cedula', 'otra'] },
        { nombre: 'Sin id' },
        null,
      ]),
    ).toEqual([
      { id: 'u1', nombre: 'Isaac José', apellido: 'Paez Cordero', nombreCorto: 'Isaac Paez', campus: 'Valencia', servicios: 2, tieneCuenta: true, coincide: ['telefono', 'nombre'] },
      { id: 'u2', nombre: 'Ana', apellido: 'Pérez', nombreCorto: 'Ana Pérez', campus: null, servicios: 0, tieneCuenta: false, coincide: ['cedula'] },
    ])
  })

  it('is empty for anything that is not a list', () => {
    expect(mapPosiblesDuplicados(null)).toEqual([])
    expect(mapPosiblesDuplicados({})).toEqual([])
  })
})

describe('textoCoincidencia', () => {
  it('says why each person matched, cédula first', () => {
    expect(textoCoincidencia(['nombre', 'cedula'])).toBe('Misma cédula · Nombre parecido')
    expect(textoCoincidencia(['telefono'])).toBe('Mismo teléfono')
    expect(textoCoincidencia([])).toBe('')
  })
})
