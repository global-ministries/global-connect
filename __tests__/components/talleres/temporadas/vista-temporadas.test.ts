/**
 * @jest-environment node
 *
 * R3b (odd/tasks/talleres-rediseno.md, S5) — the pure view model of the v2
 * /talleres/temporadas screen (artboards design/talleres-interior/26 and 27):
 * URL filters, attention metrics, scope cards, summary and ordering.
 */

import {
  alcanceDirecciones,
  consultaDe,
  contarAtencion,
  filtrarTemporadas,
  leerFiltros,
  resumenTemporadas,
  talleresDe,
  FILTROS_INICIALES,
} from '@/components/talleres/temporadas/vista-temporadas'
import type { EdicionPanel, TemporadaPanel } from '@/lib/platform/talleres/temporadas'

function edicion(overrides: Partial<EdicionPanel> = {}): EdicionPanel {
  return {
    id: 'ed',
    tallerId: 't-mujer',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    nombre: 'Edición',
    estado: 'abierto',
    fechaInicio: '2027-01-12',
    fechaFin: '2027-02-16',
    inscritos: 9,
    aprobados: 9,
    minimo: null,
    ...overrides,
  }
}

function temporada(overrides: Partial<TemporadaPanel> = {}): TemporadaPanel {
  return {
    id: 'temp',
    nombre: 'Temporada',
    estado: 'abierto',
    fecha_apertura: '2027-01-11',
    fecha_cierre: '2027-03-27',
    dream_team_equipo_id: 'root-con',
    direccionLabel: 'Dirección de Conexión',
    ediciones: [],
    talleresDisponibles: [],
    ...overrides,
  }
}

const abierta = temporada({
  id: 'a',
  nombre: 'Temporada 2027-I',
  ediciones: [
    edicion({ id: 'e1', tallerId: 't-parejas', tallerNombre: 'Parejas', aprobados: 6, inscritos: 6, minimo: 8 }),
    edicion({ id: 'e2', inscritos: 9, aprobados: 9, minimo: 10 }),
    edicion({ id: 'e3', tallerId: 't-hombre', tallerNombre: 'De Hombre a Hombre', inscritos: 16, aprobados: 16, minimo: 15 }),
  ],
})
const vieja = temporada({
  id: 'v',
  nombre: 'Temporada 2026-III',
  fecha_apertura: '2026-09-28',
  ediciones: [edicion({ id: 'e4', inscritos: 14, aprobados: 14 })],
  talleresDisponibles: [{ id: 't-parejas', nombre: 'Parejas', slug: 'parejas' }],
})
const borrador = temporada({
  id: 'b',
  nombre: 'Temporada 2027-II',
  estado: 'borrador',
  fecha_apertura: '2027-04-05',
  ediciones: [edicion({ id: 'e5', estado: 'borrador', inscritos: 0, aprobados: 0, minimo: 10 })],
})
const cerrada = temporada({
  id: 'c',
  nombre: 'Temporada 2026-II',
  estado: 'cerrado',
  fecha_apertura: '2026-06-01',
  talleresDisponibles: [{ id: 't-x', nombre: 'X', slug: 'x' }],
})
const cancelada = temporada({
  id: 'x',
  nombre: 'Temporada especial',
  estado: 'cancelado',
  fecha_apertura: '2026-08-03',
  dream_team_equipo_id: 'root-dps',
  direccionLabel: 'DPS',
})
const TODAS = [cerrada, vieja, cancelada, borrador, abierta]

