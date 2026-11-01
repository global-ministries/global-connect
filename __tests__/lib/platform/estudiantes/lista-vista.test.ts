/**
 * The leader list view model (C3b of odd/tasks/estudiantes-fase-b.md;
 * artboards 01 / 05 of design/estudiantes-asistencia): which meeting opens,
 * the The Living Room pills, filters and counts, the history dots and the
 * back control. Every person is fictitious.
 */
import {
  alternarFiltro,
  contarLista,
  destinoAtras,
  elegirSesion,
  estadoFila,
  fechaCorta,
  fechaLarga,
  grupoUnico,
  filtrarLista,
  lineaReunion,
  mensajeMarca,
  pastillasReunion,
  pistaDia,
  puntosHistorial,
  subtituloFila,
  type FilaVista,
} from '@/lib/platform/estudiantes/lista-vista'
import type { GrupoMio, Historial, PersonaLista, Sesion } from '@/lib/platform/estudiantes/lista-datos'

const T9 = 't-9'
const T11 = 't-11'

function sesion(fecha: string, extra: Partial<Sesion> = {}): Sesion {
  return {
    fecha,
    turnoId: T9,
    turno: 'Domingo 9:00',
    hora: '09:00:00',
    reunionId: null,
    lugar: null,
    presentes: 0,
    ausentes: 0,
    visitantes: 0,
    marcados: 0,
    ...extra,
  }
}

function persona(id: string, nombre: string, extra: Partial<PersonaLista> = {}): PersonaLista {
  return {
    personaId: id,
    nombre,
    genero: 'Femenino',
    telefono: '0414 555 0100',
    fechaNacimiento: null,
    estado: 'miembro',
    desde: '2026-01-11',
    anio: 2,
    anioEtiqueta: '2do año',
    marca: null,
    marcadoAt: null,
    visitas: 0,
    sugerirConfirmar: false,
    representantes: [],
    ...extra,
  }
}

const fila = (p: PersonaLista, fecha = '2026-10-25'): FilaVista => ({ persona: p, marca: p.marca, marcadoAt: p.marcadoAt, estado: estadoFila(p, p.marca, fecha) })

describe('elegirSesion', () => {
  const sesiones = [sesion('2026-10-25'), sesion('2026-10-25', { turnoId: T11, turno: 'Domingo 11:00', hora: '11:00:00' }), sesion('2026-10-18')]

  it('Transit / Inside Out opens the newest row', () => {
    expect(elegirSesion(sesiones, 'estudiantes', {}, '2026-10-29')).toEqual({ fecha: '2026-10-25', turnoId: T9 })
  })

  it('keeps a requested meeting only when it is one of the rows', () => {
    expect(elegirSesion(sesiones, 'estudiantes', { fecha: '2026-10-25', turno: T11 }, '2026-10-29')).toEqual({ fecha: '2026-10-25', turnoId: T11 })
    expect(elegirSesion(sesiones, 'estudiantes', { fecha: '2026-10-18', turno: T9 }, '2026-10-29')).toEqual({ fecha: '2026-10-18', turnoId: T9 })
    expect(elegirSesion(sesiones, 'estudiantes', { fecha: '2026-10-11', turno: T9 }, '2026-10-29')).toEqual({ fecha: '2026-10-25', turnoId: T9 })
    expect(elegirSesion(sesiones, 'estudiantes', { fecha: 'mañana' }, '2026-10-29')).toEqual({ fecha: '2026-10-25', turnoId: T9 })
  })

  it('returns null for Transit without any meeting to mark', () => {
    expect(elegirSesion([], 'estudiantes', {}, '2026-10-29')).toBeNull()
  })

  it('The Living Room takes any past date without turno, the newest meeting by default, or today', () => {
    const tlr = [sesion('2026-10-29', { turnoId: null, turno: null, hora: null }), sesion('2026-10-22', { turnoId: null, turno: null, hora: null })]
    expect(elegirSesion(tlr, 'the_living_room', {}, '2026-10-29')).toEqual({ fecha: '2026-10-29', turnoId: null })
    expect(elegirSesion(tlr, 'the_living_room', { fecha: '2026-09-03', turno: T9 }, '2026-10-29')).toEqual({ fecha: '2026-09-03', turnoId: null })
    expect(elegirSesion(tlr, 'the_living_room', { fecha: '2026-11-05' }, '2026-10-29')).toEqual({ fecha: '2026-10-29', turnoId: null })
    expect(elegirSesion([], 'the_living_room', {}, '2026-10-29')).toEqual({ fecha: '2026-10-29', turnoId: null })
  })
})

