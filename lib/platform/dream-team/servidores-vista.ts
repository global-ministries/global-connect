import type { NodoArbol } from './arbol'
import type { NodoEquipoArbol } from './estructura-arbol'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado, type PersonaId } from './types'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { normalizarTelefono } from '@/lib/utils/telefono'
import { isoLocal, nombreConFrecuencia } from './frecuencia-turno'
import { SIN_TURNO, coincideTurno, ordenarTurnos, type FrecuenciasPorTurno, type Turno } from './turnos'
import { ESTADOS_POR_ACTIVAR, MAX_EQUIPOS_EN_TARJETAS } from './mi-equipo-vista'
import { RANGO_EDAD_LABELS, contarPorRangoEdad, esRangoEdad, type ContadoresEdad, type RangoEdad } from './edad'

/**
 * Pure view model behind /admin/dream-team/servidores (no I/O, no React).
 *
 * It answers work questions over the flat list of servicios: who serves where
 * and in which stage, who has no account, who serves in several teams. It owns
 * every filter rule, the reactive counters and attention metrics, the
 * dirección → área → equipo cascade and its breadcrumbs, sorting, the two
 * views (one item per person by default, or one per servicio), the active-filter
 * chips, the footer text and the URL codec, so the screen only renders and the
 * rules are testable without a DOM.
 *
 * Counters are reactive: each one is computed with every filter applied EXCEPT
 * the one it belongs to, so it says what tapping it would leave on screen.
 * "En varios equipos" is a property of the person over ALL servicios, not of
 * the filtered subset: someone who serves in two teams stays "in several teams"
 * even while the list is narrowed to one of them.
 */

// ── Input ────────────────────────────────────────────────────────────────

export interface FilaServidor {
  /** Unique per row: the servicio id, or `gdv:<persona>:<equipo>` for a Grupos de Vida person. */
  readonly clave: string
  readonly personaId: PersonaId
  readonly nombre: string
  readonly equipoId: string
  readonly equipoLabel: string
  /** Visible ancestors of the equipo, root first, joined with " · ". Empty for a root. */
  readonly equipoRuta: string
  readonly direccionId: string
  /** The role as displayed ("Coordinador"). */
  readonly rolLabel: string
  readonly estado: DreamTeamEstado
  /** `null` when there is no start date to show (a Grupos de Vida director de etapa has none). */
  readonly fechaInicio: string | null
  readonly telefono: string | null
  /** `null` when the caller cannot see the person's account status (never counted as "sin cuenta"). */
  readonly tieneCuenta: boolean | null
  readonly origen: 'dream_team' | 'grupos_vida'
  readonly servicioId?: string
  readonly version?: number
  /** Whether the row offers actions (a Dream Team servicio the viewer can edit). */
  readonly editable: boolean
  /**
   * Whether the viewer may fix the person's ficha (T11): the volunteer
   * coordinator of the area, org.manage, admin or pastor, for a non-retired
   * servicio. The database checks it again (dream_team_editar_ficha).
   */
  readonly fichaEditable?: boolean
  /** Campus service shifts of a Dream Team servicio; absent or empty = none assigned yet. */
  readonly turnoIds?: readonly string[]
  /** Biweekly shifts of the servicio (T10); a shift with no entry is weekly. */
  readonly frecuencias?: FrecuenciasPorTurno
  /** Age range of the person (D10); absent when the caller cannot see it (never matches an age filter). */
  readonly rangoEdad?: RangoEdad
}

export type Inicio = 'cualquiera' | 'mes' | 'trimestre'
/**
 * The view: one item per person ("Por persona") or per servicio ("Por
 * servicio", `ninguno` in the URL since the old "Sin agrupar"). "Por equipo"
 * was removed with design system v2: the scope cards replace it.
 */
export type Agrupar = 'ninguno' | 'persona'
export type ColumnaOrden = 'persona' | 'equipo' | 'rol' | 'etapa' | 'inicio'
export type SentidoOrden = 'asc' | 'desc'

export interface FiltrosServidores {
  readonly etapa: DreamTeamEstado | null
  readonly direccion: string | null
  /** An inner node of the dirección (e.g. Waumba Land): keeps its whole subtree. */
  readonly area: string | null
  readonly equipo: string | null
  readonly rol: string | null
  /** A shift id, `SIN_TURNO` for servicios without one, or `null` for no filter. */
  readonly turno: string | null
  /** An age range (D10), or `null` for no filter. */
  readonly edad: RangoEdad | null
  readonly inicio: Inicio
  readonly sinCuenta: boolean
  readonly varios: boolean
  /** Servicios in postulado or en orientación. */
  readonly porActivar: boolean
  readonly q: string
  readonly agrupar: Agrupar
  readonly orden: { readonly columna: ColumnaOrden; readonly sentido: SentidoOrden }
}

export const FILTROS_INICIALES: FiltrosServidores = {
  etapa: null,
  direccion: null,
  area: null,
  equipo: null,
  rol: null,
  turno: null,
  edad: null,
  inicio: 'cualquiera',
  sinCuenta: false,
  varios: false,
  porActivar: false,
  q: '',
  agrupar: 'persona',
  orden: { columna: 'persona', sentido: 'asc' },
}

export const COLUMNAS_ORDEN: readonly ColumnaOrden[] = ['persona', 'equipo', 'rol', 'etapa', 'inicio']

export const ETIQUETA_COLUMNA: Readonly<Record<ColumnaOrden, string>> = {
  persona: 'Persona',
  equipo: 'Equipo',
  rol: 'Rol',
  etapa: 'Etapa',
  inicio: 'Inicio',
}

/** The filters the sheet holds; its "Limpiar" applies this. Scope, search, view and sort stay. */
export const LIMPIAR_HOJA: Partial<FiltrosServidores> = {
  etapa: null,
  rol: null,
  turno: null,
  inicio: 'cualquiera',
  sinCuenta: false,
  varios: false,
  porActivar: false,
}

/** "Limpiar todo": every chip, the age included. Scope and search stay. */
export const LIMPIAR_FILTROS: Partial<FiltrosServidores> = { ...LIMPIAR_HOJA, edad: null }

// ── Tree index ───────────────────────────────────────────────────────────

