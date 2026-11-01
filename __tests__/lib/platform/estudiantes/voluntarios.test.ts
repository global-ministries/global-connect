import {
  calcularVistaVoluntarios,
  leerTurnosVoluntariosEstudiantes,
  opcionesFechaVoluntarios,
  resolverServicioVoluntariosEstudiantes,
  urlVoluntariosEstudiantes,
  FILTROS_VOLUNTARIOS_INICIALES,
  type FiltrosVoluntarios,
  type TurnoVoluntariosEstudiantes,
} from '@/lib/platform/estudiantes/voluntarios'
import type { FilaVoluntario, Planilla } from '@/lib/platform/ninos/voluntarios'

/**
 * Volunteer attendance of Transit, Inside Out and The Living Room (C5 of
 * odd/tasks/estudiantes-fase-b.md): which service and date open, the dates a
 * service offers (weekly: its weekday; dated: its planned dates) and the view
 * of the roster (ámbito, equipo cards, metrics that filter, search).
 */

const HOY = '2026-10-31' // Saturday

const SEMANAL: TurnoVoluntariosEstudiantes = {
  id: 't1',
  nombre: 'Domingo 9:00',
  hora: '09:00:00',
  orden: 1,
  diaSemana: 0,
  campusId: 'c1',
  campus: 'Barquisimeto',
  tipo: 'semanal',
  fechas: [],
}
const FECHAS: TurnoVoluntariosEstudiantes = {
  ...SEMANAL,
  id: 't3',
  nombre: 'The Living Room',
  hora: '19:00:00',
  orden: 3,
  tipo: 'fechas',
  fechas: ['2026-10-28', '2026-10-14'],
}

describe('leerTurnosVoluntariosEstudiantes', () => {
  const fila = { id: 't1', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Barquisimeto', tipo: 'semanal', fechas: [] }

  it('reads the RPC rows with their tipo and planned dates', () => {
    expect(
      leerTurnosVoluntariosEstudiantes([fila, { ...fila, id: 't3', nombre: 'The Living Room', orden: 3, tipo: 'fechas', fechas: ['2026-10-28', 'x', '2026-10-14'] }]),
    ).toEqual([SEMANAL, { ...FECHAS, hora: '09:00:00' }])
  })

  it('treats an unknown tipo as weekly and ignores junk', () => {
    expect(leerTurnosVoluntariosEstudiantes([{ ...fila, tipo: 'otro', fechas: null }])[0]).toMatchObject({ tipo: 'semanal', fechas: [] })
    expect(leerTurnosVoluntariosEstudiantes(null)).toEqual([])
    expect(leerTurnosVoluntariosEstudiantes([null, 3])).toEqual([])
  })

  it('prefixes the campus when there is more than one', () => {
    const turnos = leerTurnosVoluntariosEstudiantes([fila, { ...fila, id: 't9', campus_id: 'c2', campus: 'Cabudare' }])
    expect(turnos.map((t) => t.nombre)).toEqual(['Barquisimeto · Domingo 9:00', 'Cabudare · Domingo 9:00'])
  })
})

describe('resolverServicioVoluntariosEstudiantes', () => {
  const turnos = [SEMANAL, FECHAS]

  it('opens the first service on its last date by default', () => {
    expect(resolverServicioVoluntariosEstudiantes({}, turnos, HOY)).toEqual({ turnoId: 't1', fecha: '2026-10-25' })
  })

  it('keeps a past date on the weekday of a weekly service', () => {
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't1', fecha: '2026-10-18' }, turnos, HOY)).toEqual({ turnoId: 't1', fecha: '2026-10-18' })
  })

  it('moves a weekly service off its weekday, or in the future, to its last date', () => {
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't1', fecha: '2026-10-20' }, turnos, HOY).fecha).toBe('2026-10-25')
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't1', fecha: '2026-11-01' }, turnos, HOY).fecha).toBe('2026-10-25')
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't1', fecha: 'ayer' }, turnos, HOY).fecha).toBe('2026-10-25')
  })

  it('keeps a planned date of a dated service, else its newest one', () => {
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't3', fecha: '2026-10-14' }, turnos, HOY)).toEqual({ turnoId: 't3', fecha: '2026-10-14' })
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't3', fecha: '2026-10-25' }, turnos, HOY)).toEqual({ turnoId: 't3', fecha: '2026-10-28' })
  })

  it('has no date for a dated service without planned dates, and nothing without services', () => {
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't3' }, [{ ...FECHAS, fechas: [] }], HOY)).toEqual({ turnoId: 't3', fecha: null })
    expect(resolverServicioVoluntariosEstudiantes({ turno: 't1' }, [], HOY)).toEqual({ turnoId: null, fecha: null })
  })

  it('falls back to the first service for an unknown one', () => {
    expect(resolverServicioVoluntariosEstudiantes({ turno: 'zz' }, turnos, HOY).turnoId).toBe('t1')
  })
})

describe('opcionesFechaVoluntarios', () => {
  it('offers the last eight days of a weekly service, newest first', () => {
    const opciones = opcionesFechaVoluntarios(SEMANAL, '2026-10-25', HOY)
    expect(opciones).toHaveLength(8)
    expect(opciones[0]).toEqual({ valor: '2026-10-25', etiqueta: 'Domingo 25 oct' })
    expect(opciones[7].valor).toBe('2026-09-06')
  })

  it('keeps an older selected date at the end', () => {
    expect(opcionesFechaVoluntarios(SEMANAL, '2026-08-02', HOY).map((o) => o.valor).slice(-2)).toEqual(['2026-09-06', '2026-08-02'])
  })

  it('offers the planned dates of a dated service', () => {
    expect(opcionesFechaVoluntarios(FECHAS, '2026-10-28', HOY)).toEqual([
      { valor: '2026-10-28', etiqueta: 'Miércoles 28 oct' },
      { valor: '2026-10-14', etiqueta: 'Miércoles 14 oct' },
    ])
    expect(opcionesFechaVoluntarios(undefined, null, HOY)).toEqual([])
  })
})

