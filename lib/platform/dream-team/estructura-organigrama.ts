/**
 * `estructura-organigrama.ts` — the v2 view model of /admin/dream-team/estructura
 * (S12 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/estructura/07-b-escritorio.html and 08-b-celular.html).
 *
 * The screen draws the tree as an org chart: one box per node with the
 * responsable, the branch's people and health dots; branches fold with "+n"
 * and a dot when a folded branch hides a problem; the search and the problem
 * pills highlight boxes without hiding any. This module turns the same
 * serializable input as estructura-vista.ts (plus the campus shifts) into
 * that model, with no I/O and no React. It reuses `crearVistaEstructura` for
 * the responsable (own, else inherited), the branch count and the role usage,
 * so both screens read the same rules.
 *
 * Health rules (per node, its own setup, not its branch):
 * - `sin_responsable`: nobody directs or coordinates it, not even an ancestor
 *   (the inherited responsable of estructura-vista.ts counts as one).
 * - `roles_sin_asignar`: active roles that nobody holds (`uso === 0`).
 * - `sin_turno`: no weekly shift to serve in. Per campus, a node serves in the
 *   weekly shifts chosen by itself or its nearest ancestor that chose some
 *   (the rule of `dream_team_turnos_del_equipo`), else in every active weekly
 *   shift of the campus. It is flagged when a chosen set has no active shift
 *   left in some campus, or when it serves in no active weekly shift at all.
 *   Dated shifts never count. Without shift data nothing is flagged.
 * - `inactivo`: the node itself is inactive; an inactive node has no other problem.
 * The virtual Grupos de Vida nodes are read-only and never have problems; the
 * real Grupos de Vida root is a Dream Team equipo and follows the rules above.
 */
import type { NodoArbol } from './arbol'
import type { NodoEquipoArbol } from './estructura-arbol'
import { crearVistaEstructura, type EntradaVistaEstructura } from './estructura-vista'
import { inicialesDe, normalizarTexto } from './mi-equipo-vista'
import type { Turno } from './turnos'

type Nodo = NodoArbol<NodoEquipoArbol>

// ── Problems ─────────────────────────────────────────────────────────────

export type ProblemaEstructura = 'sin_responsable' | 'roles_sin_asignar' | 'sin_turno' | 'inactivo'

export interface DefinicionProblema {
  readonly id: ProblemaEstructura
  /** Pill and legend text. */
  readonly label: string
  /** Lowercase singular, for "2 sin responsable". */
  readonly corto: string
  /** `PuntoEstado` tone. */
  readonly tono: 'warning' | 'info' | 'danger' | 'muted'
  readonly descripcion: string
}

/** The four health problems, in pill order. */
export const PROBLEMAS_ESTRUCTURA: readonly DefinicionProblema[] = [
  { id: 'sin_responsable', label: 'Sin responsable', corto: 'sin responsable', tono: 'warning', descripcion: 'Nadie dirige o coordina' },
  { id: 'roles_sin_asignar', label: 'Roles sin asignar', corto: 'rol sin asignar', tono: 'info', descripcion: 'Roles activos que nadie tiene' },
  { id: 'sin_turno', label: 'Sin turno', corto: 'sin turno', tono: 'danger', descripcion: 'Su turno semanal está desactivado' },
  { id: 'inactivo', label: 'Inactivos', corto: 'inactivo', tono: 'muted', descripcion: 'No reciben personas' },
]

const ES_PROBLEMA = new Set<string>(PROBLEMAS_ESTRUCTURA.map((problema) => problema.id))

export function esProblemaEstructura(valor: string | null): valor is ProblemaEstructura {
  return valor !== null && ES_PROBLEMA.has(valor)
}

// ── Inputs ───────────────────────────────────────────────────────────────