describe('leerFiltros / consultaDe', () => {
  it('defaults to vigentes with no filters', () => {
    expect(leerFiltros({})).toEqual(FILTROS_INICIALES)
    expect(FILTROS_INICIALES).toEqual({ vista: 'vigentes', atencion: null, direccion: null, q: '' })
  })

  it('reads every known param and ignores unknown values', () => {
    expect(leerFiltros({ vista: 'historial', atencion: 'minimo', direccion: 'root-con', q: 'parejas' })).toEqual({
      vista: 'historial',
      atencion: 'minimo',
      direccion: 'root-con',
      q: 'parejas',
    })
    expect(leerFiltros({ vista: 'raro', atencion: 'nada' })).toEqual(FILTROS_INICIALES)
  })

  it('writes only what differs from the defaults, plus the open temporada or the create form', () => {
    expect(consultaDe(FILTROS_INICIALES)).toBe('')
    expect(consultaDe({ vista: 'todas', atencion: 'sin-edicion', direccion: 'root-con', q: 'mujer' }, { temporada: 'a' })).toBe(
      '?vista=todas&atencion=sin-edicion&direccion=root-con&q=mujer&temporada=a',
    )
    expect(consultaDe(FILTROS_INICIALES, { crear: true })).toBe('?crear=1')
  })
})

describe('filtrarTemporadas', () => {
  it('Vigentes shows abiertas then borrador, each by fecha de apertura (newest first)', () => {
    expect(filtrarTemporadas(TODAS, FILTROS_INICIALES).map((t) => t.id)).toEqual(['a', 'v', 'b'])
  })

  it('Historial shows only cerradas and canceladas', () => {
    expect(filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, vista: 'historial' }).map((t) => t.id)).toEqual(['c', 'x'])
  })

  it('Todas shows every temporada', () => {
    expect(filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, vista: 'todas' })).toHaveLength(5)
  })

  it('each attention metric narrows the list', () => {
    const con = (atencion: 'abiertas' | 'borrador' | 'minimo' | 'sin-edicion') =>
      filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, vista: 'todas', atencion }).map((t) => t.id)
    expect(con('abiertas')).toEqual(['a', 'v'])
    expect(con('borrador')).toEqual(['b'])
    expect(con('minimo')).toEqual(['a'])
    // A cerrada never counts as "sin edición": it no longer admits talleres.
    expect(con('sin-edicion')).toEqual(['v'])
  })

  it('filters by dirección and by a search over the temporada and taller names, without accents', () => {
    expect(filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, vista: 'todas', direccion: 'root-dps' }).map((t) => t.id)).toEqual(['x'])
    expect(filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, q: 'PAREJAS' }).map((t) => t.id)).toEqual(['a'])
    expect(filtrarTemporadas(TODAS, { ...FILTROS_INICIALES, vista: 'todas', q: 'temporada especial' }).map((t) => t.id)).toEqual(['x'])
    expect(filtrarTemporadas([temporada({ nombre: 'Edición de Otoño' })], { ...FILTROS_INICIALES, q: 'edicion de otono' })).toHaveLength(1)
  })
})

describe('contarAtencion / resumenTemporadas / alcanceDirecciones', () => {
  it('counts abiertas, en borrador, ediciones bajo el mínimo and talleres sin edición over every temporada', () => {
    expect(contarAtencion(TODAS)).toEqual({ abiertas: 2, borrador: 1, minimo: 2, sinEdicion: 1 })
  })

  it('summarizes abiertas, borrador and the inscritos of the open temporadas', () => {
    expect(resumenTemporadas(TODAS)).toEqual({ abiertas: 2, borrador: 1, inscritosEnCurso: 6 + 9 + 16 + 14 })
  })

  it('builds one scope card per dirección with its totals, sorted by label', () => {
    expect(alcanceDirecciones(TODAS)).toEqual([
      { id: 'root-con', label: 'Dirección de Conexión', total: 4, abiertas: 2, borrador: 1 },
      { id: 'root-dps', label: 'DPS', total: 1, abiertas: 0, borrador: 0 },
    ])
  })

  it('counts distinct talleres', () => {
    expect(talleresDe(abierta)).toBe(3)
    expect(talleresDe(temporada({ ediciones: [edicion({ id: '1' }), edicion({ id: '2' })] }))).toBe(1)
  })
})
