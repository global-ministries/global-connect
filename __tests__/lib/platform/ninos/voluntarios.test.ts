import {
  agruparPorEquipo,
  ajustarFecha,
  aplicarCambios,
  contarPlanilla,
  filtrarPorNombre,
  leerPlanilla,
  leerTurnosVoluntarios,
  mensajeErrorMarcar,
  mensajeErrorPlanilla,
  pendientesDeEquipo,
  resolverServicioVoluntarios,
  separarPlanilla,
  siguienteEstado,
  ultimaFechaDeServicio,
  urlVoluntarios,
  type EstadoAsistencia,
  type FilaVoluntario,
  type TurnoVoluntarios,
} from '@/lib/platform/ninos/voluntarios'

function fila(parcial: Partial<FilaVoluntario> & Pick<FilaVoluntario, 'servicio_id'>): FilaVoluntario {
  return {
    nombre: 'Ana',
    apellido: 'Pérez',
    area_id: 'a1',
    area: 'Waumba Land',
    equipo_id: 'e1',
    equipo: 'Maternal',
    rol: 'Voluntario',
    esperado: true,
    sin_turno: false,
    estado: null,
    ...parcial,
  }
}

const turnos: TurnoVoluntarios[] = [
  { id: 't11', nombre: 'Domingo 11:00', hora: '11:00:00', orden: 2, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
  { id: 'tm', nombre: 'Miércoles 7:00', hora: '19:00:00', orden: 3, dia_semana: 3, campus_id: 'c1', campus: 'Campus Uno' },
]

describe('ultimaFechaDeServicio', () => {
  it('is today on the service weekday and the last one before otherwise', () => {
    expect(ultimaFechaDeServicio('2026-10-11', 0)).toBe('2026-10-11')
    expect(ultimaFechaDeServicio('2026-10-10', 0)).toBe('2026-10-04')
    expect(ultimaFechaDeServicio('2026-10-12', 0)).toBe('2026-10-11')
    expect(ultimaFechaDeServicio('2026-10-11', 3)).toBe('2026-10-07')
  })
})

describe('resolverServicioVoluntarios', () => {
  it('keeps a valid service from the URL', () => {
    expect(resolverServicioVoluntarios({ turno: 't11', fecha: '2026-09-27' }, turnos, '2026-10-10')).toEqual({
      turnoId: 't11',
      fecha: '2026-09-27',
    })
  })

  it('defaults to the first service and its last date, never a future Sunday', () => {
    expect(resolverServicioVoluntarios({}, turnos, '2026-10-10')).toEqual({ turnoId: 't9', fecha: '2026-10-04' })
    expect(resolverServicioVoluntarios({ fecha: '2026-13-40' }, turnos, '2026-10-11')).toEqual({ turnoId: 't9', fecha: '2026-10-11' })
  })

  it('has no service when there are no turnos', () => {
    expect(resolverServicioVoluntarios({}, [], '2026-10-10')).toEqual({ turnoId: null, fecha: '2026-10-04' })
  })
})

describe('ajustarFecha', () => {
  it('moves the date to the last day of a service on another weekday', () => {
    expect(ajustarFecha({ turnoId: 'tm', fecha: '2026-10-04' }, turnos, '2026-10-10')).toEqual({ turnoId: 'tm', fecha: '2026-10-07' })
  })

  it('keeps a date that already falls on the service weekday', () => {
    expect(ajustarFecha({ turnoId: 't11', fecha: '2026-09-27' }, turnos, '2026-10-10')).toEqual({ turnoId: 't11', fecha: '2026-09-27' })
  })
})

describe('leerPlanilla', () => {
  it('reads the RPC jsonb defensively', () => {
    expect(leerPlanilla(null)).toEqual({ turno: '', fecha: '', editable: false, areas: [], voluntarios: [] })
    const planilla = leerPlanilla({
      turno: 'Domingo 9:00',
      fecha: '2026-10-04',
      editable: true,
      areas: [{ id: 'a1', nombre: 'Waumba Land' }],
      voluntarios: [
        { ...fila({ servicio_id: 's1' }), estado: 'presente' },
        { ...fila({ servicio_id: 's2' }), estado: 'tarde' },
      ],
    })
    expect(planilla.editable).toBe(true)
    expect(planilla.areas).toEqual([{ id: 'a1', nombre: 'Waumba Land' }])
    expect(planilla.voluntarios.map((v) => v.estado)).toEqual(['presente', null])
  })
})

describe('leerTurnosVoluntarios', () => {
  it('keeps the service names of a single campus', () => {
    expect(leerTurnosVoluntarios(turnos).map((t) => t.nombre)).toEqual(['Domingo 11:00', 'Domingo 9:00', 'Miércoles 7:00'])
  })

  it('prefixes the campus when the caller marks in several campuses', () => {
    const dos = [...turnos.slice(0, 1), { ...turnos[1], id: 't9b', campus_id: 'c2', campus: 'Campus Dos' }]
    expect(leerTurnosVoluntarios(dos).map((t) => t.nombre)).toEqual(['Campus Uno · Domingo 11:00', 'Campus Dos · Domingo 9:00'])
  })

  it('ignores anything that is not a list', () => {
    expect(leerTurnosVoluntarios(null)).toEqual([])
  })
})

describe('roster helpers', () => {
  const filas = [
    fila({ servicio_id: 's1', estado: 'presente' }),
    fila({ servicio_id: 's2', estado: 'justificado' }),
    fila({ servicio_id: 's3', estado: 'ausente' }),
    fila({ servicio_id: 's4' }),
    fila({ servicio_id: 's5', esperado: false, estado: 'presente' }),
    fila({ servicio_id: 's6', esperado: false, sin_turno: true }),
  ]

  it('counts expected, each estado, unmarked expected and extras', () => {
    expect(contarPlanilla(filas)).toEqual({ esperados: 4, presentes: 2, avisos: 1, faltas: 1, sinMarcar: 1, extras: 1 })
  })

  it('splits expected, other and no-turno volunteers', () => {
    const { esperados, otros, sinTurno } = separarPlanilla(filas)
    expect(esperados.map((f) => f.servicio_id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(otros.map((f) => f.servicio_id)).toEqual(['s5'])
    expect(sinTurno.map((f) => f.servicio_id)).toEqual(['s6'])
  })

  it('lists the unmarked expected volunteers of a group for "Marcar el resto"', () => {
    expect(pendientesDeEquipo(filas)).toEqual(['s4'])
  })

  it('groups by equipo, both sorted in Spanish order', () => {
    const grupos = agruparPorEquipo([
      fila({ servicio_id: 'p1', equipo_id: 'e2', equipo: 'Producción', nombre: 'Zoe' }),
      fila({ servicio_id: 'm1', equipo_id: 'e1', equipo: 'Maternal', nombre: 'Óscar' }),
      fila({ servicio_id: 'm2', equipo_id: 'e1', equipo: 'Maternal', nombre: 'Ana' }),
    ])
    expect(grupos.map((g) => [g.equipo, g.filas.map((f) => f.servicio_id)])).toEqual([
      ['Maternal', ['m2', 'm1']],
      ['Producción', ['p1']],
    ])
  })

  it('filters by name ignoring case and accents, every word must match', () => {
    const lista = [fila({ servicio_id: 'a', nombre: 'José', apellido: 'Núñez' }), fila({ servicio_id: 'b', nombre: 'Ana', apellido: 'Pérez' })]
    expect(filtrarPorNombre(lista, '  jose ').map((f) => f.servicio_id)).toEqual(['a'])
    expect(filtrarPorNombre(lista, 'ana perez').map((f) => f.servicio_id)).toEqual(['b'])
    expect(filtrarPorNombre(lista, 'ana nunez')).toEqual([])
    expect(filtrarPorNombre(lista, '')).toBe(lista)
  })

  it('tapping the active estado clears it, another one replaces it', () => {
    expect(siguienteEstado('presente', 'presente')).toBeNull()
    expect(siguienteEstado('presente', 'ausente')).toBe('ausente')
    expect(siguienteEstado(null, 'justificado')).toBe('justificado')
  })

  it('applies estado changes to the given servicios only, without mutating', () => {
    const nuevas = aplicarCambios(filas, new Map<string, EstadoAsistencia | null>([['s4', 'ausente'], ['s1', null]]))
    expect(nuevas.map((f) => f.estado)).toEqual([null, 'justificado', 'ausente', 'ausente', 'presente', null])
    expect(filas[0].estado).toBe('presente')
  })
})

describe('messages and URL', () => {
  it('explains roster errors', () => {
    expect(mensajeErrorPlanilla({ code: '22023', message: 'fecha_invalida' })).toMatch(/no es día de este servicio/)
    expect(mensajeErrorPlanilla({ code: '42501', message: 'sin_autoridad' })).toMatch(/No tienes voluntarios/)
    expect(mensajeErrorPlanilla({ code: '22023', message: 'turno_invalido' })).toMatch(/ya no está activo/)
    expect(mensajeErrorPlanilla(null)).toBe('No se pudo cargar la lista de voluntarios.')
  })

  it('explains marking errors', () => {
    expect(mensajeErrorMarcar({ code: '22023', message: 'fecha_invalida' })).toMatch(/hasta 14 días atrás/)
    expect(mensajeErrorMarcar({ code: '42501', message: 'sin_autoridad' })).toMatch(/No tienes permiso/)
    expect(mensajeErrorMarcar({ code: '22023', message: 'servicio_invalido' })).toMatch(/ya no está en la lista/)
    expect(mensajeErrorMarcar({ message: 'Failed to fetch' })).toBe('No se pudo guardar la asistencia. Intenta de nuevo.')
  })

  it('keeps the service and the area in the URL', () => {
    expect(urlVoluntarios({ turnoId: 't9', fecha: '2026-10-04' }, 'a1')).toBe('/ninos/voluntarios?turno=t9&fecha=2026-10-04&area=a1')
    expect(urlVoluntarios({ turnoId: null, fecha: '2026-10-04' }, null)).toBe('/ninos/voluntarios?fecha=2026-10-04')
  })
})
