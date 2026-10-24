/**
 * The supervision table of /mis-uno-a-uno (odd/tasks/uno-a-uno.md, T8): the
 * área and the grupo or equipo of a leader from their `contextos`, the
 * leaders' filters, counters and sorting, and the recent 1:1s' filters. All
 * of it runs in the browser over the rows the page already loaded (S8.6);
 * pure, so the components and the tests share it.
 */

import { nombresDe, type EstadoUnoAUno, type LiderSupervisado, type UnoAUnoSupervisado } from './vista'

export type AreaLider = 'gdv' | 'dream_team'
export type EstadoLider = 'sin_uno_a_uno' | 'al_dia' | 'con_agendados'

export const AREAS_LIDER: readonly { valor: AreaLider; etiqueta: string }[] = [
  { valor: 'gdv', etiqueta: 'Grupos de Vida' },
  { valor: 'dream_team', etiqueta: 'Dream Team' },
]

// Prefixes written by uno_a_uno_dirigidos_de (the database's contexts).
const PREFIJOS: readonly { prefijo: string; area: AreaLider }[] = [
  { prefijo: 'GDV:', area: 'gdv' },
  { prefijo: 'Director de etapa:', area: 'gdv' },
  { prefijo: 'Director general:', area: 'gdv' },
  { prefijo: 'Dream Team:', area: 'dream_team' },
]

function prefijoDe(contexto: string): (typeof PREFIJOS)[number] | undefined {
  return PREFIJOS.find((p) => contexto.startsWith(p.prefijo))
}

/** "GDV: Norte" → 'gdv'; null for a context with an unknown prefix. */
export function areaDeContexto(contexto: string): AreaLider | null {
  return prefijoDe(contexto)?.area ?? null
}

/** "GDV: Norte" → "Norte"; an unknown context stays whole. */
export function grupoDeContexto(contexto: string): string {
  const conocido = prefijoDe(contexto)
  return conocido ? contexto.slice(conocido.prefijo.length).trim() : contexto
}

/** Every grupo or equipo of the loaded leaders, once and sorted. */
export function opcionesGrupo(lideres: readonly LiderSupervisado[]): string[] {
  const grupos = new Set(lideres.flatMap((l) => l.contextos.map(grupoDeContexto)))
  return [...grupos].sort((a, b) => a.localeCompare(b, 'es'))
}