describe('the The Living Room meeting pills', () => {
  const tlr = ['2026-10-29', '2026-10-22', '2026-10-15', '2026-10-08'].map((f) => sesion(f, { turnoId: null, turno: null, hora: null }))

  it('offers this week’s meeting and the two before, today marked', () => {
    expect(pastillasReunion(tlr, '2026-10-29')).toEqual([
      { fecha: '2026-10-29', etiqueta: 'Jue 29 oct · hoy' },
      { fecha: '2026-10-22', etiqueta: 'Jue 22 oct' },
      { fecha: '2026-10-15', etiqueta: 'Jue 15 oct' },
    ])
  })

  it('does not repeat a date', () => {
    expect(pastillasReunion([tlr[1], tlr[1], tlr[2]], '2026-10-29').map((p) => p.fecha)).toEqual(['2026-10-22', '2026-10-15'])
  })

  it('hints the weekly day', () => {
    expect(pistaDia(4)).toBe('Cada jueves')
    expect(pistaDia(0)).toBe('Cada domingo')
    expect(pistaDia(null)).toBeNull()
  })
})

describe('dates', () => {
  it('reads like the artboards', () => {
    expect(fechaLarga('2026-10-25')).toBe('Domingo 25 oct')
    expect(fechaCorta('2026-10-29')).toBe('Jue 29 oct')
    expect(lineaReunion({ fecha: '2026-10-25', hora: '09:00:00', ambito: 'Transit' })).toBe('Domingo 25 oct · 9:00 · Transit')
    expect(lineaReunion({ fecha: '2026-10-29', hora: '19:30:00', ambito: 'The Living Room' })).toBe('Jueves 29 oct · 19:30 · The Living Room')
    expect(lineaReunion({ fecha: '2026-10-29', hora: null, ambito: 'The Living Room' })).toBe('Jueves 29 oct · The Living Room')
  })
})

describe('estadoFila', () => {
  it('a first-time visitor registered at this meeting is "nueva"', () => {
    const nueva = persona('v3', 'Luciana Ferrer', { estado: 'visitante', desde: '2026-10-25', visitas: 1, marca: 'presente' })
    expect(estadoFila(nueva, 'presente', '2026-10-25')).toBe('nueva')
    expect(estadoFila(nueva, null, '2026-10-25')).toBe('sin')
    expect(estadoFila(nueva, 'presente', '2026-11-01')).toBe('presente')
  })

  it('a member reads their mark', () => {
    const p = persona('p1', 'Ana Lucía Briceño')
    expect(estadoFila(p, 'presente', '2026-10-25')).toBe('presente')
    expect(estadoFila(p, 'ausente', '2026-10-25')).toBe('ausente')
    expect(estadoFila(p, null, '2026-10-25')).toBe('sin')
  })
})

describe('filters and counts', () => {
  const filas = [
    fila(persona('p1', 'Camila Herrera', { marca: 'presente' })),
    fila(persona('p2', 'Ana Lucía Briceño', { marca: 'ausente' })),
    fila(persona('p3', 'Daniela Colmenares')),
    fila(persona('v1', 'Sofía Linares', { estado: 'visitante', visitas: 3, marca: 'presente', desde: '2026-10-11' })),
    fila(persona('v3', 'Luciana Ferrer', { estado: 'visitante', visitas: 1, marca: 'presente', desde: '2026-10-25' })),
  ]

  it('the title counts split the list: presentes, ausentes, sin marcar and the new visitors', () => {
    expect(contarLista(filas)).toEqual({ todos: 5, sin: 1, presentes: 2, ausentes: 1, visitantes: 2, nuevas: 1 })
  })

  it('Todos keeps both sections in A–Z order', () => {
    const { integrantes, visitantes } = filtrarLista(filas, 'todos', '')
    expect(integrantes.map((f) => f.persona.nombre)).toEqual(['Ana Lucía Briceño', 'Camila Herrera', 'Daniela Colmenares'])
    expect(visitantes.map((f) => f.persona.nombre)).toEqual(['Luciana Ferrer', 'Sofía Linares'])
  })

  it('each pill narrows the rows', () => {
    const nombres = (filtro: Parameters<typeof filtrarLista>[1]) => {
      const r = filtrarLista(filas, filtro, '')
      return [...r.integrantes, ...r.visitantes].map((f) => f.persona.personaId)
    }
    expect(nombres('sin')).toEqual(['p3'])
    expect(nombres('presentes')).toEqual(['p1', 'v1'])
    expect(nombres('ausentes')).toEqual(['p2'])
    expect(nombres('visitantes')).toEqual(['v3', 'v1'])
  })

  it('the search ignores accents and case', () => {
    const r = filtrarLista(filas, 'todos', 'SOFIA')
    expect(r.integrantes).toEqual([])
    expect(r.visitantes.map((f) => f.persona.nombre)).toEqual(['Sofía Linares'])
  })

  it('a second tap on the active pill goes back to Todos', () => {
    expect(alternarFiltro('todos', 'sin')).toBe('sin')
    expect(alternarFiltro('sin', 'sin')).toBe('todos')
    expect(alternarFiltro('sin', 'ausentes')).toBe('ausentes')
  })
})

