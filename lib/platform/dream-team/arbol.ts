import type { DreamTeamEquipo } from './types'

/**
 * A single node of the Dream Team org tree, built from a flat list of
 * `DreamTeamEquipo` rows (see `construirArbol` below).
 */
export interface NodoArbol {
  readonly equipo: DreamTeamEquipo
  readonly hijos: readonly NodoArbol[]
  readonly nivel: number
}

function ordenarPorLabel(equipos: readonly DreamTeamEquipo[]): DreamTeamEquipo[] {
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
 */
export function construirArbol(equipos: readonly DreamTeamEquipo[]): readonly NodoArbol[] {
  const idsConocidos = new Set(equipos.map((equipo) => equipo.id))
  const hijosPorPadre = new Map<string, DreamTeamEquipo[]>()
  const raices: DreamTeamEquipo[] = []

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

  function construirNodo(equipo: DreamTeamEquipo, nivel: number): NodoArbol {
    visitados.add(equipo.id)
    const hijos = ordenarPorLabel(hijosPorPadre.get(equipo.id) ?? [])
      .filter((hijo) => !visitados.has(hijo.id))
      .map((hijo) => construirNodo(hijo, nivel + 1))
    return { equipo, hijos, nivel }
  }

  return ordenarPorLabel(raices).map((raiz) => construirNodo(raiz, 0))
}
