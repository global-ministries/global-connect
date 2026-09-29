/**
 * `estructura-vista.ts` — the pure view model behind
 * /admin/dream-team/estructura.
 *
 * The screen has two panes: a navigable, searchable org chart and the detail
 * of the selected team. This module turns the merged tree (real equipos + the
 * virtual Grupos de Vida branch, see estructura-arbol.ts), the people serving
 * on each node and the roles configured per equipo into exactly what those
 * panes render, with no I/O and no React so the server page and the client
 * island share the same rules and the rules are unit-testable.
 *
 * Everything the factory takes is plain serializable data (the page computes
 * `uso` with `contarUso` and hands it over, the island builds the view with
 * `crearVistaEstructura`): nothing here crosses the server/client boundary as
 * a function.
 *
 * Grupos de Vida structure nodes are virtual: they show up in the tree and
 * the detail like any other team but are flagged `editable: false`, carry no
 * roles, and count their listed leaders as their people.
 */
import type { NodoArbol } from './arbol'
import type { NodoEquipoArbol, ResponsableNodo } from './estructura-arbol'
import { normalizarTexto } from './mi-equipo-vista'
import type { DreamTeamRol, DreamTeamServicio } from './types'
import {
  ORIGEN_GRUPOS_VIDA_LABEL,
  experienciaLabel,
  rolLabel,
  rolResponsableGdvLabel,
} from '@/components/dream-team/labels'

type Nodo = NodoArbol<NodoEquipoArbol>

// ── Inputs ───────────────────────────────────────────────────────────────

/** How many non-retired people serve on each equipo and hold each rol. */
export interface UsoServicios {
  /** `equipoId → people serving directly on that equipo`. */
  readonly propias: Readonly<Record<string, number>>
  /** `rolId → people holding that rol`. */
  readonly porRol: Readonly<Record<string, number>>
}

export interface TallerVinculado {
  readonly href: string
  readonly nombre: string
}