describe('urlVoluntariosEstudiantes', () => {
  it('keeps turno, fecha and ámbito in the query', () => {
    expect(urlVoluntariosEstudiantes({ turnoId: 't1', fecha: '2026-10-25' }, 'a1')).toBe('/estudiantes/voluntarios?turno=t1&fecha=2026-10-25&ambito=a1')
    expect(urlVoluntariosEstudiantes({ turnoId: 't3', fecha: null }, null)).toBe('/estudiantes/voluntarios?turno=t3')
  })
})

const fila = (parche: Partial<FilaVoluntario>): FilaVoluntario => ({
  servicio_id: 's',
  nombre: 'Ana',
  apellido: 'Pérez',
  area_id: 'transit',
  area: 'Transit',
  equipo_id: 'log',
  equipo: 'Logística',
  rol: 'voluntario',
  esperado: true,
  sin_turno: false,
  estado: null,
  ...parche,
})

const PLANILLA: Planilla = {
  turno: 'Domingo 9:00',
  fecha: '2026-10-25',
  editable: true,
  areas: [
    { id: 'transit', nombre: 'Transit' },
    { id: 'io', nombre: 'Inside Out' },
  ],
  voluntarios: [
    fila({ servicio_id: 's1', nombre: 'Ana', estado: 'presente' }),
    fila({ servicio_id: 's2', nombre: 'Bruno' }),
    fila({ servicio_id: 's3', nombre: 'Carla', equipo_id: 'prod', equipo: 'Producción', estado: 'ausente' }),
    fila({ servicio_id: 's4', nombre: 'Diego', equipo_id: 'prod', equipo: 'Producción', esperado: false, estado: 'presente' }),
    fila({ servicio_id: 's5', nombre: 'Elena', esperado: false, sin_turno: true }),
    fila({ servicio_id: 's6', nombre: 'Fede', area_id: 'io', area: 'Inside Out', equipo_id: 'io-log', estado: 'justificado' }),
  ],
}

const vista = (parche: Partial<FiltrosVoluntarios> = {}) => calcularVistaVoluntarios(PLANILLA, { ...FILTROS_VOLUNTARIOS_INICIALES, ...parche })

describe('calcularVistaVoluntarios', () => {
  it('opens the first ámbito, and falls back to it for an unknown one', () => {
    expect(vista().ambitoId).toBe('transit')
    expect(vista({ ambito: 'io' }).ambitoId).toBe('io')
    expect(vista({ ambito: 'zz' }).ambitoId).toBe('transit')
  })

  it('counts the ámbito: metrics over the expected volunteers, extras in the hint', () => {
    const v = vista()
    expect(v.metricas.map((m) => [m.id, m.valor, m.total, m.activa])).toEqual([
      ['sin-marcar', 1, 3, false],
      ['presentes', 2, 3, false],
      ['avisos', 0, 3, false],
      ['faltas', 1, 3, false],
    ])
    expect(v.metricas[1].pista).toBe('1 sin turno ese día')
    expect(v.contadores).toMatchObject({ esperados: 3, sinMarcar: 1 })
  })

  it('groups the expected volunteers by equipo with their pending ones, the others apart', () => {
    const v = vista()
    expect(v.esperados.map((g) => [g.equipo, g.filas.map((f) => f.nombre), g.marcados, g.total, g.pendientes])).toEqual([
      ['Logística', ['Ana', 'Bruno'], 1, 2, ['s2']],
      ['Producción', ['Carla'], 1, 1, []],
    ])
    expect(v.otros.map((f) => f.nombre)).toEqual(['Diego'])
    expect(v.sinTurno.map((f) => f.nombre)).toEqual(['Elena'])
    expect(v.visibles).toBe(5)
  })

  it('offers the equipo cards and narrows to one', () => {
    expect(vista().equipos.map((e) => [e.equipo, e.total, e.sinMarcar])).toEqual([
      ['Logística', 3, 1],
      ['Producción', 2, 0],
    ])
    const v = vista({ equipo: 'prod' })
    expect(v.equipoId).toBe('prod')
    expect(v.esperados.map((g) => g.equipo)).toEqual(['Producción'])
    expect(vista({ equipo: 'zz' }).equipoId).toBe('todos')
  })

  it('filters by the pressed metric and by name', () => {
    const sinMarcar = vista({ metrica: 'sin-marcar' })
    expect(sinMarcar.metricas[0].activa).toBe(true)
    expect(sinMarcar.esperados.flatMap((g) => g.filas.map((f) => f.nombre))).toEqual(['Bruno'])
    expect(sinMarcar.otros).toEqual([])
    expect(vista({ metrica: 'presentes' }).visibles).toBe(2)
    expect(vista({ q: 'elena' }).sinTurno.map((f) => f.nombre)).toEqual(['Elena'])
    expect(vista({ q: 'elena' }).visibles).toBe(1)
  })

  it('keeps the pending volunteers of an equipo even when a filter hides them', () => {
    expect(vista({ q: 'ana' }).esperados[0]).toMatchObject({ equipo: 'Logística', pendientes: ['s2'], marcados: 1, total: 2 })
  })

  it('is empty without an ámbito', () => {
    const v = calcularVistaVoluntarios({ ...PLANILLA, areas: [], voluntarios: [] }, FILTROS_VOLUNTARIOS_INICIALES)
    expect(v).toMatchObject({ ambitoId: null, esperados: [], otros: [], sinTurno: [], visibles: 0 })
  })
})
