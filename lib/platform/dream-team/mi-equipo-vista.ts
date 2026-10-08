/**
 * `mi-equipo-vista.ts` — the pure view model behind /dream-team/mi-equipo.
 *
 * The screen works with people, not with the org chart: it shows ONE
 * direccion (a root node of the tree) at a time, one card per team inside it
 * and the people of the selected team. This module turns the merged tree
 * (real equipos + the virtual Grupos de Vida branch, see estructura-arbol.ts)
 * and the people serving on each node into exactly that, with no I/O and no
 * React so the server page and the client island share the same rules and
 * the rules are unit-testable.
 *
 * Vocabulary:
 *   - direccion: a root node that has at least one person in its branch.
 *   - equipo (card): a node that has people of its OWN. An intermediate node
 *     with none is not a card — its descendants are.
 *   - "Toda la dirección": the synthetic aggregate; the only place where the
 *     people sitting on the root node itself (its director) appear.
 */
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado, type PersonaId } from './types'
import type { NodoArbol } from './arbol'
import type { NodoEquipoArbol } from './estructura-arbol'
import { coincideTurno } from './turnos'

/** Id of the synthetic "Toda la dirección" selection. */
export const TODOS_LOS_EQUIPOS = 'todos'

/** Above this many teams the cards give way to a compact, searchable list. */
export const MAX_EQUIPOS_EN_TARJETAS = 8

/** Estados that mean "someone still has to activate this person". */
export const ESTADOS_POR_ACTIVAR: readonly DreamTeamEstado[] = ['postulado', 'en_orientacion']

/** `por_activar` groups postulado + en_orientacion; it backs the strip's "Revisar". */
export type FiltroEstado = DreamTeamEstado | 'todos' | 'por_activar'

/**
 * One person serving on a node, as the page hands it over. `rolClave` is the
 * normalized role key used for ordering and badge color (`director`,
 * `coordinador`, `facilitador`, `lider`, ...); `rolLabel` is the final
 * Spanish text. A Grupos de Vida leader has no servicio: `servicioId` and
 * `version` are absent and `origen` is `grupos_vida`, which makes the row
 * read-only.
 */
export interface PersonaEntrada {
  readonly clave: string
  readonly personaId: PersonaId
  readonly nombre: string
  readonly rolClave: string
  readonly rolLabel: string
  readonly estado: DreamTeamEstado
  readonly origen: 'dream_team' | 'grupos_vida'
  readonly servicioId?: string
  readonly version?: number
  /**
   * The phone on the person's profile and whether they have an account, from
   * dream_team_contactos_personas (scoped to what the caller may see). Absent
   * (or null) when the lookup did not answer for them: neither is shown.
   */
  readonly telefono?: string | null
  readonly tieneCuenta?: boolean | null
  /** Campus service shifts of a Dream Team servicio (D12); absent or empty = none yet. */
  readonly turnoIds?: readonly string[]
  /** Whether the viewer may fix the person's ficha (T11; checked again by dream_team_editar_ficha). */
  readonly fichaEditable?: boolean
}

export interface PersonaVista {
  readonly clave: string
  readonly servicioId?: string
  readonly version?: number
  readonly personaId: PersonaId
  readonly nombre: string
  readonly iniciales: string
  readonly equipoId: string
  readonly equipoLabel: string
  readonly rolClave: string
  readonly rolLabel: string
  readonly rolOrden: number
  readonly estado: DreamTeamEstado
  readonly origen: 'dream_team' | 'grupos_vida'
  /** True when the row can be acted on (its estado changed) from this screen. */
  readonly editable: boolean
  /** Profile phone, or null when none / not visible to the caller. */
  readonly telefono: string | null
  /** false = known to have no account; null = unknown (not visible to the caller). */
  readonly tieneCuenta: boolean | null
  /** Campus service shifts of the servicio; absent or empty = none yet. */
  readonly turnoIds?: readonly string[]
  /** Whether the viewer may fix the person's ficha (T11; checked again by dream_team_editar_ficha). */
  readonly fichaEditable?: boolean
}

export interface ResponsableVista {
  readonly nombre: string
  readonly rol: 'coordinador' | 'director'
}

export interface TarjetaEquipo {
  readonly id: string
  readonly label: string
  readonly responsable: ResponsableVista | null
  readonly total: number
  /** People in `postulado` or `en_orientacion`. */
  readonly porActivar: number
}

export interface DireccionResumen {
  readonly id: string
  readonly label: string
  readonly total: number
}

export interface VistaDireccion {
  readonly id: string
  readonly label: string
  readonly total: number
  readonly todaLaDireccion: TarjetaEquipo
  readonly equipos: readonly TarjetaEquipo[]
  /** More than `MAX_EQUIPOS_EN_TARJETAS` teams: render a compact list instead of cards. */
  readonly modoCompacto: boolean
  /** Every person of the direccion, sorted. */
  readonly personas: readonly PersonaVista[]
  /** People waiting to be activated (postulado / en_orientacion). */
  readonly pendientes: readonly PersonaVista[]
}

