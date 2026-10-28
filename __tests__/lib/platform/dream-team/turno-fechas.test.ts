/**
 * turno-fechas — pure rules of dated shifts (T2 of odd/tasks/tlr-calendario-servicios.md, S3/S4).
 */
import {
  TEXTO_POR_FECHAS,
  alternarSeleccion,
  estadoErrorTurnoFecha,
  etiquetaFecha,
  horaDeFecha,
  idsParaGuardar,
  mensajeErrorTurnoFecha,
  separarFechas,
  textoSirven,
  todosSeleccionados,
  validarFechaTurno,
  validarServicioIds,
  type FechaTurno,
} from '@/lib/platform/dream-team/turno-fechas'

const S1 = '00000000-0000-4000-8000-000000000001'
const S2 = '00000000-0000-4000-8000-000000000002'
const S3 = '00000000-0000-4000-8000-000000000003'

function fecha(id: string, dia: string): FechaTurno {
  return { id, turnoId: 't', fecha: dia, hora: null, nota: null, servidores: [] }
}

describe('separarFechas', () => {
  it('lists upcoming dates first (soonest first) and past ones apart (latest first); today is upcoming', () => {
    const { proximas, pasadas } = separarFechas(
      [fecha('a', '2026-11-22'), fecha('b', '2026-10-04'), fecha('c', '2026-10-26'), fecha('d', '2026-11-08'), fecha('e', '2026-09-13')],
      '2026-10-26',
    )
    expect(proximas.map((f) => f.id)).toEqual(['c', 'd', 'a'])
    expect(pasadas.map((f) => f.id)).toEqual(['b', 'e'])
  })
})

describe('etiquetaFecha', () => {
  it('names the weekday, day and month in Spanish, with the year only when it is not this one', () => {
    expect(etiquetaFecha('2026-11-08', '2026-10-26')).toBe('Domingo 8 nov')
    expect(etiquetaFecha('2026-10-31', '2026-10-26')).toBe('Sábado 31 oct')
    expect(etiquetaFecha('2027-01-03', '2026-10-26')).toBe('Domingo 3 ene 2027')
  })
})

describe('horaDeFecha', () => {
  it('uses the hour of the date when set, the one of the shift otherwise', () => {
    expect(horaDeFecha({ hora: '10:30:00' }, '09:00')).toBe('10:30')
    expect(horaDeFecha({ hora: null }, '09:00')).toBe('09:00')
  })
})

describe('selection model ("Todos" and one by one)', () => {
  it('"Todos" selects every assigned volunteer in one step', () => {
    expect([...todosSeleccionados([S1, S2, S3])]).toEqual([S1, S2, S3])
  })

  it('toggles one volunteer without touching the rest', () => {
    const todos = todosSeleccionados([S1, S2, S3])
    const sinS2 = alternarSeleccion(todos, S2)
    expect([...sinS2].sort()).toEqual([S1, S3])
    expect([...alternarSeleccion(sinS2, S2)].sort()).toEqual([S1, S2, S3])
    expect([...todos].sort()).toEqual([S1, S2, S3])
  })

  it('counts who serves', () => {
    expect(textoSirven(2, 3)).toBe('2 de 3 sirven')
    expect(textoSirven(0, 0)).toBe('0 de 0 sirven')
  })

  it('saves the chosen visible volunteers and keeps those serving that this screen does not list', () => {
    expect(idsParaGuardar(new Set([S1]), [S1, S2], [S2, S3])).toEqual([S1, S3])
    expect(idsParaGuardar(new Set(), [S1, S2], [S1])).toEqual([])
  })
})

