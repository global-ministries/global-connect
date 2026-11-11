/**
 * R3b (odd/tasks/talleres-rediseno.md, S5) — the pure view model of the v2
 * /talleres/temporadas screen (artboards design/talleres-interior/26 desktop
 * and 27 phone): which temporadas show for the URL filters, the attention
 * metrics, the scope cards by dirección and the hero summary. No React, so
 * every rule is unit-tested on its own.
 *
 * URL: `?vista=historial|todas` (default vigentes), `?atencion=abiertas|
 * borrador|minimo|sin-edicion`, `?direccion=<root equipo id>`, `?q=`, plus the
 * open drawer (`?temporada=<id>`) or the create form (`?crear=1`).
 */

import { edicionBajoMinimo, type TemporadaPanel } from '@/lib/platform/talleres/temporadas'

export type VistaTemporadas = 'vigentes' | 'historial' | 'todas'
export type AtencionTemporadas = 'abiertas' | 'borrador' | 'minimo' | 'sin-edicion'

export interface FiltrosTemporadas {
  readonly vista: VistaTemporadas
  readonly atencion: AtencionTemporadas | null
  readonly direccion: string | null
  readonly q: string
}

export const FILTROS_INICIALES: FiltrosTemporadas = { vista: 'vigentes', atencion: null, direccion: null, q: '' }

const VISTAS: readonly VistaTemporadas[] = ['vigentes', 'historial', 'todas']
const ATENCIONES: readonly AtencionTemporadas[] = ['abiertas', 'borrador', 'minimo', 'sin-edicion']

export function leerFiltros(params: Readonly<Record<string, string | undefined>>): FiltrosTemporadas {
  const vista = VISTAS.find((v) => v === params.vista) ?? 'vigentes'
  const atencion = ATENCIONES.find((a) => a === params.atencion) ?? null
  return { vista, atencion, direccion: params.direccion || null, q: params.q ?? '' }
}

/** The query string ('' or '?…') for the filters, the open temporada and the create form. */
export function consultaDe(
  filtros: FiltrosTemporadas,
  extra: { readonly temporada?: string | null; readonly crear?: boolean } = {},
): string {
  const params = new URLSearchParams()
  if (filtros.vista !== 'vigentes') params.set('vista', filtros.vista)
  if (filtros.atencion) params.set('atencion', filtros.atencion)
  if (filtros.direccion) params.set('direccion', filtros.direccion)
  if (filtros.q.trim()) params.set('q', filtros.q.trim())
  if (extra.temporada) params.set('temporada', extra.temporada)
  if (extra.crear) params.set('crear', '1')
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

/** Borrador and Abierta still admit changes; Cerrada and Cancelada are history. */
export function esVigente(temporada: Pick<TemporadaPanel, 'estado'>): boolean {
  return temporada.estado === 'abierto' || temporada.estado === 'borrador'
}

export function inscritosDe(temporada: TemporadaPanel): number {
  return temporada.ediciones.reduce((total, e) => total + e.inscritos, 0)
}

export function talleresDe(temporada: TemporadaPanel): number {
  return new Set(temporada.ediciones.map((e) => e.tallerId)).size
}

export function edicionesBajoMinimo(temporada: TemporadaPanel) {
  return temporada.ediciones.filter(edicionBajoMinimo)
}

/** Talleres that could still get an edición here: only while the temporada admits changes. */
export function talleresSinEdicion(temporada: TemporadaPanel) {
  return esVigente(temporada) ? temporada.talleresDisponibles : []
}

const CUMPLE: Record<AtencionTemporadas, (t: TemporadaPanel) => boolean> = {
  abiertas: (t) => t.estado === 'abierto',
  borrador: (t) => t.estado === 'borrador',
  minimo: (t) => edicionesBajoMinimo(t).length > 0,
  'sin-edicion': (t) => talleresSinEdicion(t).length > 0,
}

const RANGO_ESTADO: Record<TemporadaPanel['estado'], number> = { abierto: 0, borrador: 1, cerrado: 2, cancelado: 3 }

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** Abiertas first, then borrador, then the history; each by fecha de apertura, newest first. */
export function filtrarTemporadas(
  temporadas: readonly TemporadaPanel[],
  filtros: FiltrosTemporadas,
): readonly TemporadaPanel[] {
  const consulta = normalizar(filtros.q)
  return temporadas
    .filter((t) => filtros.vista === 'todas' || (filtros.vista === 'vigentes') === esVigente(t))
    .filter((t) => !filtros.atencion || CUMPLE[filtros.atencion](t))
    .filter((t) => !filtros.direccion || t.dream_team_equipo_id === filtros.direccion)
    .filter(
      (t) =>
        !consulta ||
        normalizar([t.nombre, ...t.ediciones.map((e) => e.tallerNombre)].join(' ')).includes(consulta),
    )
    .slice()
    .sort(
      (a, b) =>
        RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado] || b.fecha_apertura.localeCompare(a.fecha_apertura),
    )
}

export interface ConteoAtencion {
  readonly abiertas: number
  readonly borrador: number
  /** Ediciones (not temporadas) under the minimum. */
  readonly minimo: number
  /** Talleres (not temporadas) with no edición in a vigente temporada of their dirección. */
  readonly sinEdicion: number
}

export function contarAtencion(temporadas: readonly TemporadaPanel[]): ConteoAtencion {
  return {
    abiertas: temporadas.filter(CUMPLE.abiertas).length,
    borrador: temporadas.filter(CUMPLE.borrador).length,
    minimo: temporadas.reduce((total, t) => total + edicionesBajoMinimo(t).length, 0),
    sinEdicion: temporadas.reduce((total, t) => total + talleresSinEdicion(t).length, 0),
  }
}

export function resumenTemporadas(temporadas: readonly TemporadaPanel[]) {
  const abiertas = temporadas.filter(CUMPLE.abiertas)
  return {
    abiertas: abiertas.length,
    borrador: temporadas.filter(CUMPLE.borrador).length,
    inscritosEnCurso: abiertas.reduce((total, t) => total + inscritosDe(t), 0),
  }
}

export interface AlcanceDireccion {
  readonly id: string
  readonly label: string
  readonly total: number
  readonly abiertas: number
  readonly borrador: number
}

export function alcanceDirecciones(temporadas: readonly TemporadaPanel[]): readonly AlcanceDireccion[] {
  const porId = new Map<string, AlcanceDireccion>()
  for (const t of temporadas) {
    const actual = porId.get(t.dream_team_equipo_id) ?? {
      id: t.dream_team_equipo_id,
      label: t.direccionLabel || 'Dirección',
      total: 0,
      abiertas: 0,
      borrador: 0,
    }
    porId.set(t.dream_team_equipo_id, {
      ...actual,
      total: actual.total + 1,
      abiertas: actual.abiertas + (t.estado === 'abierto' ? 1 : 0),
      borrador: actual.borrador + (t.estado === 'borrador' ? 1 : 0),
    })
  }
  return Array.from(porId.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

/**
 * A `date` / ISO value as «lun 11 ene 2027», anchored to UTC so a
 * `YYYY-MM-DD` never shifts a day (same rule as the other talleres screens).
 */
export function formatearFecha(valor: string | null, conAnio = true): string {
  if (!valor) return '—'
  const fecha = new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00Z` : valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha
    .toLocaleDateString('es', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(conAnio ? { year: 'numeric' } : {}),
    })
    .replace(/[.,]/g, '')
}