export interface TurnosOrganigrama {
  /** Every shift of every campus, active or not. */
  readonly turnos: readonly Pick<Turno, 'id' | 'campusId' | 'nombre' | 'activo' | 'tipo'>[]
  /** `equipoId → the shift ids it restricts itself to` (dream_team_equipo_turnos). */
  readonly propiosPorEquipo: Readonly<Record<string, readonly string[]>>
}

export interface EntradaOrganigrama extends EntradaVistaEstructura {
  /** Absent when the shifts could not be loaded: then nothing is `sin_turno`. */
  readonly turnos?: TurnosOrganigrama
}

/** Groups `dream_team_equipo_turnos` rows into `propiosPorEquipo`. */
export function agruparTurnosPropios(
  filas: readonly { readonly equipo_id: string; readonly turno_id: string }[],
): Record<string, string[]> {
  const porEquipo: Record<string, string[]> = {}
  for (const fila of filas) (porEquipo[fila.equipo_id] ??= []).push(fila.turno_id)
  return porEquipo
}

// ── Outputs ──────────────────────────────────────────────────────────────

export interface ResponsableCaja {
  readonly nombre: string
  readonly iniciales: string
  /** Final Spanish text, e.g. `Coordinador`. */
  readonly rol: string
  /** Set when it is the responsable of the nearest ancestor that has one. */
  readonly heredadoDe?: { readonly id: string; readonly label: string }
}

export interface NodoOrganigrama {
  readonly id: string
  readonly label: string
  readonly padreId: string | null
  /** 0 for a root. */
  readonly profundidad: number
  readonly hijos: readonly string[]
  /** Every node below it. */
  readonly descendientes: number
  readonly activo: boolean
  /** False for the virtual Grupos de Vida nodes. */
  readonly editable: boolean
  readonly personasRama: number
  readonly responsable: ResponsableCaja | null
  readonly problemas: readonly ProblemaEstructura[]
  /** Display labels of the active roles nobody holds. */
  readonly rolesSinAsignar: readonly string[]
  /** Names of the chosen (own or inherited) weekly shifts that are deactivated. */
  readonly turnosDesactivados: readonly string[]
  /** Some node below it has a problem other than `inactivo`. */
  readonly problemasEnRama: boolean
}

export interface CajaOrganigrama extends NodoOrganigrama {
  readonly abierto: boolean
  /** "+n": the direct children a folded box hides; 0 when open or a leaf. */
  readonly masN: number
  /** Every node a folded box hides; 0 when open or a leaf. */
  readonly descendientesOcultos: number
  /** Folded and hiding a problem. */
  readonly puntoRama: boolean
  readonly resaltado: boolean
  /** Highlighting is on and this box does not match. */
  readonly tenue: boolean
  readonly seleccionado: boolean
}

export interface ConsultaResaltado {
  readonly q: string
  readonly problema: ProblemaEstructura | null
}

export interface Resaltado {
  /** A query or a problem is set. */
  readonly activo: boolean
  readonly ids: ReadonlySet<string>
  /** Ancestors of every highlighted node, to open on top of the folded state. */
  readonly abrir: ReadonlySet<string>
}

export interface OpcionesDiagrama {
  readonly expandidos: ReadonlySet<string>
  readonly q?: string
  readonly problema?: ProblemaEstructura | null
  /** The node open in the detail panel: its ancestors open. */
  readonly seleccionado?: string | null
}

export interface ResumenOrganigrama {
  readonly direcciones: number
  /** Active Dream Team equipos at any depth (Grupos de Vida virtual nodes left out). */
  readonly equiposActivos: number
  readonly personas: number
}

export interface Organigrama {
  /** Root ids: active first, then inactive, each by label. */
  readonly raices: readonly string[]
  /** Every node, pre-order. */
  readonly nodos: readonly NodoOrganigrama[]
  nodo(id: string): NodoOrganigrama | null
  /** Nodes with each problem, for the pills. */
  readonly conteos: Readonly<Record<ProblemaEstructura, number>>
  readonly resumen: ResumenOrganigrama
  /** The active Dream Team direcciones with children; Grupos de Vida and inactive roots stay folded. */
  expandidosPorDefecto(): Set<string>
  /** "Expandir todo": every node with children. */
  todosExpandidos(): Set<string>
  resaltar(consulta: ConsultaResaltado): Resaltado
  /** The visible boxes, pre-order: a box is listed when every ancestor is open. */
  diagrama(opciones: OpcionesDiagrama): CajaOrganigrama[]
}