export interface NodoIndexado {
  readonly label: string
  /** Id of the root ("dirección") this node hangs from; a root is its own dirección. */
  readonly direccionId: string
  readonly direccionLabel: string
  /** Visible ancestors, root first, joined with " · ". Empty for a root. */
  readonly ruta: string
  /** Ancestor ids, root first. Empty for a root. */
  readonly ancestros: readonly string[]
  /** Labels from below the dirección down to this node. Empty for a root. */
  readonly rutaArea: readonly string[]
  readonly tieneHijos: boolean
}

/** Maps every node id to its label, dirección and ancestor path. */
export function indexarArbol(arbol: readonly NodoArbol<NodoEquipoArbol>[]): ReadonlyMap<string, NodoIndexado> {
  const indice = new Map<string, NodoIndexado>()
  function visitar(
    nodo: NodoArbol<NodoEquipoArbol>,
    raiz: NodoEquipoArbol,
    ancestros: readonly string[],
    ancestroIds: readonly string[],
  ): void {
    const esRaiz = ancestroIds.length === 0
    indice.set(nodo.equipo.id, {
      label: nodo.equipo.label,
      direccionId: raiz.id,
      direccionLabel: raiz.label,
      ruta: ancestros.join(' · '),
      ancestros: ancestroIds,
      rutaArea: esRaiz ? [] : [...ancestros.slice(1), nodo.equipo.label],
      tieneHijos: nodo.hijos.length > 0,
    })
    for (const hijo of nodo.hijos) visitar(hijo, raiz, [...ancestros, nodo.equipo.label], [...ancestroIds, nodo.equipo.id])
  }
  for (const raiz of arbol) visitar(raiz, raiz.equipo, [], [])
  return indice
}

// ── Output ───────────────────────────────────────────────────────────────

export interface FilaVista extends FilaServidor {
  /** Non-retired servicios of this person across every equipo (>= 2 means "en varios equipos"). */
  readonly equiposDeLaPersona: number
  /** The shift names, in campus order, joined with ", "; "—" when none. */
  readonly turnosTexto: string
  /** The equipo name; a name repeated in the tree carries its parent ("Anfitriones · UpStreet"). */
  readonly equipoNombre: string
}

/**
 * "Por persona": a person once, with the servicios of theirs that pass the
 * filters, in the order of the current sort.
 */
export interface PersonaLista {
  readonly tipo: 'persona'
  /** The persona id. */
  readonly clave: string
  readonly nombre: string
  readonly telefono: string | null
  readonly tieneCuenta: boolean | null
  /** Every listed servicio comes from Grupos de Vida: the mark goes next to the name, once. */
  readonly soloGruposVida: boolean
  readonly filas: readonly FilaVista[]
}

export type ItemLista = { readonly tipo: 'fila'; readonly fila: FilaVista } | PersonaLista

/** A person shows this many servicios until "+N más" expands the rest. */
export const MAX_SERVICIOS_POR_PERSONA = 3

/** The servicios a person row shows, and how many "+N más" hides. */
export function recortarServicios<T>(filas: readonly T[], expandido: boolean): { visibles: readonly T[]; ocultos: number } {
  if (expandido || filas.length <= MAX_SERVICIOS_POR_PERSONA) return { visibles: filas, ocultos: 0 }
  return { visibles: filas.slice(0, MAX_SERVICIOS_POR_PERSONA), ocultos: filas.length - MAX_SERVICIOS_POR_PERSONA }
}

export interface Opcion {
  readonly id: string
  readonly label: string
}

export interface OpcionEquipo extends Opcion {
  readonly direccionId: string
}

export interface OpcionArea extends Opcion {
  readonly direccionId: string
  /** Depth below the dirección: 1 for its direct children. */
  readonly nivel: number
}

export interface Pastilla {
  readonly clave: string
  readonly etiqueta: string
  readonly quitarEtiqueta: string
  /** Applying this patch to the filters removes the pill (and whatever depends on it). */
  readonly parche: Partial<FiltrosServidores>
}

/** Id of the first KPI card ("Todas las direcciones" / "Toda la dirección"). */
export const TARJETA_TODAS = ''

export interface TarjetaConteo {
  readonly id: string
  readonly label: string
  /** "Dirige …" / "Coordina …": the active responsible, or `null`. */
  readonly responsable: string | null
  /** Distinct personas under every filter except the cards' own. */
  readonly personas: number
  /** Of those, the ones in `postulado` or `en_orientacion`. */
  readonly porActivar: number
  /** Of those, the ones without an account (an unknown account status never counts). */
  readonly sinCuenta: number
  /** Servicios per etapa under the same filters: the card's stacked etapa bar. */
  readonly porEtapa: Readonly<Record<DreamTeamEstado, number>>
  /** An área with equipos below: tapping it enters it instead of picking an equipo. */
  readonly esArea: boolean
}

export interface TarjetasServidores {
  /** Without a dirección the cards are the direcciones; with one, the next level of its tree. */
  readonly nivel: 'direcciones' | 'equipos'
  readonly todas: TarjetaConteo
  readonly items: readonly TarjetaConteo[]
  readonly seleccionadaId: string
  /** More than `MAX_EQUIPOS_EN_TARJETAS` cards: render a compact list instead. */
  readonly modoCompacto: boolean
}

/** An attention metric: distinct people under every filter but its own. */
export interface ContadorAtencion {
  readonly personas: number
  readonly activo: boolean
}

export type MetricaAtencionId = 'sirviendo' | 'porActivar' | 'sinCuenta' | 'sinTurno' | 'varios'

/** One level of the tree the screen is in; applying `parche` goes back to it. */
export interface Miga {
  readonly id: string
  readonly etiqueta: string
  readonly parche: Partial<FiltrosServidores>
}

export interface NavegacionServidores {
  /** "Servidores", then the dirección, the áreas down to the chosen one, and the equipo. */
  readonly migas: readonly Miga[]
  /** The label of the last crumb. */
  readonly titulo: string
  /** "Dirige …" / "Coordina …" of the current node; `null` at the root or without one. */
  readonly responsable: string | null
  /** Distinct people and servicios in the scope, before any other filter. */
  readonly personas: number
  readonly servicios: number
}