describe('row text', () => {
  it('names the visit, the time of the mark or the missing mark', () => {
    expect(subtituloFila(fila(persona('v3', 'Luciana Ferrer', { estado: 'visitante', visitas: 1, marca: 'presente', desde: '2026-10-25' })))).toBe('Primera vez hoy')
    expect(subtituloFila(fila(persona('v2', 'Gabriela Montilla', { estado: 'visitante', visitas: 2, marca: 'presente', desde: '2026-10-18' })))).toBe('2.ª visita')
    expect(subtituloFila(fila(persona('p1', 'Camila Herrera', { marca: 'presente', marcadoAt: '2026-10-25T13:12:00Z' })))).toBe('Marcado · 9:12')
    expect(subtituloFila(fila(persona('p3', 'Daniela Colmenares')))).toBe('Sin marcar todavía')
  })

  it('the toast after a mark uses the first name', () => {
    expect(mensajeMarca('Camila Herrera', 'presente')).toBe('Camila: presente · guardado')
    expect(mensajeMarca('Ana Lucía Briceño', 'ausente')).toBe('Ana: ausente · guardado')
    expect(mensajeMarca('Daniela Colmenares', null)).toBe('Daniela: sin marcar')
  })
})

describe('puntosHistorial', () => {
  const historial: Historial = {
    reuniones: [
      { reunionId: 'r1', fecha: '2026-10-04' },
      { reunionId: 'r2', fecha: '2026-10-11' },
      { reunionId: 'r3', fecha: '2026-10-18' },
      { reunionId: 'r4', fecha: '2026-10-25' },
    ],
    estados: { p1: ['presente', 'ausente', null, 'presente'] },
  }

  it('gives one dot per meeting, oldest first, and the presentes', () => {
    expect(puntosHistorial(historial, 'p1')).toEqual({
      puntos: [
        { fecha: '2026-10-04', estado: 'presente' },
        { fecha: '2026-10-11', estado: 'ausente' },
        { fecha: '2026-10-18', estado: null },
        { fecha: '2026-10-25', estado: 'presente' },
      ],
      presentes: 2,
      total: 4,
    })
  })

  it('someone without marks gets empty dots; no meetings, no dots', () => {
    expect(puntosHistorial(historial, 'p9').puntos.map((p) => p.estado)).toEqual([null, null, null, null])
    expect(puntosHistorial({ reuniones: [], estados: {} }, 'p1')).toEqual({ puntos: [], presentes: 0, total: 0 })
  })
})

describe('destinoAtras', () => {
  it('goes back to the group drawer, the live view or Estudiantes', () => {
    expect(destinoAtras({ desde: 'grupos', grupoId: 'g2', esRaiz: true })).toEqual({ etiqueta: 'Grupos', href: '/estudiantes/grupos?grupo=g2' })
    expect(destinoAtras({ desde: 'vivo', grupoId: 'g2', esRaiz: true })).toEqual({ etiqueta: 'En vivo', href: '/estudiantes/vivo' })
    expect(destinoAtras({ desde: undefined, grupoId: 'g2', esRaiz: false })).toEqual({ etiqueta: 'Estudiantes', href: '/estudiantes' })
    expect(destinoAtras({ desde: 'otro', grupoId: 'g2', esRaiz: false })).toEqual({ etiqueta: 'Estudiantes', href: '/estudiantes' })
  })

  it('a leader with a single group is at the root: no back control without an origin', () => {
    expect(destinoAtras({ desde: undefined, grupoId: 'g2', esRaiz: true })).toBeNull()
  })
})

describe('grupoUnico', () => {
  const mio = (id: string, puedeGestionar = false): GrupoMio => ({
    grupoId: id,
    nombre: id,
    campusId: 'c1',
    ambito: 'Transit',
    experiencia: 'estudiantes',
    subareaId: 's1',
    subarea: 'Grupos de Chicas',
    detalle: '2do año',
    soyLider: true,
    puedeVerVivo: false,
    puedeGestionar,
    miembros: 0,
    visitantes: 0,
    lideres: [],
  })

  it('only a leader with one group and no management goes straight to it', () => {
    expect(grupoUnico([mio('g2')])?.grupoId).toBe('g2')
    expect(grupoUnico([mio('g2', true)])).toBeNull()
    expect(grupoUnico([mio('g2'), mio('g3')])).toBeNull()
    expect(grupoUnico([])).toBeNull()
  })
})