// ── Factory ──────────────────────────────────────────────────────────────

const SIN_TURNO_NI_DESACTIVADOS = { sinTurno: false, desactivados: [] as string[] }

export function crearOrganigrama(entrada: EntradaOrganigrama): Organigrama {
  const vista = crearVistaEstructura(entrada)
  const raicesOrdenadas = [
    ...entrada.arbol.filter((raiz) => raiz.equipo.activo),
    ...entrada.arbol.filter((raiz) => !raiz.equipo.activo),
  ]

  const semanales = (entrada.turnos?.turnos ?? []).filter((turno) => (turno.tipo ?? 'semanal') === 'semanal')
  const campus = [...new Set(semanales.map((turno) => turno.campusId))]
  const propiosPorEquipo = entrada.turnos?.propiosPorEquipo ?? {}

  /** `cadena` is the node first, then its ancestors up to the root. */
  function analizarTurnos(cadena: readonly Nodo[]): { sinTurno: boolean; desactivados: string[] } {
    if (campus.length === 0) return SIN_TURNO_NI_DESACTIVADOS
    let sirveEnAlguno = false
    let eleccionSinActivos = false
    const desactivados: string[] = []
    for (const campusId of campus) {
      const delCampus = semanales.filter((turno) => turno.campusId === campusId)
      const ids = new Set(delCampus.map((turno) => turno.id))
      const eleccion = cadena
        .map((nodo) => (propiosPorEquipo[nodo.equipo.id] ?? []).filter((id) => ids.has(id)))
        .find((elegidos) => elegidos.length > 0)
      const sirve = eleccion ? delCampus.filter((turno) => eleccion.includes(turno.id)) : delCampus
      const activos = sirve.filter((turno) => turno.activo)
      if (activos.length > 0) sirveEnAlguno = true
      else if (eleccion) eleccionSinActivos = true
      if (eleccion) desactivados.push(...sirve.filter((turno) => !turno.activo).map((turno) => turno.nombre))
    }
    return { sinTurno: eleccionSinActivos || !sirveEnAlguno, desactivados }
  }

  const porId = new Map<string, NodoOrganigrama>()
  const ancestrosPorId = new Map<string, readonly string[]>()
  const nombresPropios = new Map<string, readonly string[]>()

  /** Builds the node and everything below it; returns whether any of them has a problem other than `inactivo`. */
  function visitar(nodo: Nodo, ancestros: readonly Nodo[]): { conProblema: boolean; descendientes: number } {
    const { equipo } = nodo
    const detalle = vista.detalle(equipo.id)
    let enRama = false
    let descendientes = 0
    for (const hijo of nodo.hijos) {
      const resultado = visitar(hijo, [...ancestros, nodo])
      enRama ||= resultado.conProblema
      descendientes += 1 + resultado.descendientes
    }

    const virtual = equipo.origen === 'grupos_vida'
    const rolesSinAsignar = virtual ? [] : (detalle?.roles ?? []).filter((rol) => rol.activo && rol.uso === 0).map((rol) => rol.label)
    const turnos = virtual || !equipo.activo ? SIN_TURNO_NI_DESACTIVADOS : analizarTurnos([nodo, ...[...ancestros].reverse()])
    const responsable = detalle?.responsable ?? null
    const problemas: ProblemaEstructura[] = virtual
      ? []
      : !equipo.activo
        ? ['inactivo']
        : [
            ...(responsable ? [] : (['sin_responsable'] as const)),
            ...(rolesSinAsignar.length > 0 ? (['roles_sin_asignar'] as const) : []),
            ...(turnos.sinTurno ? (['sin_turno'] as const) : []),
          ]

    const resultado: NodoOrganigrama = {
      id: equipo.id,
      label: equipo.label,
      padreId: ancestros.at(-1)?.equipo.id ?? null,
      profundidad: ancestros.length,
      hijos: nodo.hijos.map((hijo) => hijo.equipo.id),
      descendientes,
      activo: equipo.activo,
      editable: !virtual,
      personasRama: detalle?.personasRama ?? 0,
      responsable: responsable
        ? {
            nombre: responsable.nombre,
            iniciales: inicialesDe(responsable.nombre),
            rol: responsable.rol,
            ...(responsable.heredadoDe ? { heredadoDe: responsable.heredadoDe } : {}),
          }
        : null,
      problemas,
      rolesSinAsignar,
      turnosDesactivados: turnos.desactivados,
      problemasEnRama: enRama,
    }
    porId.set(equipo.id, resultado)
    ancestrosPorId.set(equipo.id, ancestros.map((ancestro) => ancestro.equipo.id))
    nombresPropios.set(equipo.id, equipo.responsables.map((persona) => normalizarTexto(persona.nombre)))
    return { conProblema: enRama || problemas.some((problema) => problema !== 'inactivo'), descendientes }
  }
  for (const raiz of raicesOrdenadas) visitar(raiz, [])

  const nodos: NodoOrganigrama[] = []
  const enPreorden = (nodo: Nodo): void => {
    const resultado = porId.get(nodo.equipo.id)
    if (resultado) nodos.push(resultado)
    nodo.hijos.forEach(enPreorden)
  }
  raicesOrdenadas.forEach(enPreorden)

  const conteos = Object.fromEntries(
    PROBLEMAS_ESTRUCTURA.map(({ id }) => [id, nodos.filter((nodo) => nodo.problemas.includes(id)).length]),
  ) as Record<ProblemaEstructura, number>

  const raicesActivas = raicesOrdenadas.filter((raiz) => raiz.equipo.activo)
  const resumen: ResumenOrganigrama = {
    direcciones: raicesActivas.length,
    equiposActivos: nodos.filter((nodo) => nodo.activo && nodo.editable).length,
    personas: raicesActivas.reduce((suma, raiz) => suma + (porId.get(raiz.equipo.id)?.personasRama ?? 0), 0),
  }

  function resaltar({ q, problema }: ConsultaResaltado): Resaltado {
    const consulta = normalizarTexto(q)
    const activo = consulta !== '' || problema !== null
    const ids = new Set<string>()
    const abrir = new Set<string>()
    if (!activo) return { activo, ids, abrir }
    for (const nodo of nodos) {
      if (problema !== null && !nodo.problemas.includes(problema)) continue
      const coincide =
        consulta === '' ||
        normalizarTexto(nodo.label).includes(consulta) ||
        (nombresPropios.get(nodo.id) ?? []).some((nombre) => nombre.includes(consulta))
      if (!coincide) continue
      ids.add(nodo.id)
      for (const ancestro of ancestrosPorId.get(nodo.id) ?? []) abrir.add(ancestro)
    }
    return { activo, ids, abrir }
  }

  return {
    raices: raicesOrdenadas.map((raiz) => raiz.equipo.id),
    nodos,
    nodo: (id) => porId.get(id) ?? null,
    conteos,
    resumen,

    expandidosPorDefecto() {
      return new Set(
        raicesActivas
          .filter((raiz) => raiz.hijos.some((hijo) => hijo.equipo.origen === 'dream_team'))
          .map((raiz) => raiz.equipo.id),
      )
    },

    todosExpandidos() {
      return new Set(nodos.filter((nodo) => nodo.hijos.length > 0).map((nodo) => nodo.id))
    },

    resaltar,

    diagrama({ expandidos, q = '', problema = null, seleccionado = null }) {
      const resaltado = resaltar({ q, problema })
      const abiertos = new Set([...expandidos, ...resaltado.abrir, ...(seleccionado ? (ancestrosPorId.get(seleccionado) ?? []) : [])])
      const cajas: CajaOrganigrama[] = []
      function dibujar(id: string): void {
        const nodo = porId.get(id)
        if (!nodo) return
        const abierto = nodo.hijos.length > 0 && abiertos.has(id)
        const plegado = nodo.hijos.length > 0 && !abierto
        cajas.push({
          ...nodo,
          abierto,
          masN: plegado ? nodo.hijos.length : 0,
          descendientesOcultos: plegado ? nodo.descendientes : 0,
          puntoRama: plegado && nodo.problemasEnRama,
          resaltado: resaltado.ids.has(id),
          tenue: resaltado.activo && !resaltado.ids.has(id),
          seleccionado: id === seleccionado,
        })
        if (abierto) nodo.hijos.forEach(dibujar)
      }
      raicesOrdenadas.forEach((raiz) => dibujar(raiz.equipo.id))
      return cajas
    },
  }
}

