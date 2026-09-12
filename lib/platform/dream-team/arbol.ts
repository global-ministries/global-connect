import type { DreamTeamEquipo } from './types'

/**
 * The minimal shape `construirArbol`/`contarPorRama` need from a node: an id
 * to key and dedupe on, an optional parent id to link siblings, and a label
 * to sort them by. `DreamTeamEquipo` satisfies this trivially — every real
 * Dream Team equipo already carries these three fields. `NodoEquipoArbol`
 * (estructura-arbol.ts) is the other shape the tree is built for: the same
 * real equipos PLUS the virtual Grupos de Vida branch merged in. Neither
 * file needs to know about the other's extra fields (experiencia, activo,
 * responsables, …) — only these three matter for building the tree shape
 * itself.
 */
export interface NodoArbolEquipo {
  readonly id: string
  readonly parentEquipoId?: string
  readonly label: string
}

/**
 * A single node of the Dream Team org tree, built from a flat list of nodes
 * (see `construirArbol` below). Generic over the node's own shape — defaults
 * to `DreamTeamEquipo` so every existing `NodoArbol` usage (the real-only
 * tree) keeps working unchanged; screens that merge in the virtual Grupos de
 * Vida branch instantiate it as `NodoArbol<NodoEquipoArbol>` instead.
 */
export interface NodoArbol<T extends NodoArbolEquipo = DreamTeamEquipo> {
  readonly equipo: T
  readonly hijos: readonly NodoArbol<T>[]
  readonly nivel: number
}

function ordenarPorLabel<T extends NodoArbolEquipo>(equipos: readonly T[]): T[] {
  return [...equipos].sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

/**
 * Builds the org tree from a flat list of equipos.
 *
 * A node is a root when it has no `parentEquipoId`, OR when its parent id
 * is not present in the list we received. The second case is the normal
 * shape of a scoped read: RLS hands an area director their whole branch but
 * never the ancestor node above it, so that branch's topmost equipo carries
 * a `parentEquipoId` that resolves to nothing here. Treating it as an
 * invisible orphan (instead of the root of what it can see) would render an
 * empty screen for every area director, so it becomes a visible root
 * instead.
 *
 * Siblings are ordered by `label` (Spanish collation). `nivel` starts at 0
 * for roots. The database prevents cycles with a trigger, but this pure
 * function defends itself too: it never visits the same equipo id twice, so
 * a corrupted or hand-built input can't cause infinite recursion.
 *
 * Generic over `T` (see `NodoArbolEquipo` above) so the same tree-building
 * rules serve both the real-only tree and the tree merged with the virtual
 * Grupos de Vida branch (estructura-arbol.ts) — the logic itself never
 * changes with the richer node shape.
 */
export function construirArbol<T extends NodoArbolEquipo>(equipos: readonly T[]): readonly NodoArbol<T>[] {
  const idsConocidos = new Set(equipos.map((equipo) => equipo.id))
  const hijosPorPadre = new Map<string, T[]>()
  const raices: T[] = []

  for (const equipo of equipos) {
    const parentId = equipo.parentEquipoId
    if (parentId === undefined || !idsConocidos.has(parentId)) {
      raices.push(equipo)
      continue
    }
    const hermanos = hijosPorPadre.get(parentId)
    if (hermanos) {
      hermanos.push(equipo)
    } else {
      hijosPorPadre.set(parentId, [equipo])
    }
  }

  const visitados = new Set<string>()

  function construirNodo(equipo: T, nivel: number): NodoArbol<T> {
    visitados.add(equipo.id)
    const hijos = ordenarPorLabel(hijosPorPadre.get(equipo.id) ?? [])
      .filter((hijo) => !visitados.has(hijo.id))
      .map((hijo) => construirNodo(hijo, nivel + 1))
    return { equipo, hijos, nivel }
  }

  return ordenarPorLabel(raices).map((raiz) => construirNodo(raiz, 0))
}

/**
 * Headcount per node for the WHOLE branch below it, not just the node itself.
 *
 * A node's own servicios are only part of the picture: the people serving in
 * Cámaras, Media and Sonido also belong to DPS and to Dirección de Experiencia.
 * Showing only the direct count told a director "Experiencia · 0 personas ·
 * Sin servidores" while three people served beneath it — and with the branch
 * folded, that reads as an empty area.
 *
 * Returns `nodeId → own people + every descendant's people`. Pure; walks the
 * already-built tree, so it inherits construirArbol's cycle guard. Generic
 * for the same reason as `construirArbol` — only `.id` matters here.
 */
export function contarPorRama<T extends NodoArbolEquipo>(
  arbol: readonly NodoArbol<T>[],
  propiosPorEquipo: Readonly<Record<string, number>>,
): ReadonlyMap<string, number> {
  const totales = new Map<string, number>()

  function visitar(nodo: NodoArbol<T>): number {
    const propios = propiosPorEquipo[nodo.equipo.id] ?? 0
    const deLaRama = nodo.hijos.reduce((suma, hijo) => suma + visitar(hijo), 0)
    const total = propios + deLaRama
    totales.set(nodo.equipo.id, total)
    return total
  }

  for (const raiz of arbol) visitar(raiz)
  return totales
}