export type PersonasPorEquipo = Readonly<Record<string, readonly PersonaEntrada[]>>
export type ArbolVista = readonly NodoArbol<NodoEquipoArbol>[]

// ── Helpers ──────────────────────────────────────────────────────────────

/** Lowercase, no diacritics, trimmed: what search and role keys compare on. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Grupos de Vida people use their own keys (`director_general`,
// `director_etapa`, `lider`, `colider`): director general, director de etapa,
// líder, then aprendiz. The Dream Team roles keep their relative order.
const ORDEN_ROL: Readonly<Record<string, number>> = {
  director: 0,
  director_general: 0,
  director_etapa: 1,
  coordinador: 2,
  lider: 3,
  facilitador: 3,
  entrenador: 3,
  colider: 4,
  voluntario: 5,
}
const ORDEN_ROL_OTROS = 6

export function ordenDeRol(rolClave: string): number {
  return ORDEN_ROL[normalizarTexto(rolClave)] ?? ORDEN_ROL_OTROS
}

export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''
  const inicial = (parte: string): string => parte.charAt(0).toLocaleUpperCase('es')
  if (partes.length === 1) return inicial(partes[0])
  return inicial(partes[0]) + inicial(partes[partes.length - 1])
}

function ordenarPersonas(personas: readonly PersonaVista[]): PersonaVista[] {
  return [...personas].sort(
    (a, b) => a.rolOrden - b.rolOrden || a.nombre.localeCompare(b.nombre, 'es') || a.clave.localeCompare(b.clave),
  )
}

function aVista(entrada: PersonaEntrada, equipoId: string, equipoLabel: string): PersonaVista {
  return {
    clave: entrada.clave,
    servicioId: entrada.servicioId,
    version: entrada.version,
    personaId: entrada.personaId,
    nombre: entrada.nombre,
    iniciales: inicialesDe(entrada.nombre),
    equipoId,
    equipoLabel,
    rolClave: entrada.rolClave,
    rolLabel: entrada.rolLabel,
    rolOrden: ordenDeRol(entrada.rolClave),
    estado: entrada.estado,
    origen: entrada.origen,
    editable: entrada.origen === 'dream_team',
    telefono: entrada.telefono ?? null,
    tieneCuenta: entrada.tieneCuenta ?? null,
    turnoIds: entrada.turnoIds ?? [],
    fichaEditable: entrada.fichaEditable === true,
  }
}

function contarPorActivar(personas: readonly { readonly estado: DreamTeamEstado }[]): number {
  return personas.filter((persona) => ESTADOS_POR_ACTIVAR.includes(persona.estado)).length
}

function nodosDeLaRama(raiz: NodoArbol<NodoEquipoArbol>): NodoArbol<NodoEquipoArbol>[] {
  return [raiz, ...raiz.hijos.flatMap(nodosDeLaRama)]
}

function totalDeLaRama(raiz: NodoArbol<NodoEquipoArbol>, personasPorEquipo: PersonasPorEquipo): number {
  return nodosDeLaRama(raiz).reduce((suma, nodo) => suma + (personasPorEquipo[nodo.equipo.id]?.length ?? 0), 0)
}

/** The active coordinador, else the active director, of a node's own people; alphabetical among equals. */
function responsableDe(personas: readonly PersonaEntrada[]): ResponsableVista | null {
  for (const rol of ['coordinador', 'director'] as const) {
    const candidatos = personas
      .filter((persona) => persona.estado === 'activo' && normalizarTexto(persona.rolClave) === rol)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    if (candidatos.length > 0) return { nombre: candidatos[0].nombre, rol }
  }
  return null
}

// ── Direcciones ──────────────────────────────────────────────────────────

/**
 * The direcciones worth offering: active roots with at least one person in
 * their branch. When none qualifies but the caller reaches a single root,
 * that root is still offered so the screen is never blank for a director of
 * a brand-new area.
 */
export function listarDirecciones(arbol: ArbolVista, personasPorEquipo: PersonasPorEquipo): DireccionResumen[] {
  const resumenes = arbol.map((raiz) => ({
    id: raiz.equipo.id,
    label: raiz.equipo.label,
    total: totalDeLaRama(raiz, personasPorEquipo),
    activo: raiz.equipo.activo,
  }))
  const visibles = resumenes.filter((direccion) => direccion.activo && direccion.total > 0)
  const elegidas = visibles.length === 0 && resumenes.length === 1 ? resumenes : visibles
  return elegidas.map(({ id, label, total }) => ({ id, label, total }))
}

// ── One direccion ────────────────────────────────────────────────────────

/**
 * Everything the screen needs for one direccion, or `null` when `direccionId`
 * is not a root of the tree.
 */
