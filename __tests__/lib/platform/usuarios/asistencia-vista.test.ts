/**
 * Asistencia tab view model (S13 of odd/tasks/sistema-diseno-v2.md): kinds
 * with records, weekly series with a 4-week rolling average and its trend,
 * KPIs per kind, historial rows, the leader callout and group status texts.
 * Presente is yes/no: a week mixes only when the person had meetings in two
 * groups and attended one.
 */
import type { AsistenciaPersona, GrupoAsistencia, MarcaAsistencia } from '@/lib/platform/usuarios/asistencia-persona'
import { totalesDeMarcas } from '@/lib/platform/usuarios/asistencia-persona'
import {
  ETIQUETA_TIPO,
  estadoDeGrupo,
  detalleSemanal,
  gruposDeSeleccion,
  leyendaMixta,
  textoSemana,
  gruposQueLidera,
  historialAsistencia,
  kpisAsistencia,
  promedioMovil4,
  resumenTaller,
  semanasHasta,
  serieSemanal,
  tendencia4,
  tiposConRegistros,
} from '@/lib/platform/usuarios/asistencia-vista'
import { fechaCorta } from '@/lib/platform/usuarios/fechas'

const m = (fecha: string, presente: boolean, eraVisitante = false): MarcaAsistencia => ({ fecha, presente, eraVisitante })

const grupo = (cambios: Partial<GrupoAsistencia> & Pick<GrupoAsistencia, 'id'>): GrupoAsistencia => {
  const marcas = cambios.marcas ?? []
  return {
    tipo: 'gdv', nombre: cambios.id, area: null, rol: 'Miembro', actual: true, desde: null, salio: null,
    completado: null, totalSesiones: null, ...cambios, marcas, totales: totalesDeMarcas(marcas),
  }
}

describe('tiposConRegistros', () => {
  it('lists only the kinds that have a group, in gdv, estudiantes, talleres order', () => {
    const a: AsistenciaPersona = {
      desde: '2026-08-01', hasta: '2026-10-29',
      grupos: [grupo({ id: 't', tipo: 'talleres' }), grupo({ id: 'g', tipo: 'gdv' })],
    }
    expect(tiposConRegistros(a)).toEqual(['gdv', 'talleres'])
    expect(tiposConRegistros({ desde: '', hasta: '', grupos: [] })).toEqual([])
    expect(ETIQUETA_TIPO).toEqual({ gdv: 'Grupos de Vida', estudiantes: 'Estudiantes', talleres: 'Talleres' })
  })
})

describe('semanasHasta', () => {
  it('returns N seven-day windows, oldest first, the last one ending on hasta', () => {
    const s = semanasHasta('2026-10-29', 3)
    expect(s).toEqual([
      { inicio: '2026-10-09', fin: '2026-10-15' },
      { inicio: '2026-10-16', fin: '2026-10-22' },
      { inicio: '2026-10-23', fin: '2026-10-29' },
    ])
    expect(semanasHasta('2026-10-29')).toHaveLength(12)
  })
})

