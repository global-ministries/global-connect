/**
 * R3c (odd/tasks/talleres-rediseno.md, S1, S4) — the pure rules of the v2
 * /talleres catálogo (artboards design/talleres-interior/18 and 19).
 *
 * Everything here comes from what the page already loads: the catálogo
 * query (ediciones with each inscripción's estado, the taller's mínimo) and
 * ONE batched select of the ediciones' grupos (cupo and «Sin facilitador»,
 * lib/platform/talleres/catalogo.ts loadGruposDeEdiciones). Nothing here
 * queries.
 *
 * Dirección: the artboards group the talleres in two scopes. A taller's
 * dirección is not a column, so the rule is the one the design states:
 * Próximo Paso (slug `proximo-paso`) belongs to DPS and every other taller
 * to Conexión, shown as «Grupos de Corto Plazo».
 *
 * URL: `?atencion=pendientes|abiertas|minimo|sin-facilitador`,
 * `?direccion=conexion|dps`, `?q=`, plus `?taller=<slug>` (open drawer) and
 * `?nuevo=1` (the «Nuevo taller» form). Unknown values read as no filter.
 */

import type { TonoEstado } from '@/components/ui/punto-estado'
import { PROXIMO_PASO_SLUG } from '@/lib/platform/talleres/proximo-paso-registro'
import type {
  CatalogoEdicionPanel,
  CatalogoTallerPanel,
  GruposEdicion,
  MiTallerResumen,
} from '@/lib/platform/talleres/catalogo'

export type AtencionCatalogo = 'pendientes' | 'abiertas' | 'minimo' | 'sin-facilitador'
export type DireccionCatalogo = 'conexion' | 'dps'

export interface FiltrosCatalogo {
  readonly atencion: AtencionCatalogo | null
  readonly direccion: DireccionCatalogo | null
  readonly q: string
}

export const FILTROS_INICIALES: FiltrosCatalogo = { atencion: null, direccion: null, q: '' }

const ATENCIONES: readonly AtencionCatalogo[] = ['pendientes', 'abiertas', 'minimo', 'sin-facilitador']

export const DIRECCIONES: Readonly<Record<DireccionCatalogo, { readonly nombre: string; readonly direccion: string }>> = {
  conexion: { nombre: 'Grupos de Corto Plazo', direccion: 'Dirección de Conexión' },
  dps: { nombre: 'Próximo Paso', direccion: 'DPS' },
}

/** Ediciones that still matter: not cerradas nor canceladas. */
const VIGENTES = new Set<CatalogoEdicionPanel['estado']>(['abierto', 'en_curso', 'borrador'])

/** Which vigente edición is «la próxima»: an abierta first, then a borrador, then one en curso. */
const PRIORIDAD: Readonly<Record<string, number>> = { abierto: 0, borrador: 1, en_curso: 2 }

export interface FilaCatalogo {
  readonly taller: CatalogoTallerPanel
  readonly direccion: DireccionCatalogo
  /** Próximo Paso: managed on its own page. */
  readonly externo: boolean
  readonly proxima: CatalogoEdicionPanel | null
  /** Cupo of the próxima edición; 0 = sin cupo definido; null = unknown (grupos not read) or no próxima. */
  readonly cupo: number | null
  /** «Por aprobar» across the vigente ediciones. */
  readonly pendientes: number
  readonly abiertas: number
  /** Abiertas still below the taller's mínimo of aprobados. */
  readonly edicionesBajoMinimo: number
  /** How many aprobados the próxima edición still needs; null when it is not below the mínimo. */
  readonly faltanParaMinimo: number | null
  /** Active grupos without facilitador across the vigente ediciones; null = unknown. */
  readonly gruposSinFacilitador: number | null
  /** talleres_mis_permisos.editar_taller (Compartir, Avisos, Configuración). */
  readonly puedeEditar: boolean
  /** talleres_mis_permisos.abrir_edicion (Abrir edición). */
  readonly puedeAbrirEdicion: boolean
}

