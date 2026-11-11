/**
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the pure model of
 * /talleres/pendientes v2 (artboard design/talleres-interior/23): one list of
 * «cosas que esperan tu decisión», each one an `ItemPendiente`:
 *
 * - `retiro`    a pending `taller_solicitudes_retiro` row.
 * - `aprobar`   a pendiente inscripción (por verificar when a public
 *               reservation could not confirm the identity).
 * - `sin-grupo` an aprobada inscripción without grupo in an edición that is
 *               still abierta or en curso.
 *
 * The page builds the items on the server (with the per-equipo permission
 * already resolved into plain booleans, so nothing but data crosses into the
 * client island); the client filters, counts and orders them here.
 *
 * URL params: `atencion` (aprobar | identidad | retiro | sin-grupo), `taller`
 * (the taller's slug), `q` (search) and `item` (the open drawer).
 */

import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import type {
  OrigenInscripcion,
  PendienteSolicitudRow,
  PendientesInscripcionesResult,
} from '@/lib/platform/talleres/pendientes'
import type { PermisosTaller } from '@/lib/platform/talleres/permisos'

export type TipoPendiente = 'retiro' | 'aprobar' | 'sin-grupo'
export type AtencionPendientes = 'aprobar' | 'identidad' | 'retiro' | 'sin-grupo'

export interface ItemPendiente {
  /** `${tipo}:${id}` — unique across the three kinds; the `item` URL param. */
  readonly clave: string
  readonly tipo: TipoPendiente
  /** Inscripción id (aprobar, sin-grupo) or solicitud id (retiro). */
  readonly id: string
  readonly nombre: string
  readonly correo: string | null
  readonly enPareja: boolean
  /** The taller's slug, or `sin-taller` when it could not be resolved. */
  readonly tallerClave: string
  readonly tallerNombre: string
  readonly tallerSlug: string | null
  readonly edicionId: string | null
  readonly edicionNombre: string | null
  readonly origen: OrigenInscripcion | null
  readonly porVerificar: boolean
  /** ISO timestamp: when it was requested (or approved, for sin-grupo it is the request too). */
  readonly fecha: string
  readonly motivo: string | null
  readonly tipoRetiro: PendienteSolicitudRow['tipo'] | null
  /**
   * Whether this viewer may act on it, from the item's equipo: aprobar →
   * aprobarInscripciones, retiro → resolverRetiros, sin-grupo →
   * gestionarGrupos. The actions and the RPCs check again.
   */
  readonly puedeDecidir: boolean
}

export interface FiltrosPendientes {
  readonly atencion: AtencionPendientes | null
  readonly taller: string | null
  readonly q: string
}

export const FILTROS_INICIALES: FiltrosPendientes = { atencion: null, taller: null, q: '' }

const ATENCIONES: readonly AtencionPendientes[] = ['aprobar', 'identidad', 'retiro', 'sin-grupo']

export const ETIQUETA_ATENCION: Record<AtencionPendientes, string> = {
  aprobar: 'Por aprobar',
  identidad: 'Por verificar identidad',
  retiro: 'Solicitudes de retiro',
  'sin-grupo': 'Sin grupo',
}

export const ETIQUETA_ORIGEN: Record<OrigenInscripcion, string> = {
  publico: 'Página pública',
  app: 'App',
  admin: 'Coordinación',
}

/** Ediciones where a missing grupo still matters. */
const EDICION_VIGENTE = new Set(['abierto', 'en_curso'])

export function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

export function leerFiltros(raw: {
  readonly atencion?: string
  readonly taller?: string
  readonly q?: string
}): FiltrosPendientes {
  const atencion = ATENCIONES.find((a) => a === raw.atencion) ?? null
  return { atencion, taller: raw.taller?.trim() || null, q: raw.q ?? '' }
}