describe('serieSemanal', () => {
  const semanas = semanasHasta('2026-10-29', 4)

  it('100 attended, 0 absent, null without a meeting that week', () => {
    const g = grupo({ id: 'g', marcas: [m('2026-10-03', true), m('2026-10-17', false), m('2026-10-24', true)] })
    expect(serieSemanal([g], semanas)).toEqual([100, null, 0, 100])
  })

  it('mixes only across groups: two meetings in a week, one attended, is 50', () => {
    const a = grupo({ id: 'a', marcas: [m('2026-10-24', true)] })
    const b = grupo({ id: 'b', marcas: [m('2026-10-25', false)] })
    expect(serieSemanal([a, b], semanas)).toEqual([null, null, null, 50])
  })

  it('one group with two meetings in a week counts once: attended if present at any of them', () => {
    const g = grupo({ id: 'g', marcas: [m('2026-10-24', true), m('2026-10-25', false), m('2026-10-17', false), m('2026-10-18', false)] })
    expect(serieSemanal([g], semanas)).toEqual([null, null, 0, 100])
    expect(detalleSemanal([g], semanas)).toEqual([null, null, { grupos: 1, asistidos: 0 }, { grupos: 1, asistidos: 1 }])
  })

  it('averages across the groups that met: two of three is 67', () => {
    const gs = [
      grupo({ id: 'a', marcas: [m('2026-10-24', true)] }),
      grupo({ id: 'b', marcas: [m('2026-10-25', true), m('2026-10-26', false)] }),
      grupo({ id: 'c', marcas: [m('2026-10-26', false)] }),
    ]
    expect(serieSemanal(gs, semanas)).toEqual([null, null, null, 67])
    expect(detalleSemanal(gs, semanas)[3]).toEqual({ grupos: 3, asistidos: 2 })
  })
})

describe('textoSemana and leyendaMixta', () => {
  it('names each week; "una de sus reuniones" only with two groups', () => {
    expect(textoSemana(null)).toBe('sin reunión')
    expect(textoSemana({ grupos: 1, asistidos: 1 })).toBe('asistió')
    expect(textoSemana({ grupos: 2, asistidos: 0 })).toBe('no asistió')
    expect(textoSemana({ grupos: 2, asistidos: 1 })).toBe('asistió a una de sus reuniones')
    expect(textoSemana({ grupos: 3, asistidos: 2 })).toBe('asistió en 2 de 3 grupos')
  })

  it('the legend item exists only with a mixed week', () => {
    expect(leyendaMixta([null, { grupos: 1, asistidos: 1 }, { grupos: 2, asistidos: 2 }])).toBeNull()
    expect(leyendaMixta([{ grupos: 2, asistidos: 1 }])).toBe('Asistió a una de sus reuniones')
    expect(leyendaMixta([{ grupos: 2, asistidos: 1 }, { grupos: 3, asistidos: 1 }])).toBe('Asistió en parte de sus grupos')
  })
})

describe('promedioMovil4 and tendencia4', () => {
  it('averages the last 4 weeks with values; a week without meeting stays null', () => {
    expect(promedioMovil4([100, 0, null, 100, 100, 0])).toEqual([100, 50, null, 67, 67, 67])
  })

  it('the trend compares the last rolling value with the one 4 points before', () => {
    expect(tendencia4([0, 0, 0, 0, 100, 100, 100, 100])).toEqual({ puntos: 100, sentido: 'sube' })
    expect(tendencia4([100, 100, 100, 100, 0])).toEqual({ puntos: -25, sentido: 'baja' })
    expect(tendencia4([100, 100, 100, 100, 100])).toEqual({ puntos: 0, sentido: 'igual' })
  })

  it('no trend with fewer than 5 rolling values', () => {
    expect(tendencia4([100, null, 100, 0])).toBeNull()
  })
})

describe('kpisAsistencia', () => {
  it('percentage over every meeting, groups, meetings and the last attended / last meeting dates', () => {
    const gs = [
      grupo({ id: 'a', marcas: [m('2026-10-01', true), m('2026-10-08', false)] }),
      grupo({ id: 'b', actual: false, marcas: [m('2026-09-01', true), m('2026-10-20', false)] }),
    ]
    expect(kpisAsistencia(gs)).toEqual({
      porcentaje: 50, grupos: 2, reuniones: 4, ultimaAsistencia: '2026-10-01', ultimaReunion: '2026-10-20',
    })
  })

  it('no meetings: null percentage and dates', () => {
    expect(kpisAsistencia([grupo({ id: 'a' })])).toEqual({
      porcentaje: null, grupos: 1, reuniones: 0, ultimaAsistencia: null, ultimaReunion: null,
    })
  })
})