function primero(valor: string | undefined): string | undefined {
  return valor === undefined || valor === '' ? undefined : valor
}

export function leerFiltros(params: { readonly atencion?: string; readonly direccion?: string; readonly q?: string }): FiltrosCatalogo {
  const atencion = primero(params.atencion)
  const direccion = primero(params.direccion)
  return {
    atencion: ATENCIONES.includes(atencion as AtencionCatalogo) ? (atencion as AtencionCatalogo) : null,
    direccion: direccion === 'conexion' || direccion === 'dps' ? direccion : null,
    q: params.q ?? '',
  }
}

export function consultaDe(filtros: FiltrosCatalogo, extra: { readonly taller: string | null; readonly nuevo: boolean }): string {
  const params = new URLSearchParams()
  if (filtros.atencion) params.set('atencion', filtros.atencion)
  if (filtros.direccion) params.set('direccion', filtros.direccion)
  if (filtros.q.trim()) params.set('q', filtros.q.trim())
  if (extra.taller) params.set('taller', extra.taller)
  if (extra.nuevo) params.set('nuevo', '1')
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export function direccionDe(taller: Pick<CatalogoTallerPanel, 'slug'>): DireccionCatalogo {
  return taller.slug === PROXIMO_PASO_SLUG ? 'dps' : 'conexion'
}

function bajoMinimo(edicion: CatalogoEdicionPanel, minimo: number | null): boolean {
  return edicion.estado === 'abierto' && minimo !== null && edicion.aprobados < minimo
}

function proximaDe(ediciones: readonly CatalogoEdicionPanel[]): CatalogoEdicionPanel | null {
  const vigentes = ediciones.filter((e) => VIGENTES.has(e.estado))
  vigentes.sort((a, b) => {
    const prioridad = (PRIORIDAD[a.estado] ?? 9) - (PRIORIDAD[b.estado] ?? 9)
    if (prioridad !== 0) return prioridad
    // Earliest start first; an edición without a date goes last.
    return (a.fecha_inicio ?? '9999').localeCompare(b.fecha_inicio ?? '9999')
  })
  return vigentes[0] ?? null
}

/** How many attention flags a row carries: the list shows those rows first. */
function senales(fila: FilaCatalogo): number {
  return (fila.pendientes > 0 ? 1 : 0) + (fila.edicionesBajoMinimo > 0 ? 1 : 0) + ((fila.gruposSinFacilitador ?? 0) > 0 ? 1 : 0)
}

export function construirFilas(
  catalogo: readonly CatalogoTallerPanel[],
  grupos: ReadonlyMap<string, GruposEdicion> | null,
  misTalleres: readonly MiTallerResumen[],
): FilaCatalogo[] {
  const editables = new Map(misTalleres.map((t) => [t.id, t]))
  const filas = catalogo.map((taller): FilaCatalogo => {
    const vigentes = taller.ediciones.filter((e) => VIGENTES.has(e.estado))
    const proxima = proximaDe(taller.ediciones)
    const editable = editables.get(taller.id)
    return {
      taller,
      direccion: direccionDe(taller),
      externo: direccionDe(taller) === 'dps',
      proxima,
      cupo: proxima && grupos ? (grupos.get(proxima.id)?.cupo ?? 0) : null,
      pendientes: vigentes.reduce((total, e) => total + e.pendientes, 0),
      abiertas: vigentes.filter((e) => e.estado === 'abierto').length,
      edicionesBajoMinimo: vigentes.filter((e) => bajoMinimo(e, taller.minimo_inscritos)).length,
      faltanParaMinimo:
        proxima && bajoMinimo(proxima, taller.minimo_inscritos) ? (taller.minimo_inscritos ?? 0) - proxima.aprobados : null,
      gruposSinFacilitador: grupos
        ? vigentes.reduce((total, e) => total + (grupos.get(e.id)?.gruposSinFacilitador ?? 0), 0)
        : null,
      puedeEditar: editable !== undefined,
      puedeAbrirEdicion: editable?.puedeAbrirEdicion === true,
    }
  })

  // Attention first, then by name; Próximo Paso and archived talleres at the end.
  const alFinal = (f: FilaCatalogo) => (f.externo || f.taller.estado === 'archived' ? 1 : 0)
  return filas.sort(
    (a, b) => alFinal(a) - alFinal(b) || senales(b) - senales(a) || a.taller.nombre.localeCompare(b.taller.nombre, 'es'),
  )
}

export interface ConteoAtencion {
  readonly pendientes: number
  readonly abiertas: number
  readonly minimo: number
  /** null when the grupos could not be read: the metric is left out. */
  readonly sinFacilitador: number | null
}

export function contarAtencion(filas: readonly FilaCatalogo[], gruposConocidos: boolean): ConteoAtencion {
  return {
    pendientes: filas.reduce((total, f) => total + f.pendientes, 0),
    abiertas: filas.reduce((total, f) => total + f.abiertas, 0),
    minimo: filas.reduce((total, f) => total + f.edicionesBajoMinimo, 0),
    sinFacilitador: gruposConocidos ? filas.reduce((total, f) => total + (f.gruposSinFacilitador ?? 0), 0) : null,
  }
}

const CUMPLE: Readonly<Record<AtencionCatalogo, (fila: FilaCatalogo) => boolean>> = {
  pendientes: (f) => f.pendientes > 0,
  abiertas: (f) => f.abiertas > 0,
  minimo: (f) => f.edicionesBajoMinimo > 0,
  'sin-facilitador': (f) => (f.gruposSinFacilitador ?? 0) > 0,
}

/** Lowercase, without accents, trimmed. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function filtrarFilas(filas: readonly FilaCatalogo[], filtros: FiltrosCatalogo): FilaCatalogo[] {
  const q = normalizar(filtros.q)
  return filas.filter(
    (f) =>
      (!filtros.atencion || CUMPLE[filtros.atencion](f)) &&
      (!filtros.direccion || f.direccion === filtros.direccion) &&
      (!q || normalizar(f.taller.nombre).includes(q)),
  )
}

export function resumenCatalogo(filas: readonly FilaCatalogo[]): { readonly talleres: number; readonly abiertas: number; readonly pendientes: number } {
  const conteo = contarAtencion(filas, false)
  return { talleres: filas.length, abiertas: conteo.abiertas, pendientes: conteo.pendientes }
}

export function estadoProxima(fila: FilaCatalogo): { readonly tono: TonoEstado; readonly etiqueta: string } {
  const e = fila.proxima
  if (!e) return { tono: 'muted', etiqueta: 'Sin edición vigente' }
  if (e.estado === 'abierto') {
    return fila.cupo !== null && fila.cupo > 0 && e.ocupados >= fila.cupo
      ? { tono: 'warning', etiqueta: 'Cupo lleno' }
      : { tono: 'success', etiqueta: 'Inscripción abierta' }
  }
  if (e.estado === 'en_curso') return { tono: 'info', etiqueta: 'En curso' }
  return { tono: 'muted', etiqueta: 'Borrador' }
}

export function unidadDe(edicion: Pick<CatalogoEdicionPanel, 'tipo'>, cantidad: number): string {
  if (edicion.tipo === 'pareja') return cantidad === 1 ? 'pareja' : 'parejas'
  return cantidad === 1 ? 'persona' : 'personas'
}

export function plural(cantidad: number, singular: string, varios: string): string {
  return cantidad === 1 ? singular : varios
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «mar 24 nov» from a date or timestamp; the calendar day of the string, so no time-zone shift. */
export function formatearDia(fecha: string | null): string | null {
  if (!fecha) return null
  const coincide = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  if (!coincide) return null
  const dia = new Date(Date.UTC(Number(coincide[1]), Number(coincide[2]) - 1, Number(coincide[3])))
  if (Number.isNaN(dia.getTime())) return null
  return `${DIAS[dia.getUTCDay()]} ${dia.getUTCDate()} ${MESES[dia.getUTCMonth()]}`
}