export interface VistaServidores {
  /** The filters actually applied (after the equipo → dirección normalization). */
  readonly filtros: FiltrosServidores
  readonly total: { readonly servicios: number; readonly personas: number }
  readonly tarjetas: TarjetasServidores
  readonly contadoresEtapa: {
    readonly todas: number
    readonly porEtapa: Readonly<Record<DreamTeamEstado, number>>
  }
  /**
   * Distinct people per age range under every filter but the age one: the age
   * metrics of whatever is selected. `null` when nobody listed has a known
   * range (the lookup failed or answered nobody), so the screen hides them.
   */
  readonly contadoresEdad: ContadoresEdad | null
  /** The attention metrics; `total` (people in the scope) is the denominator of their bars. */
  readonly atencion: Readonly<Record<MetricaAtencionId, ContadorAtencion>> & { readonly total: number }
  readonly navegacion: NavegacionServidores
  readonly opciones: {
    readonly direcciones: readonly Opcion[]
    /** Inner nodes of the chosen dirección with servicios below; empty without a dirección. */
    readonly areas: readonly OpcionArea[]
    readonly equipos: readonly OpcionEquipo[]
    readonly roles: readonly Opcion[]
    /** The campus shifts, in campus order; empty when no campus has any. */
    readonly turnos: readonly Opcion[]
  }
  readonly visibles: readonly FilaVista[]
  readonly items: readonly ItemLista[]
  /** Every person with ALL their servicios (the detail drawer), whatever the filters show. */
  readonly fichas: ReadonlyMap<string, PersonaLista>
  /** The active filters as removable chips; the scope (breadcrumbs) and the search (its box) are not chips. */
  readonly pastillas: readonly Pastilla[]
  /** Active filters that live in the sheet: etapa, atención, rol, turno, inicio. */
  readonly filtrosEnHoja: number
  readonly pie: { readonly resumen: string; readonly orden: string }
}

// ── Text helpers ─────────────────────────────────────────────────────────

const ES = 'es'

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

// ── Rules ────────────────────────────────────────────────────────────────

const MS_DIA = 86_400_000

function coincideTexto(fila: FilaServidor, q: string): boolean {
  const consulta = q.trim()
  if (consulta === '') return true
  if (sinAcentos(fila.nombre).includes(sinAcentos(consulta))) return true
  // Only a query made of phone characters is matched against phones, so a name
  // fragment with a digit never lights up unrelated numbers.
  if (/^[\d\s+()-]+$/.test(consulta) && fila.telefono) {
    const buscado = soloDigitos(consulta)
    if (buscado === '') return false
    const canonico = soloDigitos(normalizarTelefono(fila.telefono) ?? fila.telefono)
    const internacional = canonico.startsWith('0') ? `58${canonico.slice(1)}` : canonico
    return [soloDigitos(fila.telefono), canonico, internacional].some((candidato) => candidato.includes(buscado))
  }
  return false
}

function coincideInicio(fila: FilaServidor, inicio: Inicio, hoy: Date): boolean {
  if (inicio === 'cualquiera') return true
  // No start date: it cannot be "this month" nor "in the last 90 days".
  if (fila.fechaInicio === null) return false
  const fecha = new Date(fila.fechaInicio)
  if (Number.isNaN(fecha.getTime())) return false
  if (inicio === 'mes') {
    return fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth()
  }
  // 'trimestre': the last 90 days.
  return hoy.getTime() - fecha.getTime() <= 90 * MS_DIA
}

/** The filter a counter ignores; 'equipo' and 'ubicacion' (dirección + área + equipo) serve the KPI cards. */
type Salvo = 'etapa' | 'edad' | 'sinCuenta' | 'varios' | 'porActivar' | 'turno' | 'equipo' | 'ubicacion' | null

interface Contexto {
  readonly equiposPorPersona: ReadonlyMap<string, number>
  readonly hoy: Date
  readonly indice: ReadonlyMap<string, NodoIndexado>
}

/** Whether `equipoId` is `areaId` or hangs below it. */
function enArea(equipoId: string, areaId: string, indice: ReadonlyMap<string, NodoIndexado>): boolean {
  return equipoId === areaId || (indice.get(equipoId)?.ancestros.includes(areaId) ?? false)
}

/** Whether the row is inside the chosen dirección, área and equipo. */
function enUbicacion(fila: FilaServidor, f: FiltrosServidores, contexto: Contexto, conEquipo: boolean): boolean {
  if (f.direccion !== null && fila.direccionId !== f.direccion) return false
  if (f.area !== null && !enArea(fila.equipoId, f.area, contexto.indice)) return false
  return !conEquipo || f.equipo === null || fila.equipoId === f.equipo
}

/** Shifts are a Dream Team notion: a Grupos de Vida row never matches a shift filter. */
function coincideTurnoDeFila(fila: FilaServidor, turno: string): boolean {
  return fila.origen === 'dream_team' && coincideTurno(fila.turnoIds, turno)
}

function pasa(fila: FilaServidor, f: FiltrosServidores, contexto: Contexto, salvo: Salvo): boolean {
  if (!coincideTexto(fila, f.q)) return false
  if (salvo !== 'ubicacion' && !enUbicacion(fila, f, contexto, salvo !== 'equipo')) return false
  if (f.rol !== null && fila.rolLabel !== f.rol) return false
  if (salvo !== 'turno' && f.turno !== null && !coincideTurnoDeFila(fila, f.turno)) return false
  if (!coincideInicio(fila, f.inicio, contexto.hoy)) return false
  if (salvo !== 'sinCuenta' && f.sinCuenta && fila.tieneCuenta !== false) return false
  if (salvo !== 'varios' && f.varios && (contexto.equiposPorPersona.get(fila.personaId) ?? 0) < 2) return false
  if (salvo !== 'porActivar' && f.porActivar && !ESTADOS_POR_ACTIVAR.includes(fila.estado)) return false
  if (salvo !== 'etapa' && f.etapa !== null && fila.estado !== f.etapa) return false
  if (salvo !== 'edad' && f.edad !== null && fila.rangoEdad !== f.edad) return false
  return true
}

// ── Sorting ──────────────────────────────────────────────────────────────

const ORDEN_ETAPA: Readonly<Record<DreamTeamEstado, number>> = {
  postulado: 0,
  en_orientacion: 1,
  activo: 2,
  en_pausa: 3,
  inactivo: 4,
  retirado: 5,
}

/**
 * Hierarchy first, then alphabetical: Director (Dream Team) and Director
 * general, Director de etapa, Coordinador, Líder and Entrenador, Aprendiz,
 * the rest.
 */
