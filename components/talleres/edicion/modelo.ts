/**
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the pure model of the
 * edición screen /talleres/[taller]/[edicion] v2 (artboards
 * design/talleres-reserva/12 and design/talleres-interior/24, approved in L6).
 *
 * The page turns each `InscripcionAdminRow` plus the extra columns the v2
 * list needs (origen, por_verificar, read by `cargarExtrasInscripciones`)
 * into a plain `InscritaEdicion`, so only data crosses into the client
 * island. Filtering, counting and the URL state live here.
 *
 * URL params: `vista` (grupos), `atencion` (aprobar | sin-grupo | identidad),
 * `origen` (publico | app | admin), `q` (search) and `item` (the open
 * drawer, an inscripción id).
 */

import type { InscripcionAdminRow, InscripcionEstado } from '@/lib/platform/talleres/inscripciones-types'
import type { TonoEstado } from '@/components/ui/punto-estado'

export type OrigenInscripcion = 'publico' | 'app' | 'admin'
export type AtencionEdicion = 'aprobar' | 'sin-grupo' | 'identidad'
export type VistaEdicion = 'inscripciones' | 'grupos'

/** The extra columns of `taller_inscripciones` the v2 list needs. */
export interface ExtraInscripcion {
  readonly origen: OrigenInscripcion | null
  readonly porVerificar: boolean
}

export interface InscritaEdicion {
  readonly id: string
  readonly nombre: string
  readonly correo: string | null
  readonly companero: string | null
  readonly vinculo: 'matrimonio' | 'novios' | null
  readonly estado: InscripcionEstado
  readonly origen: OrigenInscripcion | null
  readonly porVerificar: boolean
  readonly grupoId: string | null
  readonly grupoNombre: string | null
  /** ISO timestamp of the request. */
  readonly solicito: string
  readonly sobreCupo: boolean
  readonly sobreCupoPor: string | null
  readonly sobreCupoEn: string | null
  /** completado / no_completado / abandono once the edición is closed. */
  readonly resultado: string | null
  /** The partner's ficha was created by the member (`pareja_origen = ficha_nueva`). */
  readonly fichaNueva: boolean
  readonly accesoEstado: string | null
  readonly accesoFallido: boolean
}

/** A grupo of this edición, for the drawer's select and the bulk bar. */
export interface GrupoEdicionOpcion {
  readonly id: string
  readonly nombre: string
  readonly facilitadora: string | null
  readonly ocupacion: number | null
  readonly capacidad: number
}

export interface FiltrosEdicion {
  readonly atencion: AtencionEdicion | null
  readonly origen: OrigenInscripcion | null
  readonly q: string
}

export const FILTROS_INICIALES: FiltrosEdicion = { atencion: null, origen: null, q: '' }

const ATENCIONES: readonly AtencionEdicion[] = ['aprobar', 'sin-grupo', 'identidad']
const ORIGENES: readonly OrigenInscripcion[] = ['publico', 'app', 'admin']

export const ETIQUETA_ATENCION: Record<AtencionEdicion, string> = {
  aprobar: 'Por aprobar',
  'sin-grupo': 'Sin grupo',
  identidad: 'Por verificar identidad',
}

export const ETIQUETA_ORIGEN: Record<OrigenInscripcion, string> = {
  publico: 'Página pública',
  app: 'App',
  admin: 'Coordinación',
}

export function esOrigen(valor: unknown): valor is OrigenInscripcion {
  return typeof valor === 'string' && (ORIGENES as readonly string[]).includes(valor)
}

export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

// ─── Building the rows (server) ───────────────────────────────────────────

export function construirInscritas(
  rows: readonly InscripcionAdminRow[],
  extras: ReadonlyMap<string, ExtraInscripcion>,
): InscritaEdicion[] {
  return rows.map((row) => {
    const extra = extras.get(row.id)
    return {
      id: row.id,
      nombre: row.persona_principal_nombre,
      correo: row.persona_principal_email,
      companero: row.companero_id ? row.companero_nombre : null,
      vinculo: row.link_type,
      estado: row.estado,
      origen: extra?.origen ?? null,
      porVerificar: extra?.porVerificar ?? false,
      grupoId: row.grupo_id,
      grupoNombre: row.grupo_nombre,
      solicito: row.created_at,
      sobreCupo: row.sobre_cupo === true,
      sobreCupoPor: row.sobre_cupo_por_nombre ?? null,
      sobreCupoEn: row.sobre_cupo_en ?? null,
      resultado: row.unit_estado ?? null,
      fichaNueva: row.pareja_origen === 'ficha_nueva',
      accesoEstado: row.acceso_estado ?? null,
      accesoFallido: row.acceso_ultimo_envio_fallido === true,
    }
  })
}

