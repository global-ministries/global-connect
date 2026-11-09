/**
 * lib/platform/dps/matriz.ts — the matrix of Sundays (odd/tasks/dps-asistencia-pco.md,
 * T12; artboard docs/design-system/prototipos/planificacion-dps/03-matriz-domingos.html):
 * the 8-week range and its navigation, the columns (8 Sundays plus the
 * special plans of the range), the series bands, the rows (teams → puestos,
 * the union over every plan), the cells, the «Falta» sums, the short names
 * and the highlight count. Every person is fictitious.
 */
import {
  bandasMatriz,
  celdaMatriz,
  columnasMatriz,
  domingoAnterior,
  domingosConPersona,
  etiquetaColumna,
  etiquetaRango,
  faltaEquipoMatriz,
  faltaTotalMatriz,
  filasMatriz,
  hrefMatriz,
  leerDesdeMatriz,
  nombreCorto,
  proximaColumna,
  rangoMatriz,
  resumenColumnas,
} from '@/lib/platform/dps/matriz'
import { leerEquiposPlan, leerPlanCabecera, type EquiposPlan, type PlanCabecera } from '@/lib/platform/dps/plan'

const SERIE_A = { id: 'sa', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4 }
const SERIE_B = { id: 'sb', nombre: 'Pecadores como yo', color: 'chart-3', imagen_path: null, semanas: 3 }

const plan = (id: string, fecha: string, parche: Record<string, unknown> = {}): PlanCabecera =>
  leerPlanCabecera({ id, fecha, tipo: 'domingo', titulo: null, semana: 1, serie: SERIE_A, horarios: ['09:15', '11:15'], llegada: '07:00', ...parche })!

const conv = (id: string, nombre: string, automatico = false) => ({ convocado_id: `c-${id}`, persona_id: id, servicio_id: `sv-${id}`, nombre, automatico })

const equipos = (planId: string, audio: unknown[] = [], video: unknown[] = [], extra: Record<string, unknown>[] = []): EquiposPlan =>
  leerEquiposPlan({
    plan_id: planId,
    puede_editar: true,
    equipos: [
      {
        equipo_id: 'audio',
        equipo: 'Audio',
        ruta: 'a',
        puestos: [
          { puesto_id: 'foh', nombre: 'Audio FOH', cantidad: 1, activo: true, convocados: audio },
          { puesto_id: 'mon', nombre: 'Monitores', cantidad: 2, activo: true, convocados: [] },
          ...extra,
        ],
      },
      { equipo_id: 'video', equipo: 'Video', ruta: 'v', puestos: [{ puesto_id: 'pant', nombre: 'Pantallas', cantidad: 1, activo: true, convocados: video }] },
    ],
  })

describe('the range', () => {
  it('starts on the Sunday on or before a date', () => {
    expect(domingoAnterior('2026-11-08')).toBe('2026-11-08')
    expect(domingoAnterior('2026-11-07')).toBe('2026-11-01')
    expect(domingoAnterior('2026-11-02')).toBe('2026-11-01')
  })

  it('covers 8 Sundays and the days up to the Saturday after the last one', () => {
    const r = rangoMatriz('2026-11-01')
    expect(r.desde).toBe('2026-11-01')
    expect(r.hasta).toBe('2026-12-26')
    expect(r.domingos).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20'])
    expect(r.anterior).toBe('2026-09-06')
    expect(r.siguiente).toBe('2026-12-27')
  })

  it('reads ?desde= as its Sunday, and falls back to the Sunday of today', () => {
    expect(leerDesdeMatriz('2026-11-11', '2026-11-08')).toBe('2026-11-08')
    expect(leerDesdeMatriz(null, '2026-11-07')).toBe('2026-11-01')
    expect(leerDesdeMatriz('2026-02-31', '2026-11-07')).toBe('2026-11-01')
    expect(leerDesdeMatriz('ayer', '2026-11-07')).toBe('2026-11-01')
    expect(leerDesdeMatriz('1999-01-03', '2026-11-07')).toBe('2026-11-01')
  })

  it('links a range and labels it from the first to the last Sunday', () => {
    expect(hrefMatriz('2026-11-01')).toBe('/dps/matriz?desde=2026-11-01')
    expect(etiquetaRango(rangoMatriz('2026-11-01'))).toBe('1 nov – 20 dic 2026')
    expect(etiquetaRango(rangoMatriz('2026-12-27'))).toBe('27 dic 2026 – 14 feb 2027')
  })
})

