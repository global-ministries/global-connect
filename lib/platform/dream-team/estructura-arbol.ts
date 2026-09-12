import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio, PersonaId } from './types'
import type { PlatformExperienceKey } from '@/lib/platform/experiences'
import type { NodoArbol } from './arbol'
import type { NodoEstructuraGdv, ResponsableGdv } from './estructura-gdv'

/**
 * `estructura-arbol.ts` — merges the real Dream Team org tree with the
 * virtual Grupos de Vida branch (see estructura-gdv.ts) into the single flat
 * node list `construirArbol` (arbol.ts) turns into the tree the three
 * screens render, and derives the "who is responsible for this node" line
 * for real Dream Team nodes. Two independent pure concerns share this file
 * because both ultimately feed the same `NodoEquipoArbol.responsables`
 * field the shared `<NodoFila>` row renders:
 *
 *   1. `construirNodosArbol` — combines `DreamTeamEquipo[]` (real) with
 *      `NodoEstructuraGdv[]` (virtual, read-only) into one flat list.
 *   2. `responsablesDreamTeamPorEquipo` — derives responsables for REAL
 *      nodes from `dream_team_servicios` whose role is director/coordinador.
 *   3. `idsSegmentosColapsadosPorDefecto` — which nodes a screen should
 *      start with collapsed (the ~95 grupos would otherwise flood the tree).
 */

// ── The unified node shape the tree builder and <NodoFila> consume ──────

export type OrigenNodoArbol = 'dream_team' | 'grupos_vida'

/**
 * One "who is responsible" entry, whatever produced it. `rol` stays a raw
 * key — never resolved to Spanish here — so the render layer picks the
 * right label map from the node's `origen` (components/dream-team/labels.ts:
 * `rolLabel` for a dream_team key, `rolResponsableGdvLabel` for a
 * grupos_vida key), the same convention `Servidor`/`etiquetaRolDeFila`
 * already use elsewhere in this feature.
 */
export interface ResponsableNodo {
  readonly personaId: PersonaId
  readonly nombre: string
  readonly rol: string
}

interface NodoEquipoArbolBase {
  readonly id: string
  readonly parentEquipoId?: string
  readonly label: string
  readonly activo: boolean
  readonly responsables: readonly ResponsableNodo[]
}

/**
 * The tree node shape estructura/mi-equipo/servidores render, once the real
 * org tree and the virtual Grupos de Vida branch are merged. A discriminated
 * union (not one shape with optional fields) so the render layer can never
 * accidentally read `experiencia` off a Grupos de Vida node or forget to
 * check `tipo` before treating a virtual node as a segmento — the two origins
 * genuinely carry different information.
 */
export type NodoEquipoArbol =
  | (NodoEquipoArbolBase & { readonly origen: 'dream_team'; readonly experiencia: PlatformExperienceKey })
  | (NodoEquipoArbolBase & { readonly origen: 'grupos_vida'; readonly tipo: 'segmento' | 'grupo' })

// ── 1. Merging real equipos with the virtual Grupos de Vida branch ──────

function toResponsableNodo(responsable: ResponsableGdv): ResponsableNodo {
  return { personaId: responsable.personaId, nombre: responsable.nombre, rol: responsable.rol }
}

/**
 * Combines the real org tree with the virtual Grupos de Vida branch into the
 * flat node list `construirArbol` builds a tree from.
 *
 * The `direccion` row in `nodosGdv` is NOT a node: per estructura-gdv.ts it
 * exists only to attach its responsables (the Grupos de Vida director
 * generales) to the real equipo that already represents that node. If that
 * real equipo isn't in `equipos` — out of the caller's read scope, which
 * shouldn't happen since both reads share the same tree-authority gate, but
 * this stays defensive rather than assuming it — its responsables are
 * dropped along with it: there is no node left to attach them to, and
 * inventing one would duplicate a branch `listEquipos()` didn't hand back.
 *
 * `responsablesDreamTeam` defaults to empty so callers that only care about
 * the Grupos de Vida merge (or haven't computed item 4 yet) can omit it —
 * every real node then gets `responsables: []`, exactly the pre-existing
 * shape before this feature.
 */