// ── URL codec ────────────────────────────────────────────────────────────

/** "Equipos | Turnos del campus". */
export type PestanaEstructura = 'equipos' | 'turnos'

export interface FiltrosEstructura {
  /** The node open in the detail panel (the legacy `?equipo=`); the page validates it. */
  readonly equipo: string | null
  readonly q: string
  readonly problema: ProblemaEstructura | null
  readonly tab: PestanaEstructura
  /** Open branches; `null` = the default ones, `[]` = everything folded. */
  readonly expandidos: readonly string[] | null
}

export const FILTROS_ESTRUCTURA: FiltrosEstructura = {
  equipo: null,
  q: '',
  problema: null,
  tab: 'equipos',
  expandidos: null,
}

/** `URLSearchParams`, Next's `ReadonlyURLSearchParams`, or the plain record a page receives. */
export type ParametrosEstructura =
  | { get(nombre: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>

function leer(parametros: ParametrosEstructura, nombre: string): string | null {
  if (typeof (parametros as { get?: unknown }).get === 'function') {
    return (parametros as { get(n: string): string | null }).get(nombre)
  }
  const valor = (parametros as Readonly<Record<string, string | readonly string[] | undefined>>)[nombre]
  if (Array.isArray(valor)) return valor[0] ?? null
  return typeof valor === 'string' ? valor : null
}

/** Reads the state from the URL; invalid values are dropped. A bare `?equipo=` (the old link) still works. */
export function leerFiltrosEstructura(parametros: ParametrosEstructura): FiltrosEstructura {
  const problema = leer(parametros, 'problema')
  const expandidos = leer(parametros, 'expandidos')
  return {
    equipo: leer(parametros, 'equipo')?.trim() || null,
    q: leer(parametros, 'q')?.trim() ?? '',
    problema: esProblemaEstructura(problema) ? problema : null,
    tab: leer(parametros, 'tab') === 'turnos' ? 'turnos' : 'equipos',
    expandidos:
      expandidos === null
        ? null
        : [...new Set(expandidos.split(',').map((id) => id.trim()).filter(Boolean))],
  }
}

/** The query string (without `?`); defaults are left out. */
export function escribirFiltrosEstructura(filtros: FiltrosEstructura): string {
  const parametros = new URLSearchParams()
  if (filtros.equipo !== null) parametros.set('equipo', filtros.equipo)
  if (filtros.q.trim() !== '') parametros.set('q', filtros.q.trim())
  if (filtros.problema !== null) parametros.set('problema', filtros.problema)
  if (filtros.tab !== FILTROS_ESTRUCTURA.tab) parametros.set('tab', filtros.tab)
  if (filtros.expandidos !== null) parametros.set('expandidos', filtros.expandidos.join(','))
  return parametros.toString()
}
