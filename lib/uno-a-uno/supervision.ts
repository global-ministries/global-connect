/**
 * The supervision table of /mis-uno-a-uno (odd/tasks/uno-a-uno.md, T8): the
 * leaders' filters, counters and sorting, and the recent 1:1s' filters. T9:
 * the Dirección → Área → Equipo o grupo filters over each leader's places,
 * with the cascade of Dream Team → Servidores. All of it runs in the browser
 * over the rows the page already loaded (S8.6); pure, so the components and
 * the tests share it.
 */

import {
  nombresDe,
  type EstadoUnoAUno,
  type LiderSupervisado,
  type UbicacionLider,
  type UnoAUnoSupervisado,
} from './vista'

export type EstadoLider = 'sin_uno_a_uno' | 'al_dia' | 'con_agendados'

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
  /** Ids of the Dream Team tree (S9.1). */
  readonly direccion: string | null
  readonly area: string | null
  readonly equipo: string | null
  readonly estado: EstadoLider | null
}

export const FILTROS_LIDERES_VACIOS: FiltrosLideres = { q: '', direccion: null, area: null, equipo: null, estado: null }

export function hayFiltrosLideres(filtros: FiltrosLideres): boolean {
  const { q, direccion, area, equipo, estado } = filtros
  return q.trim() !== '' || [direccion, area, equipo, estado].some((filtro) => filtro !== null)
}

export interface OpcionUbicacion {
  readonly id: string
  readonly label: string
}

export interface OpcionArea extends OpcionUbicacion {
  readonly direccionId: string
}

export interface OpcionEquipo extends OpcionUbicacion {
  readonly direccionId: string
  readonly areaId: string | null
}

export interface OpcionesUbicacion {
  readonly direcciones: readonly OpcionUbicacion[]
  readonly areas: readonly OpcionArea[]
  readonly equipos: readonly OpcionEquipo[]
}

function porLabel(a: OpcionUbicacion, b: OpcionUbicacion): number {
  return a.label.localeCompare(b.label, 'es')
}

/** The options keyed by id, once each and sorted by label. */
function unicas<T extends OpcionUbicacion>(opciones: readonly T[]): T[] {
  return [...new Map(opciones.map((opcion) => [opcion.id, opcion])).values()].sort(porLabel)
}

/**
 * The options of the three place filters, from the loaded leaders' places
 * (S9.1): every dirección; the áreas of the chosen dirección (none until one
 * is chosen, as in Servidores); the equipos of the chosen área, or else of
 * the chosen dirección, or else all of them.
 */
export function opcionesUbicacion(lideres: readonly LiderSupervisado[], filtros: FiltrosLideres): OpcionesUbicacion {
  const lugares = lideres.flatMap((lider) => lider.ubicaciones)
  const direcciones = unicas(lugares.map((u) => ({ id: u.direccionId, label: u.direccion })))
  const areas = unicas(
    lugares.flatMap((u) =>
      u.areaId && u.area && u.direccionId === filtros.direccion
        ? [{ id: u.areaId, label: u.area, direccionId: u.direccionId }]
        : [],
    ),
  )
  const equipos = unicas(
    lugares.flatMap((u) =>
      u.equipoId && u.equipo && enDireccionYArea(u, filtros)
        ? [{ id: u.equipoId, label: u.equipo, direccionId: u.direccionId, areaId: u.areaId }]
        : [],
    ),
  )
  return { direcciones, areas, equipos }
}

function enDireccionYArea(lugar: UbicacionLider, { direccion, area }: FiltrosLideres): boolean {
  return (direccion === null || lugar.direccionId === direccion) && (area === null || lugar.areaId === area)
}

/** The patch that picks a dirección: the área and the equipo are dropped (S9.1). */
export function parcheElegirDireccion(direccionId: string | null): Partial<FiltrosLideres> {
  return { direccion: direccionId, area: null, equipo: null }
}

/** The patch that picks an área: the equipo is dropped and the dirección follows the área. */
export function parcheElegirArea(areaId: string | null, opciones: readonly OpcionArea[]): Partial<FiltrosLideres> {
  if (areaId === null) return { area: null, equipo: null }
  const direccion = opciones.find((opcion) => opcion.id === areaId)?.direccionId
  return direccion === undefined ? { area: areaId, equipo: null } : { area: areaId, equipo: null, direccion }
}

/** The patch that picks an equipo: its área and its dirección follow it. */
export function parcheElegirEquipo(equipoId: string | null, opciones: readonly OpcionEquipo[]): Partial<FiltrosLideres> {
  if (equipoId === null) return { equipo: null }
  const opcion = opciones.find((o) => o.id === equipoId)
  return opcion === undefined
    ? { equipo: equipoId }
    : { equipo: equipoId, area: opcion.areaId, direccion: opcion.direccionId }
}

const CUMPLE_ESTADO: Record<EstadoLider, (lider: LiderSupervisado) => boolean> = {
  sin_uno_a_uno: (l) => l.realizados === 0,
  al_dia: (l) => l.realizados > 0,
  con_agendados: (l) => l.agendados > 0,
}

function sinFiltroDeLugar({ direccion, area, equipo }: FiltrosLideres): boolean {
  return direccion === null && area === null && equipo === null
}

// One single place must match the dirección, the área and the equipo (S9.2).
function cumpleLugar(lider: LiderSupervisado, filtros: FiltrosLideres): boolean {
  if (sinFiltroDeLugar(filtros)) return true
  return lider.ubicaciones.some(
    (lugar) => enDireccionYArea(lugar, filtros) && (filtros.equipo === null || lugar.equipoId === filtros.equipo),
  )
}

function cumpleFiltros(lider: LiderSupervisado, filtros: FiltrosLideres): boolean {
  const { q, estado } = filtros
  if (!coincideTexto(nombreDeLider(lider), q)) return false
  if (!cumpleLugar(lider, filtros)) return false
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