describe('the columns', () => {
  const r = rangoMatriz('2026-11-01')
  const planes = [
    plan('p1', '2026-11-01', { semana: 2 }),
    plan('p8', '2026-11-08', { semana: 3 }),
    plan('cena', '2026-12-01', { tipo: 'cena_del_senor', serie: null, semana: null, horarios: ['18:45'] }),
    plan('conf', '2026-11-15', { tipo: 'especial', serie: null, semana: null, titulo: 'Conferencia' }),
    plan('p15', '2026-11-15', { semana: 4 }),
    plan('p22', '2026-11-22', { serie: SERIE_B, semana: 1 }),
    plan('fuera', '2027-01-03'),
  ]

  it('has one column per Sunday (with or without a plan) and one per special plan, by date', () => {
    const cols = columnasMatriz(planes, r)
    expect(cols.map((c) => c.clave)).toEqual(['p1', 'p8', 'p15', 'conf', 'p22', 'domingo-2026-11-29', 'cena', 'domingo-2026-12-06', 'domingo-2026-12-13', 'domingo-2026-12-20'])
    expect(cols.find((c) => c.clave === 'cena')).toMatchObject({ especial: true, fecha: '2026-12-01' })
    expect(cols.find((c) => c.clave === 'domingo-2026-11-29')).toMatchObject({ especial: false, plan: null, fecha: '2026-11-29' })
    expect(resumenColumnas(cols)).toEqual({ domingos: 8, especiales: 2 })
  })

  it('groups consecutive Sundays of one series into a band; each special day is its own band', () => {
    const bandas = bandasMatriz(columnasMatriz(planes, r))
    expect(bandas.map((b) => [b.especial ? 'especial' : b.serie?.nombre ?? 'sin serie', b.columnas])).toEqual([
      ['Tu casa tiene influencers', 3],
      ['especial', 1],
      ['Pecadores como yo', 1],
      ['sin serie', 1],
      ['especial', 1],
      ['sin serie', 3],
    ])
  })

  it('titles a Sunday with its date and week, and a special day with its name, date and horario', () => {
    const cols = columnasMatriz(planes, r)
    expect(etiquetaColumna(cols[1])).toEqual({ titulo: 'dom 8 nov', detalle: 'Semana 3' })
    expect(etiquetaColumna(cols.find((c) => c.clave === 'domingo-2026-11-29')!)).toEqual({ titulo: 'dom 29 nov', detalle: 'Sin plan' })
    expect(etiquetaColumna(cols.find((c) => c.clave === 'cena')!)).toEqual({ titulo: 'Cena del Señor', detalle: 'mar 1 dic · 18:45' })
    expect(etiquetaColumna(cols.find((c) => c.clave === 'conf')!)).toEqual({ titulo: 'Conferencia', detalle: 'dom 15 nov · 9:15 y 11:15' })
  })

  it('marks the next Sunday plan from today as «Próximo»', () => {
    const cols = columnasMatriz(planes, r)
    expect(proximaColumna(cols, '2026-11-07')).toBe('p8')
    expect(proximaColumna(cols, '2026-11-08')).toBe('p8')
    expect(proximaColumna(cols, '2026-11-23')).toBeNull()
  })
})

describe('the rows and cells', () => {
  const r = rangoMatriz('2026-11-01')
  const planes = [plan('p1', '2026-11-01'), plan('p8', '2026-11-08')]
  const cols = columnasMatriz(planes, r)
  const porPlan: Record<string, EquiposPlan> = {
    p1: equipos('p1', [conv('rc', 'Rubén Carvajal')], [conv('li', 'Lorena Ibarra')]),
    // A deactivated puesto that still has someone shows only in that plan.
    p8: equipos('p8', [conv('li', 'Lorena Ibarra')], [], [{ puesto_id: 'viejo', nombre: 'Puesto viejo', cantidad: 1, activo: false, convocados: [conv('rc', 'Rubén Carvajal')] }]),
  }

  it('unions the teams and puestos of every plan, in their order', () => {
    const filas = filasMatriz(porPlan, cols)
    expect(filas.map((e) => [e.equipo, e.puestos.map((p) => p.nombre)])).toEqual([
      ['Audio', ['Audio FOH', 'Monitores', 'Puesto viejo']],
      ['Video', ['Pantallas']],
    ])
  })

  it('reads a cell, or null when the plan or the puesto is not there', () => {
    expect(celdaMatriz(porPlan, cols[0], 'foh')?.convocados.map((c) => c.nombre)).toEqual(['Rubén Carvajal'])
    expect(celdaMatriz(porPlan, cols[0], 'viejo')).toBeNull()
    expect(celdaMatriz(porPlan, cols[2], 'foh')).toBeNull()
  })

  it('sums what is missing per team and in total, over the columns shown', () => {
    const [audio, video] = filasMatriz(porPlan, cols)
    // p1: FOH 0 + Monitores 2; p8: FOH 0 + Monitores 2 (the deactivated puesto asks for nobody).
    expect(faltaEquipoMatriz(audio, cols, porPlan)).toBe(4)
    expect(faltaEquipoMatriz(video, cols, porPlan)).toBe(1)
    expect(faltaTotalMatriz(filasMatriz(porPlan, cols), cols, porPlan)).toBe(5)
  })

  it('counts the Sundays where a person serves, whatever the puesto', () => {
    expect(domingosConPersona('li', cols, porPlan)).toBe(2)
    expect(domingosConPersona('rc', cols, porPlan)).toBe(2)
    expect(domingosConPersona('nadie', cols, porPlan)).toBe(0)
  })

  it('shortens a name for the condensed density', () => {
    expect(nombreCorto('Lorena Ibarra')).toBe('Lorena I.')
    expect(nombreCorto('Ps. Patricia Olmedo')).toBe('Patricia O.')
    expect(nombreCorto('Cher')).toBe('Cher')
  })
})