describe('historialAsistencia', () => {
  it('newest first, limited, with the past and visitor flags', () => {
    const gs = [
      grupo({ id: 'a', nombre: 'Familias', marcas: [m('2026-10-01', true), m('2026-10-15', false)] }),
      grupo({ id: 'b', nombre: 'Chicos', actual: false, marcas: [m('2026-10-08', true, true)] }),
    ]
    expect(historialAsistencia(gs, 2)).toEqual([
      { fecha: '2026-10-15', grupoId: 'a', grupo: 'Familias', presente: false, pasado: false, comoVisitante: false },
      { fecha: '2026-10-08', grupoId: 'b', grupo: 'Chicos', presente: true, pasado: true, comoVisitante: true },
    ])
    expect(historialAsistencia(gs)).toHaveLength(3)
  })
})

describe('gruposDeSeleccion and gruposQueLidera', () => {
  const gs = [grupo({ id: 'a', rol: 'Líder' }), grupo({ id: 'b', rol: 'Líder', actual: false }), grupo({ id: 'c' })]

  it('"todos" or an unknown id keeps every group; a known id keeps that one', () => {
    expect(gruposDeSeleccion(gs, 'todos').map((g) => g.id)).toEqual(['a', 'b', 'c'])
    expect(gruposDeSeleccion(gs, 'zz').map((g) => g.id)).toEqual(['a', 'b', 'c'])
    expect(gruposDeSeleccion(gs, 'c').map((g) => g.id)).toEqual(['c'])
  })

  it('the leader callout lists only the current groups the person leads', () => {
    expect(gruposQueLidera(gs).map((g) => g.id)).toEqual(['a'])
  })
})

describe('estadoDeGrupo and fechaCorta', () => {
  it('formats ISO dates as "1 sept 2026"', () => {
    expect(fechaCorta('2026-09-01')).toBe('1 sept 2026')
    expect(fechaCorta('no')).toBe('')
  })

  it('current, since a date, left on a date, or a past group without date', () => {
    expect(estadoDeGrupo(grupo({ id: 'a' }))).toEqual({ texto: 'Actual', tono: 'success' })
    expect(estadoDeGrupo(grupo({ id: 'a', desde: '2026-02-01' }))).toEqual({ texto: 'Desde 1 feb 2026', tono: 'success' })
    expect(estadoDeGrupo(grupo({ id: 'a', actual: false, salio: '2026-09-01' }))).toEqual({ texto: 'Salió el 1 sept 2026', tono: 'muted' })
    expect(estadoDeGrupo(grupo({ id: 'a', actual: false }))).toEqual({ texto: 'Pasado', tono: 'muted' })
  })

  it('a taller is Completado or En curso', () => {
    expect(estadoDeGrupo(grupo({ id: 't', tipo: 'talleres', completado: true, actual: false }))).toEqual({ texto: 'Completado', tono: 'success' })
    expect(estadoDeGrupo(grupo({ id: 't', tipo: 'talleres', completado: false }))).toEqual({ texto: 'En curso', tono: 'info' })
  })
})

describe('resumenTaller', () => {
  const taller = (totalSesiones: number | null, marcas: MarcaAsistencia[]) => grupo({ id: 't', tipo: 'talleres', totalSesiones, marcas })

  it('"N de M sesiones" over the sesiones of the taller, also while it is in progress', () => {
    expect(resumenTaller(taller(2, [m('2026-09-03', true), m('2026-09-10', false)]))).toEqual({ valor: '1 de 2', detalle: 'sesiones', porcentaje: 50 })
    expect(resumenTaller(taller(8, [m('2026-10-07', true), m('2026-10-14', true), m('2026-10-21', false)]))).toEqual({
      valor: '2 de 8', detalle: 'sesiones', porcentaje: 25,
    })
  })

  it('the sesiones attended in the period when the total is unknown', () => {
    expect(resumenTaller(taller(null, [m('2026-10-07', true)])).detalle).toBe('sesión asistida en el período')
  })
})