function rangoDeRol(rol: string): number {
  const clave = sinAcentos(rol)
  if (clave === 'director de etapa') return 1
  if (clave.startsWith('director')) return 0
  if (clave.startsWith('coordinador')) return 2
  if (clave.startsWith('lider') || clave.startsWith('entrenador')) return 3
  if (clave.startsWith('colider') || clave.startsWith('aprendiz')) return 4
  return 5
}

/** Start date as a sortable number; a row without one sorts as the oldest. */
function marcaDeInicio(fila: FilaServidor): number {
  return fila.fechaInicio === null ? Number.MIN_SAFE_INTEGER : new Date(fila.fechaInicio).getTime()
}

function compararRol(a: string, b: string): number {
  return rangoDeRol(a) - rangoDeRol(b) || a.localeCompare(b, ES)
}

function comparar(columna: ColumnaOrden): (a: FilaServidor, b: FilaServidor) => number {
  switch (columna) {
    case 'equipo':
      return (a, b) => a.equipoLabel.localeCompare(b.equipoLabel, ES)
    case 'rol':
      return (a, b) => compararRol(a.rolLabel, b.rolLabel)
    case 'etapa':
      return (a, b) => ORDEN_ETAPA[a.estado] - ORDEN_ETAPA[b.estado]
    case 'inicio':
      return (a, b) => marcaDeInicio(a) - marcaDeInicio(b)
    case 'persona':
      return () => 0
  }
}

function ordenar(filas: readonly FilaVista[], orden: FiltrosServidores['orden']): FilaVista[] {
  const primaria = comparar(orden.columna)
  const signo = orden.sentido === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const valor =
      primaria(a, b) ||
      a.nombre.localeCompare(b.nombre, ES) ||
      a.equipoLabel.localeCompare(b.equipoLabel, ES) ||
      a.clave.localeCompare(b.clave)
    return valor * signo
  })
}

// ── Grouping ─────────────────────────────────────────────────────────────

/**
 * One item per person, in the order of their first row: `filas` is already
 * sorted, so persons follow the current sort and so do their servicios.
 */
function porPersona(filas: readonly FilaVista[]): PersonaLista[] {
  const personas = new Map<string, FilaVista[]>()
  for (const fila of filas) {
    const propias = personas.get(fila.personaId)
    if (propias) propias.push(fila)
    else personas.set(fila.personaId, [fila])
  }
  return [...personas].map(([clave, propias]) => ({
    tipo: 'persona',
    clave,
    nombre: propias[0].nombre,
    telefono: propias.find((fila) => fila.telefono !== null)?.telefono ?? null,
    tieneCuenta: propias.find((fila) => fila.tieneCuenta !== null)?.tieneCuenta ?? null,
    soloGruposVida: propias.every((fila) => fila.origen === 'grupos_vida'),
    filas: propias,
  }))
}

function agrupar(filas: readonly FilaVista[], como: Agrupar): ItemLista[] {
  return como === 'persona' ? porPersona(filas) : filas.map((fila) => ({ tipo: 'fila', fila }))
}

// ── Filters: cascade and pills ───────────────────────────────────────────

/**
 * An equipo or an área fixes its dirección: the dirección follows them, never
 * the other way round. An equipo outside the área drops the área.
 */
function normalizarFiltros(
  pedidos: FiltrosServidores,
  indice: ReadonlyMap<string, NodoIndexado>,
  filas: readonly FilaServidor[],
): FiltrosServidores {
  let filtros = pedidos
  if (filtros.area !== null && filtros.equipo !== null && indice.has(filtros.equipo) && !enArea(filtros.equipo, filtros.area, indice)) {
    filtros = { ...filtros, area: null }
  }
  if (filtros.area !== null) {
    const direccion = indice.get(filtros.area)?.direccionId
    if (direccion !== undefined) filtros = { ...filtros, direccion }
  }
  if (filtros.equipo === null) return filtros
  const direccion =
    indice.get(filtros.equipo)?.direccionId ?? filas.find((fila) => fila.equipoId === filtros.equipo)?.direccionId
  return direccion === undefined ? filtros : { ...filtros, direccion }
}

/** The patch that picks an equipo: it also sets that equipo's dirección. */
export function parcheElegirEquipo(equipoId: string | null, opciones: readonly OpcionEquipo[]): Partial<FiltrosServidores> {
  if (equipoId === null) return { equipo: null }
  const direccion = opciones.find((opcion) => opcion.id === equipoId)?.direccionId
  return direccion === undefined ? { equipo: equipoId } : { equipo: equipoId, direccion }
}

/** The patch that picks a dirección: the área and the equipo are dropped, their options change with it. */
export function parcheElegirDireccion(direccionId: string | null): Partial<FiltrosServidores> {
  return { direccion: direccionId, area: null, equipo: null }
}

/**
 * The patch for tapping a KPI card: a dirección card acts like the Dirección
 * selector, an área card like the Área selector (it enters the área), an
 * equipo card picks that equipo, and the first card ("Todas") removes the
 * level the cards stand for.
 */
export function parcheElegirTarjeta(
  tarjetas: TarjetasServidores,
  id: string,
  opciones: Pick<VistaServidores['opciones'], 'areas' | 'equipos'>,
): Partial<FiltrosServidores> {
  const valor = id === TARJETA_TODAS ? null : id
  if (tarjetas.nivel === 'direcciones') return parcheElegirDireccion(valor)
  if (valor !== null && tarjetas.items.find((tarjeta) => tarjeta.id === valor)?.esArea) {
    return parcheElegirArea(valor, opciones.areas)
  }
  return parcheElegirEquipo(valor, opciones.equipos)
}

/** The patch that picks an área: the equipo is dropped and the dirección follows the área. */
export function parcheElegirArea(areaId: string | null, opciones: readonly OpcionArea[]): Partial<FiltrosServidores> {
  if (areaId === null) return { area: null, equipo: null }
  const direccion = opciones.find((opcion) => opcion.id === areaId)?.direccionId
  return direccion === undefined ? { area: areaId, equipo: null } : { area: areaId, equipo: null, direccion }
}

/** "Waumba Land › Sala B". */
function etiquetaArea(nodo: NodoIndexado | undefined, id: string): string {
  return nodo && nodo.rutaArea.length > 0 ? nodo.rutaArea.join(' › ') : (nodo?.label ?? id)
}

function textoOrden(orden: FiltrosServidores['orden']): string {
  return `${ETIQUETA_COLUMNA[orden.columna].toLowerCase()}, ${orden.sentido === 'asc' ? 'ascendente' : 'descendente'}`
}