export function consultaDe(filtros: FiltrosPendientes, item: string | null): string {
  const params = new URLSearchParams()
  if (filtros.atencion) params.set('atencion', filtros.atencion)
  if (filtros.taller) params.set('taller', filtros.taller)
  if (filtros.q.trim()) params.set('q', filtros.q.trim())
  if (item) params.set('item', item)
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

// ─── Building the items (server) ──────────────────────────────────────────

function nombreInscripcion(row: InscripcionAdminRow): string {
  return row.companero_id && row.companero_nombre
    ? `${row.persona_principal_nombre} y ${row.companero_nombre}`
    : row.persona_principal_nombre
}

function itemDeInscripcion(
  tipo: 'aprobar' | 'sin-grupo',
  row: InscripcionAdminRow,
  origen: OrigenInscripcion | null,
  porVerificar: boolean,
  puedeDecidir: boolean,
): ItemPendiente {
  return {
    clave: `${tipo}:${row.id}`,
    tipo,
    id: row.id,
    nombre: nombreInscripcion(row),
    correo: row.persona_principal_email,
    enPareja: Boolean(row.companero_id),
    tallerClave: row.taller_slug || 'sin-taller',
    tallerNombre: row.taller_nombre,
    tallerSlug: row.taller_slug || null,
    edicionId: row.edicion_id,
    edicionNombre: row.edicion_nombre,
    origen,
    porVerificar,
    fecha: row.created_at,
    motivo: null,
    tipoRetiro: null,
    puedeDecidir,
  }
}

export interface FuentesPendientes {
  /** estado = pendiente. */
  readonly pendientes: PendientesInscripcionesResult
  /** estado = aprobado; only the ones without grupo in a vigente edición become items. */
  readonly aprobadas: PendientesInscripcionesResult
  readonly solicitudes: readonly PendienteSolicitudRow[]
  readonly permisosDe: (equipoId: string | null) => PermisosTaller
}

export function construirItems({ pendientes, aprobadas, solicitudes, permisosDe }: FuentesPendientes): ItemPendiente[] {
  const items: ItemPendiente[] = []

  for (const s of solicitudes) {
    const participante = s.tipo === 'participante_retiro'
    items.push({
      clave: `retiro:${s.id}`,
      tipo: 'retiro',
      id: s.id,
      nombre: s.personaNombre ?? (participante ? 'Participante' : 'Servidor del equipo'),
      correo: s.personaCorreo ?? null,
      enPareja: false,
      tallerClave: s.tallerSlug ?? 'sin-taller',
      tallerNombre: s.tallerNombre ?? 'Taller no disponible',
      tallerSlug: s.tallerSlug,
      edicionId: s.edicionId ?? null,
      edicionNombre: null,
      origen: null,
      porVerificar: false,
      fecha: s.created_at,
      motivo: s.motivo,
      tipoRetiro: s.tipo,
      puedeDecidir: permisosDe(s.equipoId).resolverRetiros,
    })
  }

  for (const row of pendientes.rows) {
    const extra = pendientes.extraPorInscripcion.get(row.id)
    const equipoId = pendientes.equipoIdByTallerId.get(row.taller_id) ?? null
    items.push(
      itemDeInscripcion('aprobar', row, extra?.origen ?? null, extra?.porVerificar ?? false, permisosDe(equipoId).aprobarInscripciones),
    )
  }

  for (const row of aprobadas.rows) {
    const extra = aprobadas.extraPorInscripcion.get(row.id)
    // Without the extra columns we cannot tell; never claim «sin grupo».
    if (!extra || extra.grupoId !== null || !EDICION_VIGENTE.has(row.edicion_estado)) continue
    const equipoId = aprobadas.equipoIdByTallerId.get(row.taller_id) ?? null
    items.push(itemDeInscripcion('sin-grupo', row, extra.origen, false, permisosDe(equipoId).gestionarGrupos))
  }

  return items
}

// ─── Filtering, counting and ordering (client) ───────────────────────────

export function cumpleAtencion(item: ItemPendiente, atencion: AtencionPendientes): boolean {
  switch (atencion) {
    case 'aprobar':
      return item.tipo === 'aprobar'
    case 'identidad':
      return item.tipo === 'aprobar' && item.porVerificar
    case 'retiro':
      return item.tipo === 'retiro'
    default:
      return item.tipo === 'sin-grupo'
  }
}

/** Lowercase, without accents, trimmed. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const ORDEN_TIPO: Record<TipoPendiente, number> = { retiro: 0, aprobar: 1, 'sin-grupo': 2 }

/** Retiros first, then por aprobar, then sin grupo; inside each, the one waiting longest first. */
export function ordenarPendientes(items: readonly ItemPendiente[]): ItemPendiente[] {
  return [...items].sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.fecha.localeCompare(b.fecha))
}