export interface EntradaVistaEstructura {
  readonly arbol: readonly Nodo[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly uso: UsoServicios
  /** `equipoId → its taller`, when it has one. */
  readonly talleres: Readonly<Record<string, TallerVinculado>>
}

/** Counts non-retired servicios per equipo and per rol. */
export function contarUso(
  servicios: readonly Pick<DreamTeamServicio, 'equipoId' | 'rolId' | 'estado'>[],
): UsoServicios {
  const propias: Record<string, number> = {}
  const porRol: Record<string, number> = {}
  for (const servicio of servicios) {
    if (servicio.estado === 'retirado') continue
    propias[servicio.equipoId] = (propias[servicio.equipoId] ?? 0) + 1
    porRol[servicio.rolId] = (porRol[servicio.rolId] ?? 0) + 1
  }
  return { propias, porRol }
}

// ── Outputs ──────────────────────────────────────────────────────────────

export interface FilaArbol {
  readonly id: string
  readonly label: string
  readonly profundidad: number
  readonly tieneHijos: boolean
  readonly abierto: boolean
  readonly personasRama: number
  readonly activo: boolean
}

export interface ResponsableEquipo {
  readonly nombre: string
  /** Final Spanish text, e.g. `Coordinador`. */
  readonly rol: string
}

export interface HijoDetalle {
  readonly id: string
  readonly label: string
  readonly responsable: ResponsableEquipo | null
  readonly personasRama: number
}

export interface RolDetalle {
  readonly id: string
  /** Display text (`Coordinador`). */
  readonly label: string
  /** The stored label, what a rename starts from. */
  readonly labelOriginal: string
  readonly activo: boolean
  /** People holding it. */
  readonly uso: number
}

export interface DetalleEquipo {
  readonly id: string
  readonly label: string
  /** Ancestors' labels, root first, ending with this team's own. */
  readonly ruta: readonly string[]
  readonly experienciaLabel: string
  readonly activo: boolean
  /** False for the virtual Grupos de Vida nodes: nothing here can change them. */
  readonly editable: boolean
  readonly responsable: ResponsableEquipo | null
  readonly personasRama: number
  /** Has teams inside it. */
  readonly esRama: boolean
  readonly taller: TallerVinculado | null
  readonly hijos: readonly HijoDetalle[]
  readonly roles: readonly RolDetalle[]
}

export interface VistaEstructura {
  arbolVisible(opciones: { readonly expandidos: ReadonlySet<string>; readonly query: string }): FilaArbol[]
  inactivas(query: string): FilaArbol[]
  detalle(equipoId: string): DetalleEquipo | null
  /** First active root with people, else the first active root, else the first root; `null` for an empty tree. */
  equipoPorDefecto(): string | null
  /** Id of the root above `equipoId` (itself when it is one), `null` when unknown. */
  direccionDe(equipoId: string): string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Ids above a node, root first; empty for a root or an unknown id. */
export function ancestrosDe(arbol: readonly Nodo[], equipoId: string): string[] {
  const ruta: string[] = []
  function buscar(nodos: readonly Nodo[], camino: readonly string[]): boolean {
    for (const nodo of nodos) {
      if (nodo.equipo.id === equipoId) {
        ruta.push(...camino)
        return true
      }
      if (buscar(nodo.hijos, [...camino, nodo.equipo.id])) return true
    }
    return false
  }
  buscar(arbol, [])
  return ruta
}

/** The coordinador, else the director, else whoever is listed first (Grupos de Vida leaders). */
function elegirResponsable(responsables: readonly ResponsableNodo[]): ResponsableEquipo | null {
  const elegido =
    responsables.find((responsable) => responsable.rol === 'coordinador') ??
    responsables.find((responsable) => responsable.rol === 'director') ??
    responsables[0]
  return elegido ? { nombre: elegido.nombre, rol: rolResponsableGdvLabel(elegido.rol) } : null
}

// ── Factory ──────────────────────────────────────────────────────────────

export function crearVistaEstructura({ arbol, rolesPorEquipo, uso, talleres }: EntradaVistaEstructura): VistaEstructura {
  const nodosPorId = new Map<string, Nodo>()
  const rutaPorId = new Map<string, readonly string[]>()
  const raizPorId = new Map<string, string>()

  function indexar(nodo: Nodo, camino: readonly string[], raizId: string): void {
    nodosPorId.set(nodo.equipo.id, nodo)
    rutaPorId.set(nodo.equipo.id, [...camino, nodo.equipo.label])
    raizPorId.set(nodo.equipo.id, raizId)
    for (const hijo of nodo.hijos) indexar(hijo, [...camino, nodo.equipo.label], raizId)
  }
  for (const raiz of arbol) indexar(raiz, [], raiz.equipo.id)

  /** People of the node itself: its servicios, or its listed leaders when it is a virtual node. */
  function propias(nodo: Nodo): number {
    const { equipo } = nodo
    return equipo.origen === 'grupos_vida' ? equipo.responsables.length : (uso.propias[equipo.id] ?? 0)
  }

  const totales = new Map<string, number>()
  function totalDeLaRama(nodo: Nodo): number {
    const total = nodo.hijos.reduce((suma, hijo) => suma + totalDeLaRama(hijo), propias(nodo))
    totales.set(nodo.equipo.id, total)
    return total
  }
  arbol.forEach(totalDeLaRama)

  const personasRama = (nodo: Nodo): number => totales.get(nodo.equipo.id) ?? 0

  function fila(nodo: Nodo, profundidad: number, abierto: boolean): FilaArbol {
    return {
      id: nodo.equipo.id,
      label: nodo.equipo.label,
      profundidad,
      tieneHijos: nodo.hijos.length > 0,
      abierto,
      personasRama: personasRama(nodo),
      activo: nodo.equipo.activo,
    }
  }

  const coincide = (nodo: Nodo, consulta: string): boolean => normalizarTexto(nodo.equipo.label).includes(consulta)
  /** True when the node or anything below it matches. */
  const tieneCoincidencia = (nodo: Nodo, consulta: string): boolean =>
    coincide(nodo, consulta) || nodo.hijos.some((hijo) => tieneCoincidencia(hijo, consulta))

  const raicesActivas = arbol.filter((raiz) => raiz.equipo.activo)

  return {
    arbolVisible({ expandidos, query }) {
      const consulta = normalizarTexto(query)
      const filas: FilaArbol[] = []
      function recorrer(nodo: Nodo, profundidad: number): void {
        if (consulta !== '' && !tieneCoincidencia(nodo, consulta)) return
        // Searching opens, on its own, every node that has a match below it.
        const abierto =
          consulta !== '' ? nodo.hijos.some((hijo) => tieneCoincidencia(hijo, consulta)) : expandidos.has(nodo.equipo.id)
        filas.push(fila(nodo, profundidad, abierto))
        if (abierto) for (const hijo of nodo.hijos) recorrer(hijo, profundidad + 1)
      }
      for (const raiz of raicesActivas) recorrer(raiz, 0)
      return filas
    },

    inactivas(query) {
      const consulta = normalizarTexto(query)
      return arbol
        .filter((raiz) => !raiz.equipo.activo && (consulta === '' || coincide(raiz, consulta)))
        .map((raiz) => fila(raiz, 0, false))
    },

    detalle(equipoId) {
      const nodo = nodosPorId.get(equipoId)
      if (!nodo) return null
      const { equipo } = nodo
      const roles = (rolesPorEquipo[equipo.id] ?? []).map(
        (rol): RolDetalle => ({
          id: rol.id,
          label: rolLabel(rol.label),
          labelOriginal: rol.label,
          activo: rol.activo,
          uso: uso.porRol[rol.id] ?? 0,
        }),
      )
      return {
        id: equipo.id,
        label: equipo.label,
        ruta: rutaPorId.get(equipo.id) ?? [equipo.label],
        experienciaLabel: equipo.origen === 'dream_team' ? experienciaLabel(equipo.experiencia) : ORIGEN_GRUPOS_VIDA_LABEL,
        activo: equipo.activo,
        editable: equipo.origen === 'dream_team',
        responsable: elegirResponsable(equipo.responsables),
        personasRama: personasRama(nodo),
        esRama: nodo.hijos.length > 0,
        taller: talleres[equipo.id] ?? null,
        hijos: nodo.hijos.map(
          (hijo): HijoDetalle => ({
            id: hijo.equipo.id,
            label: hijo.equipo.label,
            responsable: elegirResponsable(hijo.equipo.responsables),
            personasRama: personasRama(hijo),
          }),
        ),
        roles,
      }
    },

    equipoPorDefecto() {
      const conGente = raicesActivas.find((raiz) => personasRama(raiz) > 0)
      return (conGente ?? raicesActivas[0] ?? arbol[0])?.equipo.id ?? null
    },

    direccionDe(equipoId) {
      return raizPorId.get(equipoId) ?? null
    },
  }
}