const ETIQUETA_INICIO: Readonly<Record<Exclude<Inicio, 'cualquiera'>, string>> = {
  mes: 'Inicio: este mes',
  trimestre: 'Inicio: últimos 3 meses',
}

/** The chips of the filters; the scope is in the breadcrumbs and the search in its box. */
function construirPastillas(f: FiltrosServidores, turnoLabel: (id: string) => string): Pastilla[] {
  const pastillas: Pastilla[] = []
  function agregar(clave: string, etiqueta: string, parche: Partial<FiltrosServidores>): void {
    pastillas.push({ clave, etiqueta, quitarEtiqueta: `Quitar el filtro ${etiqueta}`, parche })
  }
  if (f.etapa !== null) agregar('etapa', `Etapa: ${ESTADO_LABELS[f.etapa]}`, { etapa: null })
  if (f.rol !== null) agregar('rol', `Rol: ${f.rol}`, { rol: null })
  if (f.turno !== null) agregar('turno', f.turno === SIN_TURNO ? 'Sin turno' : `Turno: ${turnoLabel(f.turno)}`, { turno: null })
  if (f.edad !== null) agregar('edad', `Edad: ${RANGO_EDAD_LABELS[f.edad]}`, { edad: null })
  if (f.inicio !== 'cualquiera') agregar('inicio', ETIQUETA_INICIO[f.inicio], { inicio: 'cualquiera' })
  if (f.porActivar) agregar('por_activar', 'Por activar', { porActivar: false })
  if (f.sinCuenta) agregar('sin_cuenta', 'Sin cuenta', { sinCuenta: false })
  if (f.varios) agregar('varios', 'En varios equipos', { varios: false })
  return pastillas
}

/**
 * The patch for pressing an attention metric: "Sirviendo" is the etapa
 * Activo, "Sin turno" the shift filter "Sin turno", the rest their own flag.
 * Pressing an active metric removes its filter.
 */
export function parcheAtencion(filtros: FiltrosServidores, id: MetricaAtencionId): Partial<FiltrosServidores> {
  switch (id) {
    case 'sirviendo':
      return { etapa: filtros.etapa === 'activo' ? null : 'activo' }
    case 'sinTurno':
      return { turno: filtros.turno === SIN_TURNO ? null : SIN_TURNO }
    case 'porActivar':
      return { porActivar: !filtros.porActivar }
    case 'sinCuenta':
      return { sinCuenta: !filtros.sinCuenta }
    case 'varios':
      return { varios: !filtros.varios }
  }
}

/** The shift names of a servicio in campus order; "—" when it has none (or is not a Dream Team row). */
function textoDeTurnos(
  turnoIds: readonly string[] | undefined,
  turnos: readonly Turno[],
  frecuencias: FrecuenciasPorTurno | undefined,
  hoy: Date,
): string {
  if (!turnoIds || turnoIds.length === 0) return SIN_TURNOS_TEXTO
  const nombres = turnos
    .filter((turno) => turnoIds.includes(turno.id))
    .map((turno) => nombreConFrecuencia(turno.nombre, frecuencias?.[turno.id], isoLocal(hoy), turno.tipo))
  return nombres.length > 0 ? nombres.join(', ') : SIN_TURNOS_TEXTO
}

export const SIN_TURNOS_TEXTO = '—'

// ── The view ─────────────────────────────────────────────────────────────

// ── KPI cards ──────────────────────────────────────────────────────────────────

/** "Coordina …" else "Dirige …": the first active match, alphabetically; `null` without one. */
function responsableDe(filas: readonly FilaServidor[], roles: readonly ('coordinador' | 'director')[]): string | null {
  for (const rol of roles) {
    const nombres = filas
      .filter((fila) => fila.estado === 'activo' && esRol(fila.rolLabel, rol))
      .map((fila) => fila.nombre)
      .sort((a, b) => a.localeCompare(b, ES))
    if (nombres.length > 0) return `${rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${nombres[0]}`
  }
  return null
}

/**
 * The one-line responsible of a scope card (docs/design-system/migration.md,
 * decisions 2026-10-28, 5): "Dirige Antholy Ludovic Gómez" → "Dirige Antholy
 * Gómez". Keeps the verb, the first name and the first surname: the last word
 * of a three-word name (as the prototype), the second to last of a longer one
 * ("Ana María Pérez López" → "Ana Pérez"). Initials ("M.") are dropped.
 */
export function responsableCorto(responsable: string): string {
  const [verbo = '', ...nombre] = responsable.split(/\s+/).filter(Boolean)
  const palabras = nombre.filter((palabra) => !palabra.endsWith('.'))
  const corto =
    palabras.length <= 2
      ? palabras
      : [palabras[0], palabras.length === 3 ? palabras[2] : palabras[palabras.length - 2]]
  return [verbo, ...corto].join(' ')
}

/** A Dream Team director or coordinador; a Grupos de Vida "Director de etapa" is neither. */
function esRol(rolLabel: string, rol: 'coordinador' | 'director'): boolean {
  const clave = sinAcentos(rolLabel)
  return rol === 'coordinador' ? clave.startsWith('coordinador') : clave === 'director' || clave === 'directora'
}

function conteo(filas: readonly FilaServidor[]): Pick<TarjetaConteo, 'personas' | 'porActivar' | 'sinCuenta' | 'porEtapa'> {
  const personasQueCumplen = (cumple: (fila: FilaServidor) => boolean): number =>
    new Set(filas.filter(cumple).map((fila) => fila.personaId)).size
  const porEtapa = Object.fromEntries(DREAM_TEAM_ESTADOS.map((estado) => [estado, 0])) as Record<DreamTeamEstado, number>
  for (const fila of filas) porEtapa[fila.estado] += 1
  return {
    personas: personasQueCumplen(() => true),
    porActivar: personasQueCumplen((fila) => ESTADOS_POR_ACTIVAR.includes(fila.estado)),
    sinCuenta: personasQueCumplen((fila) => fila.tieneCuenta === false),
    porEtapa,
  }
}

