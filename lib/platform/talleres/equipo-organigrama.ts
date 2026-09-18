/**
 * T3 — where a new taller can live in the Dream Team org chart.
 *
 * Two option lists a "crear taller" form needs, both built from the
 * same flat `dream_team_equipos` snapshot:
 *
 *   - `vincular`: nodes eligible to link an EXISTING taller onto — a
 *     talleres_crecimiento leaf, not a root, active, not already
 *     linked to another taller. Mirrors the link-mode eligibility
 *     rules enforced server-side in
 *     20260918160000_create_taller_abstract_equipo_choice.sql.
 *   - `crearBajo`: nodes a new equipo can be minted UNDER — any active
 *     node, regardless of experiencia. DPS (experiencia 'dps') already
 *     holds a taller-shaped node ("Próximo Paso"), so the parent list
 *     is not filtered by experiencia (see
 *     odd/tasks/talleres-equipo-en-organigrama.md, "Decisiones").
 *
 * `construirOpcionesEquipoTaller` is a pure function (tree math +
 * filtering only) so it is unit-testable without a database — see
 * __tests__/lib/platform/talleres/equipo-organigrama.test.ts.
 * `fetchOpcionesEquipoTaller` is the thin Supabase-reading wrapper a
 * server component/action calls.
 */

import { construirArbol, type NodoArbol, type NodoArbolEquipo } from '@/lib/platform/dream-team/arbol'

const RUTA_SEPARADOR = ' › '

export interface EquipoOrganigramaRaw {
  readonly id: string
  readonly label: string
  readonly experiencia: string
  readonly activo: boolean
  readonly parent_equipo_id: string | null
}

export interface NodoOpcionEquipo {
  readonly id: string
  /** Full root-first tree path, e.g. "Dirección de Conexión › Grupos de Corto Plazo › Punto de Partida". */
  readonly ruta: string
}

export interface OpcionesEquipoTaller {
  readonly vincular: readonly NodoOpcionEquipo[]
  readonly crearBajo: readonly NodoOpcionEquipo[]
}

type NodoConMetadata = NodoArbolEquipo & Pick<EquipoOrganigramaRaw, 'activo' | 'experiencia'>

function toNodoArbol(row: EquipoOrganigramaRaw): NodoConMetadata {
  return {
    id: row.id,
    parentEquipoId: row.parent_equipo_id ?? undefined,
    label: row.label,
    activo: row.activo,
    experiencia: row.experiencia,
  }
}

/**
 * Builds both option lists from a flat equipos snapshot and the set of
 * equipo ids already linked to a taller (`talleres.dream_team_equipo_id`).
 */
export function construirOpcionesEquipoTaller(
  equiposRaw: readonly EquipoOrganigramaRaw[],
  equipoIdsYaVinculados: ReadonlySet<string>,
): OpcionesEquipoTaller {
  const arbol = construirArbol(equiposRaw.map(toNodoArbol))

  const vincular: NodoOpcionEquipo[] = []
  const crearBajo: NodoOpcionEquipo[] = []

  function visitar(nodo: NodoArbol<NodoConMetadata>, ancestros: readonly string[]): void {
    const ruta = [...ancestros, nodo.equipo.label].join(RUTA_SEPARADOR)
    const esRaiz = nodo.nivel === 0
    const esHoja = nodo.hijos.length === 0

    if (
      nodo.equipo.activo &&
      nodo.equipo.experiencia === 'talleres_crecimiento' &&
      !esRaiz &&
      esHoja &&
      !equipoIdsYaVinculados.has(nodo.equipo.id)
    ) {
      vincular.push({ id: nodo.equipo.id, ruta })
    }

    if (nodo.equipo.activo) {
      crearBajo.push({ id: nodo.equipo.id, ruta })
    }

    nodo.hijos.forEach((hijo) => visitar(hijo, [...ancestros, nodo.equipo.label]))
  }

  arbol.forEach((raiz) => visitar(raiz, []))

  return { vincular, crearBajo }
}

/**
 * Server-side loader: reads the whole `dream_team_equipos` table (it's
 * small — tens of rows) plus every non-null `talleres.dream_team_equipo_id`,
 * and builds the two option lists from them.
 */
export async function fetchOpcionesEquipoTaller(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client; taller_ediciones/dream_team tables follow the same any-cast pattern as actions.ts in this feature
  supabase: any,
): Promise<OpcionesEquipoTaller> {
  const [{ data: equiposData }, { data: talleresData }] = await Promise.all([
    supabase.from('dream_team_equipos').select('id, label, experiencia, activo, parent_equipo_id'),
    supabase.from('talleres').select('dream_team_equipo_id').not('dream_team_equipo_id', 'is', null),
  ])

  const equipos = (equiposData ?? []) as EquipoOrganigramaRaw[]
  const equipoIdsYaVinculados = new Set(
    ((talleresData ?? []) as Array<{ dream_team_equipo_id: string | null }>)
      .map((t) => t.dream_team_equipo_id)
      .filter((id): id is string => id !== null),
  )

  return construirOpcionesEquipoTaller(equipos, equipoIdsYaVinculados)
}