export function construirNodosArbol(
  equipos: readonly DreamTeamEquipo[],
  nodosGdv: readonly NodoEstructuraGdv[],
  responsablesDreamTeam: ReadonlyMap<string, readonly ResponsableNodo[]> = new Map(),
): readonly NodoEquipoArbol[] {
  const idsReales = new Set(equipos.map((equipo) => equipo.id))

  const nodosReales: NodoEquipoArbol[] = equipos.map((equipo) => ({
    origen: 'dream_team',
    id: equipo.id,
    parentEquipoId: equipo.parentEquipoId,
    label: equipo.label,
    activo: equipo.activo,
    experiencia: equipo.experiencia,
    responsables: responsablesDreamTeam.get(equipo.id) ?? [],
  }))

  const direccionResponsablesPorId = new Map<string, readonly ResponsableNodo[]>()
  const nodosVirtuales: NodoEquipoArbol[] = []

  for (const nodo of nodosGdv) {
    if (nodo.tipo === 'direccion') {
      if (idsReales.has(nodo.nodoId)) {
        direccionResponsablesPorId.set(nodo.nodoId, nodo.responsables.map(toResponsableNodo))
      }
      continue
    }

    nodosVirtuales.push({
      origen: 'grupos_vida',
      tipo: nodo.tipo,
      id: nodo.nodoId,
      // A segmento's parent is the real GdV root equipo id; a grupo's is its
      // segmento id — both arrive as non-null in practice, but `?? undefined`
      // matches construirArbol's "no parent" convention if one ever isn't.
      parentEquipoId: nodo.parentId ?? undefined,
      label: nodo.label,
      // Virtual nodes have no "activo" concept of their own — a segmento
      // always shows, a grupo only exists here because it's already vigente
      // (see estructura-gdv.ts) — so this is always true, never `!activo`
      // styling for a Grupos de Vida row.
      activo: true,
      responsables: nodo.responsables.map(toResponsableNodo),
    })
  }

  const nodosRealesConDireccion =
    direccionResponsablesPorId.size === 0
      ? nodosReales
      : nodosReales.map((nodo) => {
          const extra = direccionResponsablesPorId.get(nodo.id)
          return extra ? { ...nodo, responsables: [...nodo.responsables, ...extra] } : nodo
        })

  return [...nodosRealesConDireccion, ...nodosVirtuales]
}

// ── 2. Responsables for real Dream Team nodes (director/coordinador) ────

const ROLES_RESPONSABLES = new Set(['director', 'coordinador'])
const ORDEN_ROL_RESPONSABLE: Readonly<Record<string, number>> = { director: 0, coordinador: 1 }

/**
 * Case- and diacritic-insensitive, mirroring grants.ts's own `normalizeLabel`
 * (private there): role labels are stored lowercase/no-accents but this
 * stays defensive rather than trusting that invariant at the call site —
 * same reasoning grants.ts documents for its role → capability mapping.
 */
function normalizarRolLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Derives "who is responsible" for each real Dream Team node from its
 * currently ACTIVE servicios whose role is director or coordinador — a
 * postulante, or a paused/retired former holder, isn't the one accountable
 * for the node right now. Mirrors how `dream_team_estructura_gdv()` only
 * counts vigente memberships on the Grupos de Vida side.
 *
 * Pure: no I/O. The page supplies `servicios`, `roles` (to resolve
 * `rolId` → label) and `nombrePorId` (from the `fetchNombresPersonas` call
 * it already makes — see servidores/page.tsx, estructura/page.tsx,
 * mi-equipo/page.tsx), so this never triggers a query of its own.
 */
export function responsablesDreamTeamPorEquipo(
  servicios: readonly DreamTeamServicio[],
  roles: readonly DreamTeamRol[],
  nombrePorId: ReadonlyMap<PersonaId, string>,
): ReadonlyMap<string, readonly ResponsableNodo[]> {
  const labelPorRolId = new Map(roles.map((rol) => [rol.id, rol.label]))
  const porEquipo = new Map<string, ResponsableNodo[]>()

  for (const servicio of servicios) {
    if (servicio.estado !== 'activo') continue

    const label = labelPorRolId.get(servicio.rolId)
    if (!label) continue

    const rolNormalizado = normalizarRolLabel(label)
    if (!ROLES_RESPONSABLES.has(rolNormalizado)) continue

    const responsable: ResponsableNodo = {
      personaId: servicio.personaId,
      nombre: nombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
      rol: rolNormalizado,
    }

    const lista = porEquipo.get(servicio.equipoId)
    if (lista) lista.push(responsable)
    else porEquipo.set(servicio.equipoId, [responsable])
  }

  // Director before coordinador, then alphabetical by name — mirrors the
  // ordering dream_team_estructura_gdv() applies to a segmento's own
  // responsables (`order by r.rol, r.nombre`).
  for (const lista of porEquipo.values()) {
    lista.sort(
      (a, b) =>
        (ORDEN_ROL_RESPONSABLE[a.rol] ?? 2) - (ORDEN_ROL_RESPONSABLE[b.rol] ?? 2) || a.nombre.localeCompare(b.nombre, 'es'),
    )
  }

  return porEquipo
}

// ── 3. Default collapse: the Grupos de Vida segments start collapsed ────

/**
 * Ids of every 'segmento' virtual node in an already-built tree — the
 * initial collapsed set estructura-client.tsx and mi-equipo-client.tsx both
 * seed their `colapsados` state with. Segments, not the direction node,
 * because "Dirección → 5 segmentos" is the useful default view; opening a
 * segment then reveals its (up to dozens of) grupos. No Dream Team node is
 * ever in this set, so those branches keep expanding by default exactly as
 * before this feature existed.
 */
export function idsSegmentosColapsadosPorDefecto(arbol: readonly NodoArbol<NodoEquipoArbol>[]): ReadonlySet<string> {
  const ids = new Set<string>()

  function visitar(nodo: NodoArbol<NodoEquipoArbol>): void {
    if (nodo.equipo.origen === 'grupos_vida' && nodo.equipo.tipo === 'segmento') ids.add(nodo.equipo.id)
    nodo.hijos.forEach(visitar)
  }

  arbol.forEach(visitar)
  return ids
}