// ─── Filters and counts (client) ──────────────────────────────────────────

const POR_ATENCION: Record<AtencionEdicion, (i: InscritaEdicion) => boolean> = {
  aprobar: (i) => i.estado === 'pendiente',
  'sin-grupo': (i) => i.estado === 'aprobado' && !i.grupoId,
  identidad: (i) => i.estado === 'pendiente' && i.porVerificar,
}

export function cumpleAtencion(i: InscritaEdicion, atencion: AtencionEdicion): boolean {
  return POR_ATENCION[atencion](i)
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function filtrarInscritas(items: readonly InscritaEdicion[], filtros: FiltrosEdicion): InscritaEdicion[] {
  const q = normalizar(filtros.q.trim())
  return items.filter((i) => {
    if (filtros.atencion && !cumpleAtencion(i, filtros.atencion)) return false
    if (filtros.origen && i.origen !== filtros.origen) return false
    if (q && !normalizar(`${i.nombre} ${i.correo ?? ''} ${i.companero ?? ''}`).includes(q)) return false
    return true
  })
}

export function contarAtencion(items: readonly InscritaEdicion[]): Record<AtencionEdicion, number> {
  return {
    aprobar: items.filter(POR_ATENCION.aprobar).length,
    'sin-grupo': items.filter(POR_ATENCION['sin-grupo']).length,
    identidad: items.filter(POR_ATENCION.identidad).length,
  }
}

/** Approvable in bulk: pendiente and with a confirmed identity. */
export function esLoteable(i: InscritaEdicion): boolean {
  return i.estado === 'pendiente' && !i.porVerificar
}

// ─── Labels ───────────────────────────────────────────────────────────────

const ESTADO: Record<InscripcionEstado, { readonly etiqueta: string; readonly tono: TonoEstado }> = {
  pendiente: { etiqueta: 'Por aprobar', tono: 'warning' },
  aprobado: { etiqueta: 'Aprobada', tono: 'success' },
  no_aprobado: { etiqueta: 'Rechazada', tono: 'danger' },
  completado: { etiqueta: 'Completada', tono: 'info' },
  retirado: { etiqueta: 'Retirada', tono: 'muted' },
}

export function estadoInscrita(estado: InscripcionEstado): { readonly etiqueta: string; readonly tono: TonoEstado } {
  return ESTADO[estado] ?? { etiqueta: estado, tono: 'muted' }
}

const ZONA = 'America/Caracas'

/** «dom 8 nov» in the church's time zone. */
export function formatearDia(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha
    .toLocaleDateString('es', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '')
}

export function etiquetaGrupo(g: GrupoEdicionOpcion): string {
  const partes = [g.nombre]
  if (g.facilitadora) partes.push(g.facilitadora)
  partes.push(`${g.ocupacion ?? '—'} de ${g.capacidad}`)
  return partes.join(' · ')
}

// ─── URL ──────────────────────────────────────────────────────────────────

export function leerFiltros(raw: {
  readonly atencion?: string
  readonly origen?: string
  readonly q?: string
}): FiltrosEdicion {
  return {
    atencion: ATENCIONES.find((a) => a === raw.atencion) ?? null,
    origen: esOrigen(raw.origen) ? raw.origen : null,
    q: raw.q ?? '',
  }
}

export function leerVista(raw: string | undefined): VistaEdicion {
  return raw === 'grupos' ? 'grupos' : 'inscripciones'
}

export function consultaDe(vista: VistaEdicion, filtros: FiltrosEdicion, item: string | null): string {
  const params = new URLSearchParams()
  if (vista === 'grupos') params.set('vista', 'grupos')
  if (filtros.atencion) params.set('atencion', filtros.atencion)
  if (filtros.origen) params.set('origen', filtros.origen)
  if (filtros.q.trim()) params.set('q', filtros.q.trim())
  if (item) params.set('item', item)
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}
