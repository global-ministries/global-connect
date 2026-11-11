/**
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — pure helpers of the v2
 * taller page (artboard design/talleres-interior/22): how the ediciones split
 * into Abiertas · En curso · Cerradas, their order, the estado dot and the
 * summary line under the title. Server-safe: no React, no hooks.
 *
 * Split: Abiertas = borrador + abierto (what has not started yet; a borrador
 * keeps its own «Borrador» estado in the row), En curso = en_curso, Cerradas
 * = cerrado + cancelado. Order: the closest first for Abiertas and En curso,
 * the most recent first for Cerradas.
 */

import type { TonoEstado } from '@/components/ui/punto-estado'
import { edicionEstadoLabel } from '@/components/talleres/labels'
import type { CatalogoEdicion } from '@/lib/platform/talleres/catalogo'

export type SegmentoEdiciones = 'abiertas' | 'en_curso' | 'cerradas'

export const SEGMENTOS: readonly SegmentoEdiciones[] = ['abiertas', 'en_curso', 'cerradas']

export const ETIQUETA_SEGMENTO: Record<SegmentoEdiciones, string> = {
  abiertas: 'Abiertas',
  en_curso: 'En curso',
  cerradas: 'Cerradas',
}

const SEGMENTO_DE_ESTADO: Record<CatalogoEdicion['estado'], SegmentoEdiciones> = {
  borrador: 'abiertas',
  abierto: 'abiertas',
  en_curso: 'en_curso',
  cerrado: 'cerradas',
  cancelado: 'cerradas',
}

export const TONO_ESTADO_EDICION: Record<CatalogoEdicion['estado'], TonoEstado> = {
  borrador: 'muted',
  abierto: 'success',
  en_curso: 'info',
  cerrado: 'muted',
  cancelado: 'danger',
}

export function segmentoDe(edicion: Pick<CatalogoEdicion, 'estado'>): SegmentoEdiciones {
  return SEGMENTO_DE_ESTADO[edicion.estado]
}

function clave(edicion: Pick<CatalogoEdicion, 'fecha_inicio'>): string {
  return edicion.fecha_inicio ?? ''
}

/** The ediciones of each segment, already ordered. */
export function agruparEdiciones<E extends CatalogoEdicion>(
  ediciones: readonly E[],
): Record<SegmentoEdiciones, E[]> {
  const grupos: Record<SegmentoEdiciones, E[]> = { abiertas: [], en_curso: [], cerradas: [] }
  for (const edicion of ediciones) grupos[segmentoDe(edicion)].push(edicion)
  // Without a date: last in Abiertas / En curso, last in Cerradas too.
  const asc = (a: E, b: E) => (clave(a) === '' ? 1 : clave(b) === '' ? -1 : clave(a).localeCompare(clave(b)))
  grupos.abiertas.sort(asc)
  grupos.en_curso.sort(asc)
  grupos.cerradas.sort((a, b) => (clave(a) === '' ? 1 : clave(b) === '' ? -1 : clave(b).localeCompare(clave(a))))
  return grupos
}

/** The segment shown first: Abiertas, or the first one that has ediciones. */
export function segmentoInicial(grupos: Record<SegmentoEdiciones, readonly unknown[]>): SegmentoEdiciones {
  return SEGMENTOS.find((s) => grupos[s].length > 0) ?? 'abiertas'
}

export function etiquetaEstadoEdicion(edicion: Pick<CatalogoEdicion, 'estado'>): string {
  return edicionEstadoLabel(edicion.estado)
}

/** «12 sep 2026» from a `date` column, never shifted by the viewer's timezone; null without a date. */
export function formatearFecha(valor: string | null): string | null {
  if (!valor) return null
  const [y, m, d] = valor.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return valor
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** «1 sep 2026 → 22 sep 2026»; «Sin fechas» when neither is set. */
export function rangoFechas(edicion: Pick<CatalogoEdicion, 'fecha_inicio' | 'fecha_fin'>): string {
  const inicio = formatearFecha(edicion.fecha_inicio)
  const fin = formatearFecha(edicion.fecha_fin)
  if (!inicio && !fin) return 'Sin fechas'
  return `${inicio ?? '—'} → ${fin ?? '—'}`
}

export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

/** The numbers of the summary line under the title. */
export function resumenEdiciones(ediciones: readonly Pick<CatalogoEdicion, 'estado'>[]): {
  readonly abiertas: number
  readonly enCurso: number
  readonly cerradas: number
} {
  return {
    abiertas: ediciones.filter((e) => e.estado === 'abierto').length,
    enCurso: ediciones.filter((e) => e.estado === 'en_curso').length,
    cerradas: ediciones.filter((e) => e.estado === 'cerrado').length,
  }
}