describe('validarFechaTurno', () => {
  it('normalizes a date with optional hour and note', () => {
    expect(validarFechaTurno({ fecha: '2026-11-08', hora: '9:30', nota: '  Bautizos ' })).toEqual({
      ok: true,
      datos: { fecha: '2026-11-08', hora: '09:30', nota: 'Bautizos' },
    })
    expect(validarFechaTurno({ fecha: '2026-11-08', hora: '', nota: '' })).toEqual({
      ok: true,
      datos: { fecha: '2026-11-08', hora: null, nota: null },
    })
  })

  it('rejects a missing or impossible date, a bad hour or a long note', () => {
    expect(validarFechaTurno({})).toEqual({ ok: false, message: 'Elige una fecha válida.' })
    expect(validarFechaTurno({ fecha: '2026-02-30' })).toEqual({ ok: false, message: 'Elige una fecha válida.' })
    expect(validarFechaTurno({ fecha: '2026-11-08', hora: '25:00' })).toEqual({
      ok: false,
      message: 'La hora debe tener el formato HH:MM.',
    })
    expect(validarFechaTurno({ fecha: '2026-11-08', nota: 'x'.repeat(201) })).toEqual({
      ok: false,
      message: 'La nota no puede superar los 200 caracteres.',
    })
  })
})

describe('validarServicioIds', () => {
  it('accepts a deduplicated list of uuids, empty included', () => {
    expect(validarServicioIds([S1, S2, S1])).toEqual({ ok: true, servicioIds: [S1, S2] })
    expect(validarServicioIds([])).toEqual({ ok: true, servicioIds: [] })
  })

  it('rejects anything else', () => {
    expect(validarServicioIds(undefined)).toEqual({ ok: false, message: 'servicioIds debe ser una lista.' })
    expect(validarServicioIds([S1, 'x'])).toEqual({ ok: false, message: 'servicioIds contiene un identificador inválido.' })
  })
})

describe('mensajeErrorTurnoFecha', () => {
  it('maps every error of the database functions to Spanish', () => {
    expect(mensajeErrorTurnoFecha({ code: '42501', message: 'sin_autoridad' })).toBe(
      'No tienes permiso para planificar las fechas de este turno.',
    )
    expect(mensajeErrorTurnoFecha({ code: '22023', message: 'turno_invalido' })).toBe(
      'El turno no existe, está desactivado o no es por fechas.',
    )
    expect(mensajeErrorTurnoFecha({ code: '22023', message: 'fecha_invalida' })).toBe('Elige una fecha válida.')
    expect(mensajeErrorTurnoFecha({ code: '23505', message: 'fecha_duplicada' })).toBe('Ese turno ya tiene esa fecha planificada.')
    expect(mensajeErrorTurnoFecha({ code: '22023', message: 'turno_fecha_invalida' })).toBe(
      'Esa fecha ya no existe. Recarga la página.',
    )
    expect(mensajeErrorTurnoFecha({ code: '22023', message: 'servicio_invalido' })).toBe(
      'Alguna persona ya no tiene asignado este turno. Recarga la página.',
    )
    expect(mensajeErrorTurnoFecha({ code: '22023', message: 'servicios_invalidos' })).toBe(
      'Alguna persona ya no tiene asignado este turno. Recarga la página.',
    )
  })

  it('falls back on the code, then on a generic message', () => {
    expect(mensajeErrorTurnoFecha({ code: '42501', message: 'permission denied' })).toBe(
      'No tienes permiso para planificar las fechas de este turno.',
    )
    expect(mensajeErrorTurnoFecha({ message: 'boom' })).toBe('No se pudo guardar. Intenta de nuevo.')
    expect(mensajeErrorTurnoFecha(null)).toBe('No se pudo guardar. Intenta de nuevo.')
  })

  it('names a dated shift "Por fechas"', () => {
    expect(TEXTO_POR_FECHAS).toBe('Por fechas')
  })
})

describe('estadoErrorTurnoFecha', () => {
  it('maps a refusal to the HTTP status of the routes', () => {
    expect(estadoErrorTurnoFecha({ code: '42501', message: 'sin_autoridad' })).toBe(403)
    expect(estadoErrorTurnoFecha({ code: '23505', message: 'fecha_duplicada' })).toBe(409)
    expect(estadoErrorTurnoFecha({ code: '22023', message: 'turno_invalido' })).toBe(422)
    expect(estadoErrorTurnoFecha({ code: '23514', message: 'check' })).toBe(422)
    expect(estadoErrorTurnoFecha({ message: 'boom' })).toBe(500)
  })
})