export function filtrarPendientes(items: readonly ItemPendiente[], filtros: FiltrosPendientes): ItemPendiente[] {
  const q = normalizar(filtros.q)
  return ordenarPendientes(
    items.filter(
      (item) =>
        (!filtros.atencion || cumpleAtencion(item, filtros.atencion)) &&
        (!filtros.taller || item.tallerClave === filtros.taller) &&
        (!q || normalizar(`${item.nombre} ${item.correo ?? ''} ${item.tallerNombre}`).includes(q)),
    ),
  )
}

export function contarAtencion(items: readonly ItemPendiente[]): Record<AtencionPendientes, number> {
  return {
    aprobar: items.filter((i) => cumpleAtencion(i, 'aprobar')).length,
    identidad: items.filter((i) => cumpleAtencion(i, 'identidad')).length,
    retiro: items.filter((i) => cumpleAtencion(i, 'retiro')).length,
    'sin-grupo': items.filter((i) => cumpleAtencion(i, 'sin-grupo')).length,
  }
}

export interface AlcanceTaller {
  readonly clave: string
  readonly nombre: string
  readonly total: number
  readonly porAprobar: number
  readonly porVerificar: number
  readonly retiros: number
}

export function alcanceTalleres(items: readonly ItemPendiente[]): AlcanceTaller[] {
  const porClave = new Map<string, AlcanceTaller>()
  for (const item of items) {
    const actual = porClave.get(item.tallerClave) ?? {
      clave: item.tallerClave,
      nombre: item.tallerNombre,
      total: 0,
      porAprobar: 0,
      porVerificar: 0,
      retiros: 0,
    }
    porClave.set(item.tallerClave, {
      ...actual,
      total: actual.total + 1,
      porAprobar: actual.porAprobar + (item.tipo === 'aprobar' ? 1 : 0),
      porVerificar: actual.porVerificar + (cumpleAtencion(item, 'identidad') ? 1 : 0),
      retiros: actual.retiros + (item.tipo === 'retiro' ? 1 : 0),
    })
  }
  return [...porClave.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Approvable in bulk: a pendiente inscripción the viewer may decide whose identity is confirmed. */
export function esLoteable(item: ItemPendiente): boolean {
  return item.tipo === 'aprobar' && item.puedeDecidir && !item.porVerificar
}

// ─── Dates ────────────────────────────────────────────────────────────────

const ZONA = 'America/Caracas'

function diaLocal(iso: string): number | null {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  const [anio, mes, dia] = fecha.toLocaleDateString('en-CA', { timeZone: ZONA }).split('-').map(Number)
  return Date.UTC(anio, mes - 1, dia)
}

/** Whole calendar days (Caracas) between `fecha` and `hoy`; never negative. */
export function diasEsperando(fecha: string, hoy: string): number {
  const a = diaLocal(fecha)
  const b = diaLocal(hoy)
  if (a === null || b === null) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function textoEspera(dias: number): string {
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return `Hace ${dias} días`
}

/** «dom 8 nov» in Caracas time. */
export function formatearDia(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha
    .toLocaleDateString('es', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '')
}

export interface ResumenPendientes {
  readonly total: number
  readonly talleres: number
  readonly masAntigua: number
}

export function resumenPendientes(items: readonly ItemPendiente[], hoy: string): ResumenPendientes {
  return {
    total: items.length,
    talleres: new Set(items.map((i) => i.tallerClave)).size,
    masAntigua: items.reduce((max, i) => Math.max(max, diasEsperando(i.fecha, hoy)), 0),
  }
}