function normalizar(valor: string): string {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Whether `texto` contains `consulta`, ignoring case and accents; a blank query matches. */
export function coincideTexto(texto: string, consulta: string): boolean {
  return normalizar(texto).includes(normalizar(consulta))
}

export function nombreDeLider(lider: LiderSupervisado): string {
  return nombresDe([{ id: lider.usuarioId, nombre: lider.nombre, apellido: lider.apellido }])
}

export interface FiltrosLideres {
  readonly q: string
  readonly area: AreaLider | null
  readonly grupo: string | null
  readonly estado: EstadoLider | null
}

export const FILTROS_LIDERES_VACIOS: FiltrosLideres = { q: '', area: null, grupo: null, estado: null }

export function hayFiltrosLideres(filtros: FiltrosLideres): boolean {
  return filtros.q.trim() !== '' || filtros.area !== null || filtros.grupo !== null || filtros.estado !== null
}

const CUMPLE_ESTADO: Record<EstadoLider, (lider: LiderSupervisado) => boolean> = {
  sin_uno_a_uno: (l) => l.realizados === 0,
  al_dia: (l) => l.realizados > 0,
  con_agendados: (l) => l.agendados > 0,
}

function cumpleFiltros(lider: LiderSupervisado, filtros: FiltrosLideres): boolean {
  const { q, area, grupo, estado } = filtros
  if (!coincideTexto(nombreDeLider(lider), q)) return false
  if (area && !lider.contextos.some((c) => areaDeContexto(c) === area)) return false
  if (grupo && !lider.contextos.some((c) => grupoDeContexto(c) === grupo)) return false
  return !estado || CUMPLE_ESTADO[estado](lider)
}

/** The leaders that pass every filter (AND), in the order received. */
export function filtrarLideres(lideres: readonly LiderSupervisado[], filtros: FiltrosLideres): LiderSupervisado[] {
  return lideres.filter((l) => cumpleFiltros(l, filtros))
}

export interface ContadoresLideres {
  readonly total: number
  readonly sinUnoAUno: number
  readonly alDia: number
}

/** The summary over every loaded leader: all, none realizado in the window, some realizado. */
export function contadoresLideres(lideres: readonly LiderSupervisado[]): ContadoresLideres {
  const sinUnoAUno = lideres.filter(CUMPLE_ESTADO.sin_uno_a_uno).length
  return { total: lideres.length, sinUnoAUno, alDia: lideres.length - sinUnoAUno }
}

export type ColumnaLider = 'lider' | 'contextos' | 'dirigidos' | 'realizados' | 'agendados' | 'ultimo'
export type SentidoOrden = 'asc' | 'desc'

/** Null = the RPC order (longest without a 1:1 first). */
export type OrdenLideres = { readonly columna: ColumnaLider; readonly sentido: SentidoOrden } | null

function comparaTexto(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base' })
}

// "Nunca" (no realizado) is the oldest, as in the RPC order.
function instante(valor: string | null): number {
  return valor ? new Date(valor).getTime() : Number.NEGATIVE_INFINITY
}

// Not a subtraction: two "Nunca" would give -Infinity - -Infinity = NaN.
function comparaInstante(a: string | null, b: string | null): number {
  const [x, y] = [instante(a), instante(b)]
  return x === y ? 0 : x < y ? -1 : 1
}

const COMPARADORES: Record<ColumnaLider, (a: LiderSupervisado, b: LiderSupervisado) => number> = {
  lider: (a, b) => comparaTexto(nombreDeLider(a), nombreDeLider(b)),
  contextos: (a, b) => comparaTexto(a.contextos.join(', '), b.contextos.join(', ')),
  dirigidos: (a, b) => a.dirigidos - b.dirigidos,
  realizados: (a, b) => a.realizados - b.realizados,
  agendados: (a, b) => a.agendados - b.agendados,
  ultimo: (a, b) => comparaInstante(a.ultimoRealizado, b.ultimoRealizado),
}

/** A sorted copy; ties keep the RPC order in both directions. */
export function ordenarLideres(lideres: readonly LiderSupervisado[], orden: OrdenLideres): LiderSupervisado[] {
  if (!orden) return [...lideres]
  const comparar = COMPARADORES[orden.columna]
  const signo = orden.sentido === 'asc' ? 1 : -1
  return [...lideres].sort((a, b) => signo * comparar(a, b))
}

/** A new column sorts ascending; the same column toggles its direction. */
export function siguienteOrden(orden: OrdenLideres, columna: ColumnaLider): OrdenLideres {
  const sentido = orden?.columna === columna && orden.sentido === 'asc' ? 'desc' : 'asc'
  return { columna, sentido }
}

export interface FiltrosRecientes {
  readonly q: string
  readonly estado: EstadoUnoAUno | null
}

export const FILTROS_RECIENTES_VACIOS: FiltrosRecientes = { q: '', estado: null }

function cumpleFiltrosReciente(u: UnoAUnoSupervisado, { q, estado }: FiltrosRecientes): boolean {
  if (estado && u.estado !== estado) return false
  return coincideTexto(`${nombresDe(u.lideres)} ${nombresDe(u.dirigidos)}`, q)
}

/** The recent 1:1s with that estado whose leaders or dirigidos match the search, in the order received. */
export function filtrarRecientes(
  recientes: readonly UnoAUnoSupervisado[],
  filtros: FiltrosRecientes,
): UnoAUnoSupervisado[] {
  return recientes.filter((u) => cumpleFiltrosReciente(u, filtros))
}