interface EntradaTarjetas {
  readonly filas: readonly FilaServidor[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly filtros: FiltrosServidores
  readonly contexto: Contexto
  readonly direcciones: readonly Opcion[]
}

function buscarNodo(nodos: readonly NodoArbol<NodoEquipoArbol>[], id: string): NodoArbol<NodoEquipoArbol> | null {
  for (const nodo of nodos) {
    if (nodo.equipo.id === id) return nodo
    const encontrado = buscarNodo(nodo.hijos, id)
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Without a dirección: "Todas las direcciones" plus one card per dirección,
 * counted over every filter but dirección/área/equipo. With one, the cards
 * follow the tree one level at a time: the children of the chosen área (or of
 * the dirección) that have servicios below, each counting its whole branch
 * over every filter but the equipo. A lone área in between (Conexión →
 * Talleres) is skipped so a single card never stands alone. A node's own
 * people (a dirección's director) live only in the first card, as in Mi equipo.
 */
function calcularTarjetas({ filas, arbol, filtros, contexto, direcciones }: EntradaTarjetas): TarjetasServidores {
  if (filtros.direccion === null) {
    const base = filas.filter((fila) => pasa(fila, filtros, contexto, 'ubicacion'))
    const items = direcciones.map(({ id, label }) => ({
      id,
      label,
      responsable: responsableDe(
        filas.filter((fila) => fila.equipoId === id),
        ['director'],
      ),
      ...conteo(base.filter((fila) => fila.direccionId === id)),
      esArea: false,
    }))
    return {
      nivel: 'direcciones',
      todas: { id: TARJETA_TODAS, label: 'Todas las direcciones', responsable: null, ...conteo(base), esArea: false },
      items,
      seleccionadaId: TARJETA_TODAS,
      modoCompacto: items.length > MAX_EQUIPOS_EN_TARJETAS,
    }
  }

  const raizId = filtros.area ?? filtros.direccion
  const raiz = buscarNodo(arbol, raizId)
  const enRama = (fila: FilaServidor, id: string): boolean => enArea(fila.equipoId, id, contexto.indice)
  const conServicios = (nodo: NodoArbol<NodoEquipoArbol>): boolean => filas.some((fila) => enRama(fila, nodo.equipo.id))
  let hijos = raiz ? raiz.hijos.filter(conServicios) : []
  while (hijos.length === 1 && hijos[0].hijos.length > 0) hijos = hijos[0].hijos.filter(conServicios)
  hijos = [...hijos].sort((a, b) => a.equipo.label.localeCompare(b.equipo.label, ES))

  const base = filas.filter((fila) => pasa(fila, filtros, contexto, 'equipo'))
  const items = hijos.map(({ equipo, hijos: nietos }) => ({
    id: equipo.id,
    label: equipo.label,
    responsable: responsableDe(
      filas.filter((fila) => fila.equipoId === equipo.id),
      ['coordinador', 'director'],
    ),
    ...conteo(base.filter((fila) => enRama(fila, equipo.id))),
    esArea: nietos.length > 0,
  }))
  return {
    nivel: 'equipos',
    todas: {
      id: TARJETA_TODAS,
      label: filtros.area === null ? 'Toda la dirección' : `Todo ${raiz?.equipo.label ?? ''}`.trim(),
      responsable: responsableDe(
        filas.filter((fila) => fila.equipoId === raizId),
        filtros.area === null ? ['director'] : ['coordinador', 'director'],
      ),
      ...conteo(base),
      esArea: false,
    },
    items,
    seleccionadaId: filtros.equipo ?? TARJETA_TODAS,
    modoCompacto: items.length > MAX_EQUIPOS_EN_TARJETAS,
  }
}

// ── Breadcrumbs and equipo names ─────────────────────────────────────────────

/**
 * Names each node for the list: a label that repeats in the tree ("Anfitriones"
 * in Waumba Land and in UpStreet) carries its parent's label.
 */
function nombresDeEquipo(indice: ReadonlyMap<string, NodoIndexado>): ReadonlyMap<string, string> {
  const repeticiones = new Map<string, number>()
  for (const nodo of indice.values()) repeticiones.set(nodo.label, (repeticiones.get(nodo.label) ?? 0) + 1)
  const nombres = new Map<string, string>()
  for (const [id, nodo] of indice) {
    const padre = indice.get(nodo.ancestros[nodo.ancestros.length - 1] ?? '')
    nombres.set(id, (repeticiones.get(nodo.label) ?? 0) > 1 && padre ? `${nodo.label} · ${padre.label}` : nodo.label)
  }
  return nombres
}

interface EntradaNavegacion {
  readonly filas: readonly FilaServidor[]
  readonly filtros: FiltrosServidores
  readonly contexto: Contexto
  readonly nombreEquipo: (id: string) => string
}

function construirNavegacion({ filas, filtros, contexto, nombreEquipo }: EntradaNavegacion): NavegacionServidores {
  const { direccion, area, equipo } = filtros
  const etiqueta = (id: string): string => contexto.indice.get(id)?.label ?? id
  const migas: Miga[] = [{ id: TARJETA_TODAS, etiqueta: 'Servidores', parche: { direccion: null, area: null, equipo: null } }]
  if (direccion !== null) {
    migas.push({ id: direccion, etiqueta: etiqueta(direccion), parche: { direccion, area: null, equipo: null } })
    if (area !== null) {
      // The áreas from below the dirección down to the chosen one.
      for (const id of [...(contexto.indice.get(area)?.ancestros.slice(1) ?? []), area]) {
        migas.push({ id, etiqueta: etiqueta(id), parche: { direccion, area: id, equipo: null } })
      }
    }
  }
  if (equipo !== null && equipo !== migas[migas.length - 1].id) {
    migas.push({ id: equipo, etiqueta: nombreEquipo(equipo), parche: { direccion, area, equipo } })
  }

  const actual = migas[migas.length - 1]
  const enAlcance = filas.filter((fila) => enUbicacion(fila, filtros, contexto, true))
  return {
    migas,
    titulo: actual.etiqueta,
    responsable:
      actual.id === TARJETA_TODAS
        ? null
        : responsableDe(
            filas.filter((fila) => fila.equipoId === actual.id),
            actual.id === direccion ? ['director'] : ['coordinador', 'director'],
          ),
    personas: new Set(enAlcance.map((fila) => fila.personaId)).size,
    servicios: enAlcance.length,
  }
}

/** Distinct people of the rows that pass every filter but `salvo` and also match `cumple`. */
function personasQue(
  filas: readonly FilaServidor[],
  filtros: FiltrosServidores,
  contexto: Contexto,
  salvo: Salvo,
  cumple: (fila: FilaServidor) => boolean,
): number {
  return new Set(filas.filter((fila) => pasa(fila, filtros, contexto, salvo) && cumple(fila)).map((fila) => fila.personaId)).size
}

export interface EntradaVistaServidores {
  readonly filas: readonly FilaServidor[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly filtros: FiltrosServidores
  /** Injected so tests do not depend on the clock. */
  readonly hoy?: Date
  /** Every active shift: names the shift column, and (by campus) the filter options. */
  readonly turnos?: readonly Turno[]
  /** The campus selected in the app; the filter offers only its shifts. `null` = every campus. */
  readonly campusId?: string | null
}

export function calcularVistaServidores({
  filas,
  arbol,
  filtros: pedidos,
  hoy = new Date(),
  turnos = [],
  campusId = null,
}: EntradaVistaServidores): VistaServidores {
  const indice = indexarArbol(arbol)
  const filtros = normalizarFiltros(pedidos, indice, filas)

  const equiposPorPersona = new Map<string, number>()
  for (const fila of filas) {
    if (fila.estado === 'retirado') continue
    equiposPorPersona.set(fila.personaId, (equiposPorPersona.get(fila.personaId) ?? 0) + 1)
  }
  const contexto: Contexto = { equiposPorPersona, hoy, indice }
  const turnosOrdenados = ordenarTurnos(turnos)
  const nombres = nombresDeEquipo(indice)
  const nombreEquipo = (id: string): string => nombres.get(id) ?? id
  const conVista = (fila: FilaServidor): FilaVista => ({
    ...fila,
    equiposDeLaPersona: equiposPorPersona.get(fila.personaId) ?? 0,
    turnosTexto: textoDeTurnos(fila.turnoIds, turnosOrdenados, fila.frecuencias, hoy),
    equipoNombre: nombres.get(fila.equipoId) ?? fila.equipoLabel,
  })

  // Counters: every filter except the one the counter belongs to.
  const sinEtapa = filas.filter((fila) => pasa(fila, filtros, contexto, 'etapa'))
  const porEtapa = Object.fromEntries(DREAM_TEAM_ESTADOS.map((estado) => [estado, 0])) as Record<DreamTeamEstado, number>
  for (const fila of sinEtapa) porEtapa[fila.estado] += 1
  const contadoresEdad = filas.some((fila) => fila.rangoEdad !== undefined)
    ? contarPorRangoEdad(filas.filter((fila) => pasa(fila, filtros, contexto, 'edad')))
    : null

  const navegacion = construirNavegacion({ filas, filtros, contexto, nombreEquipo })
  const atencion = {
    total: navegacion.personas,
    sirviendo: {
      personas: personasQue(filas, filtros, contexto, 'etapa', (fila) => fila.estado === 'activo'),
      activo: filtros.etapa === 'activo',
    },
    porActivar: {
      personas: personasQue(filas, filtros, contexto, 'porActivar', (fila) => ESTADOS_POR_ACTIVAR.includes(fila.estado)),
      activo: filtros.porActivar,
    },
    sinCuenta: {
      personas: personasQue(filas, filtros, contexto, 'sinCuenta', (fila) => fila.tieneCuenta === false),
      activo: filtros.sinCuenta,
    },
    sinTurno: {
      personas: personasQue(filas, filtros, contexto, 'turno', (fila) => coincideTurnoDeFila(fila, SIN_TURNO)),
      activo: filtros.turno === SIN_TURNO,
    },
    varios: {
      personas: personasQue(filas, filtros, contexto, 'varios', (fila) => (equiposPorPersona.get(fila.personaId) ?? 0) >= 2),
      activo: filtros.varios,
    },
  }

  // Options: dirección → equipo cascade, roles present.
  const direccionesConServicios = new Map<string, string>()
  const equiposConServicios = new Map<string, OpcionEquipo>()
  for (const fila of filas) {
    direccionesConServicios.set(fila.direccionId, indice.get(fila.direccionId)?.label ?? fila.direccionId)
    if (!equiposConServicios.has(fila.equipoId)) {
      equiposConServicios.set(fila.equipoId, { id: fila.equipoId, label: fila.equipoLabel, direccionId: fila.direccionId })
    }
  }
  const porLabel = (a: Opcion, b: Opcion): number => a.label.localeCompare(b.label, ES)
  const direcciones = [...direccionesConServicios].map(([id, label]) => ({ id, label })).sort(porLabel)
  const areasConServicios = new Map<string, OpcionArea>()
  if (filtros.direccion !== null) {
    for (const fila of filas) {
      if (fila.direccionId !== filtros.direccion) continue
      const nodo = indice.get(fila.equipoId)
      if (!nodo) continue
      for (const id of [...nodo.ancestros.slice(1), fila.equipoId]) {
        const area = indice.get(id)
        if (!area || area.rutaArea.length === 0 || !area.tieneHijos || areasConServicios.has(id)) continue
        areasConServicios.set(id, { id, label: etiquetaArea(area, id), direccionId: area.direccionId, nivel: area.rutaArea.length })
      }
    }
  }
  const areas = [...areasConServicios.values()].sort(porLabel)
  let equipos = [...equiposConServicios.values()].filter(
    (equipo) =>
      (filtros.direccion === null || equipo.direccionId === filtros.direccion) &&
      (filtros.area === null || enArea(equipo.id, filtros.area, indice)),
  )
  if (filtros.equipo !== null && !equipos.some((equipo) => equipo.id === filtros.equipo)) {
    // A link to an equipo without servicios still shows its own selection.
    equipos = [
      ...equipos,
      {
        id: filtros.equipo,
        label: indice.get(filtros.equipo)?.label ?? filtros.equipo,
        direccionId: filtros.direccion ?? '',
      },
    ]
  }
  equipos.sort(porLabel)
  const roles = [...new Set(filas.map((fila) => fila.rolLabel))]
    .sort(compararRol)
    .map((rol) => ({ id: rol, label: rol }))
  const opcionesTurno = turnosOrdenados
    .filter((turno) => campusId === null || turno.campusId === campusId)
    .map((turno) => ({ id: turno.id, label: turno.nombre }))

  // Visible rows: sorted, then grouped.
  const visibles = ordenar(
    filas.filter((fila) => pasa(fila, filtros, contexto, null)).map(conVista),
    filtros.orden,
  )
  const personasVisibles = new Set(visibles.map((fila) => fila.personaId)).size

  const tarjetas = calcularTarjetas({ filas, arbol, filtros, contexto, direcciones })

  const etiquetaTurno = (id: string): string => turnosOrdenados.find((turno) => turno.id === id)?.nombre ?? id

  return {
    filtros,
    total: { servicios: filas.length, personas: new Set(filas.map((fila) => fila.personaId)).size },
    tarjetas,
    contadoresEtapa: { todas: sinEtapa.length, porEtapa },
    contadoresEdad,
    atencion,
    navegacion,
    opciones: { direcciones, areas, equipos, roles, turnos: opcionesTurno },
    visibles,
    items: agrupar(visibles, filtros.agrupar),
    fichas: new Map(
      porPersona(ordenar(filas.map(conVista), { columna: 'equipo', sentido: 'asc' })).map((persona) => [persona.clave, persona]),
    ),
    pastillas: construirPastillas(filtros, etiquetaTurno),
    filtrosEnHoja: [
      filtros.etapa !== null,
      filtros.rol !== null,
      filtros.turno !== null,
      filtros.inicio !== 'cualquiera',
      filtros.porActivar,
      filtros.sinCuenta,
      filtros.varios,
    ].filter(Boolean).length,
    pie: {
      resumen:
        filtros.agrupar === 'persona'
          ? `${plural(personasVisibles, 'persona', 'personas')} · ${plural(visibles.length, 'servicio', 'servicios')}`
          : `${plural(visibles.length, 'servicio', 'servicios')} · ${plural(personasVisibles, 'persona', 'personas')}`,
      orden: `Orden: ${textoOrden(filtros.orden)}`,
    },
  }
}

// ── URL codec ────────────────────────────────────────────────────────────

/** `URLSearchParams`, Next's `ReadonlyURLSearchParams`, or the plain record a page receives. */
export type ParametrosDeUrl =
  | { get(nombre: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>

function leer(parametros: ParametrosDeUrl, nombre: string): string | null {
  if (typeof (parametros as { get?: unknown }).get === 'function') {
    return (parametros as { get(n: string): string | null }).get(nombre)
  }
  const valor = (parametros as Readonly<Record<string, string | readonly string[] | undefined>>)[nombre]
  if (Array.isArray(valor)) return valor[0] ?? null
  return typeof valor === 'string' ? valor : null
}

function textoOpcional(valor: string | null): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

function esEstado(valor: string | null): valor is DreamTeamEstado {
  return valor !== null && (DREAM_TEAM_ESTADOS as readonly string[]).includes(valor)
}

function esVerdadero(valor: string | null): boolean {
  return valor === '1' || valor === 'true'
}

function leerOrden(valor: string | null): FiltrosServidores['orden'] {
  if (valor === null) return FILTROS_INICIALES.orden
  const [columna, sentido] = valor.split(':')
  if (!(COLUMNAS_ORDEN as readonly string[]).includes(columna)) return FILTROS_INICIALES.orden
  return { columna: columna as ColumnaOrden, sentido: sentido === 'desc' ? 'desc' : 'asc' }
}

/**
 * Reads the filters from the URL. Accepts the legacy `?estado=` (etapa) that
 * older links use; `?equipo=` keeps its meaning. Invalid values are dropped.
 * Without `?agrupar=` the list is per person; "Por servicio" is
 * `?agrupar=ninguno`. The removed "Por equipo" (`?agrupar=equipo`) reads as
 * the default.
 */
export function leerFiltrosDeUrl(parametros: ParametrosDeUrl): FiltrosServidores {
  const etapa = leer(parametros, 'etapa') ?? leer(parametros, 'estado')
  const inicio = leer(parametros, 'inicio')
  const agruparPor = leer(parametros, 'agrupar')
  const edad = leer(parametros, 'edad')
  return {
    etapa: esEstado(etapa) ? etapa : null,
    direccion: textoOpcional(leer(parametros, 'direccion')),
    area: textoOpcional(leer(parametros, 'area')),
    equipo: textoOpcional(leer(parametros, 'equipo')),
    rol: textoOpcional(leer(parametros, 'rol')),
    turno: textoOpcional(leer(parametros, 'turno')),
    edad: esRangoEdad(edad) ? edad : null,
    inicio: inicio === 'mes' || inicio === 'trimestre' ? inicio : 'cualquiera',
    sinCuenta: esVerdadero(leer(parametros, 'sin_cuenta')),
    varios: esVerdadero(leer(parametros, 'varios')),
    porActivar: esVerdadero(leer(parametros, 'por_activar')),
    q: leer(parametros, 'q')?.trim() ?? '',
    agrupar: agruparPor === 'ninguno' ? agruparPor : FILTROS_INICIALES.agrupar,
    orden: leerOrden(leer(parametros, 'orden')),
  }
}

/** The query string (without `?`) for the filters; defaults are left out. */
export function escribirFiltrosEnUrl(filtros: FiltrosServidores): string {
  const parametros = new URLSearchParams()
  if (filtros.etapa !== null) parametros.set('etapa', filtros.etapa)
  if (filtros.direccion !== null) parametros.set('direccion', filtros.direccion)
  if (filtros.area !== null) parametros.set('area', filtros.area)
  if (filtros.equipo !== null) parametros.set('equipo', filtros.equipo)
  if (filtros.rol !== null) parametros.set('rol', filtros.rol)
  if (filtros.turno !== null) parametros.set('turno', filtros.turno)
  if (filtros.edad !== null) parametros.set('edad', filtros.edad)
  if (filtros.inicio !== 'cualquiera') parametros.set('inicio', filtros.inicio)
  if (filtros.sinCuenta) parametros.set('sin_cuenta', '1')
  if (filtros.varios) parametros.set('varios', '1')
  if (filtros.porActivar) parametros.set('por_activar', '1')
  if (filtros.q.trim() !== '') parametros.set('q', filtros.q.trim())
  if (filtros.agrupar !== FILTROS_INICIALES.agrupar) parametros.set('agrupar', filtros.agrupar)
  const { columna, sentido } = filtros.orden
  if (columna !== FILTROS_INICIALES.orden.columna || sentido !== FILTROS_INICIALES.orden.sentido) {
    parametros.set('orden', sentido === 'asc' ? columna : `${columna}:desc`)
  }
  return parametros.toString()
}