export function vistaDeDireccion(
  arbol: ArbolVista,
  personasPorEquipo: PersonasPorEquipo,
  direccionId: string,
): VistaDireccion | null {
  const raiz = arbol.find((nodo) => nodo.equipo.id === direccionId)
  if (!raiz) return null

  const personas: PersonaVista[] = []
  const equipos: TarjetaEquipo[] = []

  for (const nodo of nodosDeLaRama(raiz)) {
    const propias = personasPorEquipo[nodo.equipo.id] ?? []
    if (propias.length === 0) continue
    for (const entrada of propias) personas.push(aVista(entrada, nodo.equipo.id, nodo.equipo.label))
    // The root's own people (its director) live in "Toda la dirección" only.
    if (nodo === raiz) continue
    equipos.push({
      id: nodo.equipo.id,
      label: nodo.equipo.label,
      responsable: responsableDe(propias),
      total: propias.length,
      porActivar: contarPorActivar(propias),
    })
  }

  const ordenadas = ordenarPersonas(personas)
  const propiasDeLaRaiz = personasPorEquipo[raiz.equipo.id] ?? []

  return {
    id: raiz.equipo.id,
    label: raiz.equipo.label,
    total: ordenadas.length,
    todaLaDireccion: {
      id: TODOS_LOS_EQUIPOS,
      label: 'Toda la dirección',
      responsable: responsableDe(propiasDeLaRaiz.filter((persona) => normalizarTexto(persona.rolClave) === 'director')),
      total: ordenadas.length,
      porActivar: contarPorActivar(ordenadas),
    },
    equipos,
    modoCompacto: equipos.length > MAX_EQUIPOS_EN_TARJETAS,
    personas: ordenadas,
    pendientes: ordenadas.filter((persona) => ESTADOS_POR_ACTIVAR.includes(persona.estado)),
  }
}

// ── Selection, counters and search ───────────────────────────────────────

/** The people of the selected card, already sorted (the input is). */
export function personasDeSeleccion(personas: readonly PersonaVista[], equipoId: string): PersonaVista[] {
  return equipoId === TODOS_LOS_EQUIPOS ? [...personas] : personas.filter((persona) => persona.equipoId === equipoId)
}

export type ContadoresPorEstado = Readonly<Record<DreamTeamEstado, number>> & { readonly todos: number }

export function contadoresPorEstado(personas: readonly { readonly estado: DreamTeamEstado }[]): ContadoresPorEstado {
  const conteo = Object.fromEntries(DREAM_TEAM_ESTADOS.map((estado) => [estado, 0])) as Record<DreamTeamEstado, number>
  for (const persona of personas) conteo[persona.estado] += 1
  return { ...conteo, todos: personas.length }
}

/** Case- and diacritic-insensitive name search plus an optional estado filter. */
export function filtrarPersonas(
  personas: readonly PersonaVista[],
  {
    estado = 'todos',
    query = '',
    turno = null,
  }: { readonly estado?: FiltroEstado; readonly query?: string; readonly turno?: string | null },
): PersonaVista[] {
  const consulta = normalizarTexto(query)
  return personas.filter(
    (persona) =>
      (estado === 'todos' ||
        (estado === 'por_activar' ? ESTADOS_POR_ACTIVAR.includes(persona.estado) : persona.estado === estado)) &&
      (consulta === '' || normalizarTexto(persona.nombre).includes(consulta)) &&
      // Shifts are a Dream Team notion: a Grupos de Vida leader never matches a shift filter.
      (turno === null || (persona.origen === 'dream_team' && coincideTurno(persona.turnoIds, turno))),
  )
}

// ── Assigner options ─────────────────────────────────────────────────────

export interface EquipoAsignable {
  readonly id: string
  readonly etiqueta: string
  /** Path below the direccion ("Talleres › Parejas"); the direccion itself is its own label. */
  readonly ruta: readonly string[]
}

/**
 * The equipos a person can be assigned to from a direccion: the REAL nodes of
 * its branch (a virtual Grupos de Vida node is not a `dream_team_equipos` row,
 * so a servicio can't target it), depth-indented like the servidores assigner,
 * with the path the assigner's tree-aware picker shows.
 */
export function equiposAsignables(arbol: ArbolVista, direccionId: string): EquipoAsignable[] {
  const raiz = arbol.find((nodo) => nodo.equipo.id === direccionId)
  if (!raiz) return []
  const nivelRaiz = raiz.nivel
  const resultado: EquipoAsignable[] = []
  function visitar(nodo: NodoArbol<NodoEquipoArbol>, ruta: readonly string[]): void {
    if (nodo.equipo.origen === 'dream_team') {
      const profundidad = nodo.nivel - nivelRaiz
      const prefijo = profundidad > 0 ? `${'—'.repeat(profundidad)} ` : ''
      resultado.push({
        id: nodo.equipo.id,
        etiqueta: `${prefijo}${nodo.equipo.label}`,
        ruta: ruta.length > 0 ? ruta : [nodo.equipo.label],
      })
    }
    nodo.hijos.forEach((hijo) => visitar(hijo, [...ruta, hijo.equipo.label]))
  }
  visitar(raiz, [])
  return resultado
}
