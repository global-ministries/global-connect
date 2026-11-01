import type { DatosVivo, GrupoVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import {
  FILTROS_VIVO_INICIALES,
  calcularVistaVivo,
  consultaVivo,
  elegirOpcion,
  enlaceLista,
  estadoGrupo,
  etiquetaEstado,
  indicadorVivo,
  leerFiltrosVivo,
  lineaVisitante,
  mensajesNuevosVisitantes,
  nuevosVisitantes,
  opcionesAmbito,
  opcionesReunion,
  textoHace,
  valorAmbito,
  valorReunion,
  type FiltrosVivo,
} from '@/lib/platform/estudiantes/vivo-vista'

/**
 * The pure view model of the live view /estudiantes/vivo (C4b of
 * odd/tasks/estudiantes-fase-b.md; artboards 03 / 04 of
 * design/estudiantes-asistencia). Groups and people from the artboard, all
 * fictitious.
 */

const opcion = (parche: Partial<OpcionVivo>): OpcionVivo => ({
  ambitoId: 'a-t',
  ambito: 'Transit',
  campusId: 'c1',
  campus: 'Barquisimeto',
  fecha: '2026-10-25',
  turnoId: 't1',
  turno: '1er servicio',
  hora: '09:00:00',
  ...parche,
})

// RPC order: ámbito label, campus, newest date first.
const OPCIONES: readonly OpcionVivo[] = [
  opcion({ ambitoId: 'a-io', ambito: 'Inside Out', turnoId: 't2', turno: '2do servicio', hora: '11:00:00' }),
  opcion({ ambitoId: 'a-io', ambito: 'Inside Out', fecha: '2026-10-18', turnoId: 't2', turno: '2do servicio', hora: '11:00:00' }),
  opcion({}),
  opcion({ fecha: '2026-10-18' }),
]

describe('elegirOpcion', () => {
  it('opens today when there is a meeting today, else the newest one', () => {
    expect(elegirOpcion(OPCIONES, {}, '2026-10-25')).toBe(OPCIONES[0])
    expect(elegirOpcion(OPCIONES, {}, '2026-10-28')).toBe(OPCIONES[0])
    expect(elegirOpcion([OPCIONES[3], OPCIONES[2]], {}, '2026-10-28')).toBe(OPCIONES[2])
  })

  it('honours the requested ámbito, date and turno', () => {
    expect(elegirOpcion(OPCIONES, { ambito: 'a-t', campus: 'c1' }, '2026-10-25')).toBe(OPCIONES[2])
    expect(elegirOpcion(OPCIONES, { ambito: 'a-t', campus: 'c1', fecha: '2026-10-18', turno: 't1' }, '2026-10-25')).toBe(OPCIONES[3])
  })

  it('finds the meeting by date and turno alone (the "‹ En vivo" of a leader list)', () => {
    expect(elegirOpcion(OPCIONES, { fecha: '2026-10-18', turno: 't1' }, '2026-10-25')).toBe(OPCIONES[3])
  })

  it('keeps the ámbito when the date is gone, and falls back to the default for an unknown ámbito', () => {
    expect(elegirOpcion(OPCIONES, { ambito: 'a-t', fecha: '2020-01-05', turno: 't1' }, '2026-10-25')).toBe(OPCIONES[2])
    expect(elegirOpcion(OPCIONES, { ambito: 'otro' }, '2026-10-25')).toBe(OPCIONES[0])
  })

  it('is null without options', () => {
    expect(elegirOpcion([], {}, '2026-10-25')).toBeNull()
  })
})

describe('the selection pickers', () => {
  it('lists each ámbito once, with the campus only when there is more than one', () => {
    expect(opcionesAmbito(OPCIONES)).toEqual([
      { valor: 'a-io|c1', etiqueta: 'Inside Out' },
      { valor: 'a-t|c1', etiqueta: 'Transit' },
    ])
    expect(opcionesAmbito([...OPCIONES, opcion({ campusId: 'c2', campus: 'Cabudare' })]).map((o) => o.etiqueta)).toEqual([
      'Inside Out · Barquisimeto',
      'Transit · Barquisimeto',
      'Transit · Cabudare',
    ])
    expect(valorAmbito(OPCIONES[2])).toBe('a-t|c1')
  })

  it('lists the meetings of the chosen ámbito, newest first, with the turno only when a date has two', () => {
    expect(opcionesReunion(OPCIONES, OPCIONES[2])).toEqual([
      { valor: '2026-10-25|t1', etiqueta: 'Domingo 25 oct · 9:00' },
      { valor: '2026-10-18|t1', etiqueta: 'Domingo 18 oct · 9:00' },
    ])
    const dos = [opcion({}), opcion({ turnoId: 't3', turno: '2do servicio', hora: '11:00:00' })]
    expect(opcionesReunion(dos, dos[0]).map((o) => o.etiqueta)).toEqual(['Domingo 25 oct · 9:00 · 1er servicio', 'Domingo 25 oct · 11:00 · 2do servicio'])
    expect(valorReunion(OPCIONES[3])).toBe('2026-10-18|t1')
  })
})

describe('the URL', () => {
  it('writes the selection and the filters that differ from the default', () => {
    expect(consultaVivo(OPCIONES[2], FILTROS_VIVO_INICIALES)).toBe('ambito=a-t&campus=c1&fecha=2026-10-25&turno=t1')
    expect(
      consultaVivo(OPCIONES[2], { ...FILTROS_VIVO_INICIALES, area: 'Grupos de Chicas', metrica: 'ausentes', estado: 'faltan', orden: 'nombre', q: ' ana ' }),
    ).toBe('ambito=a-t&campus=c1&fecha=2026-10-25&turno=t1&area=Grupos+de+Chicas&metrica=ausentes&estado=faltan&orden=nombre&q=ana')
  })

  it('reads the filters back, ignoring unknown values', () => {
    expect(leerFiltrosVivo({ area: 'Grupos de Chicas', metrica: 'ausentes', estado: 'faltan', orden: 'nombre', q: 'ana' })).toEqual({
      area: 'Grupos de Chicas',
      metrica: 'ausentes',
      estado: 'faltan',
      orden: 'nombre',
      q: 'ana',
    })
    expect(leerFiltrosVivo({ metrica: 'otra', estado: 'x', orden: ['asistencia', 'nombre'] })).toEqual({ ...FILTROS_VIVO_INICIALES, orden: 'asistencia' })
  })

  it('links a group to its leader list, back to this meeting', () => {
    expect(enlaceLista('g1', OPCIONES[2])).toBe('/estudiantes/grupos/g1?desde=vivo&fecha=2026-10-25&turno=t1')
  })
})

const grupo = (grupoId: string, nombre: string, subarea: string, lideres: string[], presentes: number, ausentes: number, visitantes: number, sinMarcar: number): GrupoVivo => ({
  grupoId,
  nombre,
  subarea,
  anio: Number(nombre[0]),
  anioEtiqueta: nombre.split(' · ')[0],
  lideres,
  presentes,
  ausentes,
  visitantes,
  sinMarcar,
})

const CHICAS = 'Grupos de Chicas'
const CHICOS = 'Grupos de Chicos'
const G1 = grupo('g1', '1er año · Chicas', CHICAS, ['Fernanda Ochoa', 'Diana Peraza'], 11, 3, 1, 0)
const G2 = grupo('g2', '2do año · Chicas', CHICAS, ['Andrea Molina', 'Paola Ruiz'], 10, 1, 1, 3)
const G3 = grupo('g3', '3er año · Chicas', CHICAS, ['Karla Mujica'], 0, 0, 0, 13)
const G4 = grupo('g4', '1er año · Chicos', CHICOS, ['Jesús Pacheco', 'Óscar Lugo'], 12, 3, 2, 0)
const G5 = grupo('g5', '2do año · Chicos', CHICOS, ['Samuel Nieves'], 0, 0, 0, 12)
const G6 = grupo('g6', '3er año · Chicos', CHICOS, ['Diego Carrasco'], 9, 4, 1, 0)

const visitante = (personaId: string, nombre: string, g: GrupoVivo, esNuevo: boolean, registradoAt: string): VisitanteHoy => ({
  personaId,
  nombre,
  grupoId: g.grupoId,
  grupo: g.nombre,
  anioEtiqueta: g.anioEtiqueta,
  registradoPor: g.lideres[0],
  registradoAt,
  esNuevo,
})

const V5 = visitante('p5', 'Andrés Yépez', G6, true, '2026-10-25T13:38:00Z')
const V4 = visitante('p4', 'Thiago Rivero', G4, false, '2026-10-25T13:35:00Z')
const V3 = visitante('p3', 'Matías Paredes', G4, true, '2026-10-25T13:35:00Z')
const V2 = visitante('p2', 'Emilia Rangel', G1, false, '2026-10-25T13:32:00Z')
const V1 = visitante('p1', 'Luciana Ferrer', G2, false, '2026-10-25T13:24:00Z')

const DATOS: DatosVivo = {
  ambitoId: 'a-t',
  fecha: '2026-10-25',
  turnoId: 't1',
  grupos: [G1, G2, G3, G4, G5, G6],
  visitantesHoy: [V5, V4, V3, V2, V1],
}

const vista = (parche: Partial<FiltrosVivo> = {}, datos: DatosVivo = DATOS) =>
  calcularVistaVivo({ datos, ambito: 'Transit', filtros: { ...FILTROS_VIVO_INICIALES, ...parche } })
const ids = (grupos: readonly GrupoVivo[]) => grupos.map((g) => g.grupoId)

describe('estado of a group', () => {
  it('is Sin marcar until someone marks, then Faltan N, then Completo', () => {
    expect(estadoGrupo(G3)).toBe('sin_marcar')
    expect(estadoGrupo(G2)).toBe('faltan')
    expect(estadoGrupo(G1)).toBe('completo')
    expect(estadoGrupo(grupo('g0', '4to año · Chicas', CHICAS, [], 0, 0, 0, 0))).toBe('vacio')
  })

  it('names each estado with a tone (never color alone)', () => {
    expect(etiquetaEstado(G3)).toEqual({ tono: 'warning', texto: 'Sin marcar' })
    expect(etiquetaEstado(G2)).toEqual({ tono: 'info', texto: 'Faltan 3' })
    expect(etiquetaEstado(G1)).toEqual({ tono: 'success', texto: 'Completo' })
    expect(etiquetaEstado(grupo('g0', '4to año · Chicas', CHICAS, [], 0, 0, 0, 0))).toEqual({ tono: 'muted', texto: 'Sin integrantes' })
  })
})

describe('calcularVistaVivo', () => {
  it('adds up the meeting and builds the four attention metrics', () => {
    const v = vista()
    expect(v.titulo).toBe('Transit')
    expect(v.totales).toEqual({ grupos: 6, inscritos: 81, presentes: 42, presentesInscritos: 37, visitantes: 5, ausentes: 11, sinMarcar: 28, gruposSinMarcar: 2 })
    expect(v.metricas).toEqual([
      { id: 'presentes', etiqueta: 'Presentes', valor: 42, total: 81, pista: '52% de 81 inscritos', tono: 'success', activa: false },
      { id: 'visitantes', etiqueta: 'Visitantes', valor: 5, pista: '2 por primera vez', tono: 'info', activa: false },
      { id: 'sin_marcar', etiqueta: 'Grupos sin marcar', valor: 2, total: 6, pista: 'Avísale a su entrenador', tono: 'warning', activa: false },
      { id: 'ausentes', etiqueta: 'Ausentes', valor: 11, total: 81, pista: 'Para contactar esta semana', tono: 'danger', activa: false },
    ])
  })

  it('puts the groups that need attention first, then sorts by name or attendance', () => {
    expect(ids(vista().visibles)).toEqual(['g5', 'g3', 'g2', 'g1', 'g4', 'g6'])
    expect(ids(vista({ orden: 'nombre' }).visibles)).toEqual(['g1', 'g4', 'g2', 'g5', 'g3', 'g6'])
    expect(ids(vista({ orden: 'asistencia' }).visibles)).toEqual(['g4', 'g1', 'g2', 'g6', 'g5', 'g3'])
    expect(vista().pie).toEqual({ resumen: '6 de 6 grupos · 81 inscritos', orden: 'Orden: sin marcar primero' })
    expect(vista({ orden: 'asistencia' }).pie.orden).toBe('Orden: más presentes primero')
  })

  it('lets each metric filter the list, and marks it active', () => {
    expect(ids(vista({ metrica: 'sin_marcar' }).visibles)).toEqual(['g5', 'g3'])
    expect(ids(vista({ metrica: 'visitantes' }).visibles)).toEqual(['g2', 'g1', 'g4', 'g6'])
    expect(ids(vista({ metrica: 'ausentes' }).visibles)).toEqual(['g2', 'g1', 'g4', 'g6'])
    expect(ids(vista({ metrica: 'presentes' }).visibles)).toEqual(['g2', 'g1', 'g4', 'g6'])
    expect(vista({ metrica: 'ausentes' }).metricas.find((m) => m.id === 'ausentes')?.activa).toBe(true)
    expect(vista({ metrica: 'ausentes' }).pie.resumen).toBe('4 de 6 grupos · 81 inscritos')
  })

  it('filters by estado and counts each estado for the sheet', () => {
    expect(ids(vista({ estado: 'faltan' }).visibles)).toEqual(['g2'])
    expect(ids(vista({ estado: 'completo' }).visibles)).toEqual(['g1', 'g4', 'g6'])
    expect(vista().cuentasEstado).toEqual({ todos: 6, sin_marcar: 2, faltan: 1, completo: 3 })
    expect(vista().filtrosEnHoja).toBe(0)
    expect(vista({ estado: 'faltan', orden: 'nombre' }).filtrosEnHoja).toBe(2)
  })

  it('searches group and leader names, without accents or case', () => {
    expect(ids(vista({ q: 'karla' }).visibles)).toEqual(['g3'])
    expect(ids(vista({ q: 'OSCAR' }).visibles)).toEqual(['g4'])
    expect(ids(vista({ q: ' chicos ' }).visibles)).toEqual(['g5', 'g4', 'g6'])
  })

  it('offers one card per sub-área when there is more than one', () => {
    expect(vista().areas).toEqual([
      { id: CHICAS, label: CHICAS, grupos: 3, inscritos: 41, presentes: 21, ausentes: 4, sinMarcar: 16, visitantes: 2, gruposSinMarcar: 1 },
      { id: CHICOS, label: CHICOS, grupos: 3, inscritos: 40, presentes: 21, ausentes: 7, sinMarcar: 12, visitantes: 3, gruposSinMarcar: 1 },
    ])
    expect(vista({}, { ...DATOS, grupos: [G1, G2, G3] }).areas).toEqual([])
  })

  it('scopes everything to the chosen sub-área (no cards at the leaf)', () => {
    const v = vista({ area: CHICAS })
    expect(v.titulo).toBe(CHICAS)
    expect(ids(v.visibles)).toEqual(['g3', 'g2', 'g1'])
    expect(v.totales).toMatchObject({ grupos: 3, presentes: 21, inscritos: 41, gruposSinMarcar: 1 })
    expect(v.visitantes.map((x) => x.personaId)).toEqual(['p2', 'p1'])
    expect(v.areas).toEqual([])
  })

  it('ignores an área that is not in the meeting', () => {
    const v = vista({ area: 'Grupos de Nadie' })
    expect(v.titulo).toBe('Transit')
    expect(v.filtros.area).toBeNull()
    expect(v.visibles).toHaveLength(6)
  })
})

describe('the live indicator', () => {
  it('counts seconds, then minutes', () => {
    expect(textoHace(0)).toBe('ahora')
    expect(textoHace(10)).toBe('hace 10 s')
    expect(textoHace(59)).toBe('hace 59 s')
    expect(textoHace(60)).toBe('hace 1 min')
    expect(textoHace(125)).toBe('hace 2 min')
  })

  it('is green while it refreshes and muted when paused or failing', () => {
    expect(indicadorVivo({ segundos: 10, oculto: false, fallo: false })).toEqual({ tono: 'success', texto: 'En vivo · Actualizado hace 10 s' })
    expect(indicadorVivo({ segundos: 0, oculto: false, fallo: false })).toEqual({ tono: 'success', texto: 'En vivo · Actualizado ahora' })
    expect(indicadorVivo({ segundos: 40, oculto: true, fallo: false })).toEqual({ tono: 'muted', texto: 'En pausa · Actualizado hace 40 s' })
    expect(indicadorVivo({ segundos: 40, oculto: false, fallo: true })).toEqual({ tono: 'muted', texto: 'Reintentando · Actualizado hace 40 s' })
  })
})

describe('new visitors between refreshes', () => {
  it('finds the visitors that were not there before, none on the first load', () => {
    const v6 = visitante('p6', 'Joaquín Silva', G6, true, '2026-10-25T13:41:00Z')
    expect(nuevosVisitantes(null, [V5, V4])).toEqual([])
    expect(nuevosVisitantes([V5, V4], [v6, V5, V4])).toEqual([v6])
    expect(nuevosVisitantes([V5, V4], [V5])).toEqual([])
  })

  it('announces up to three by name, more as a count', () => {
    expect(mensajesNuevosVisitantes([V5])).toEqual(['Nuevo visitante: Andrés Yépez en 3er año · Chicos'])
    expect(mensajesNuevosVisitantes([V5, V3])).toHaveLength(2)
    expect(mensajesNuevosVisitantes([V5, V4, V3, V2])).toEqual(['4 visitantes nuevos. Míralos en «Visitantes de hoy».'])
    expect(mensajesNuevosVisitantes([])).toEqual([])
  })

  it('says who registered the visitor and when (Caracas time)', () => {
    expect(lineaVisitante(V5)).toBe('Registró Diego Carrasco · 9:38')
    expect(lineaVisitante({ ...V5, registradoPor: null })).toBe('9:38')
    expect(lineaVisitante({ ...V5, registradoPor: null, registradoAt: null })).toBe('')
  })
})
