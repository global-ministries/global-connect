/**
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — open global seasons
 * (talleres_temporadas, estado='abierto') for OpenEdicionForm's
 * "Temporada" picker.
 *
 * Extracted from the old app/(auth)/admin/talleres/abstracto/[slug]/page.tsx
 * (PR46) into lib/platform/talleres/ so the new /talleres/[taller] page can
 * mock this loader like every other one in this module family, instead of
 * hand-rolling a chainable Supabase mock for one inline query in its own
 * page test.
 *
 * T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — talleres_
 * temporadas is now owned by a Dream Team node (dream_team_equipo_id) and
 * its RLS is scoped by that node's own tree, so `loadTemporadasAbiertas`
 * now needs the CALLING TALLER's id (not just "abierto") to answer
 * "which open seasons can this taller actually join" — a temporada whose
 * node is an ancestor of the taller's own node (or the taller's own node
 * itself), the exact mirror of the trg_talleres_temporada_talleres_misma_
 * direccion trigger's own tree-membership rule (supabase/migrations/
 * 20260928120000_talleres_temporadas_por_direccion.sql). `idsAncestros`
 * walks the taller's own node UP via parent_equipo_id (depth-bounded at
 * 16, same bound every SQL-side ancestor walk in this codebase uses) over
 * the whole dream_team_equipos snapshot RLS hands back — the same "small
 * table, pure tree math" pattern lib/platform/talleres/equipo-organigrama.ts
 * already uses for its own option lists. RLS on talleres_temporadas
 * (director.read | coordinator.read | lead.read | volunteer.read |
 * metrics.read | admin.manage, scoped to dream_team_equipo_id) still
 * decides what actually comes back — a caller without read anywhere in
 * that ancestry simply gets [] and the form falls back to "— Sin
 * temporada —" (graceful degradation, not a new capability check here).
 */

export interface TemporadaOption {
  readonly id: string
  readonly nombre: string
}

export interface EquipoArbolRaw {
  readonly id: string
  readonly parent_equipo_id: string | null
}

/**
 * Descendant walk (root -> leaves), INCLUDING the root itself. Pure — same
 * "flat list in, id Set out" shape as equipo-organigrama.ts's own tree
 * helpers, but this one only needs membership, not the full rendered tree.
 * No depth bound needed: it only ever visits each id once (a `visitados`-
 * style guard via the `ids` Set itself), so a cycle can't loop forever.
 */
export function idsDelArbol(
  equipos: readonly EquipoArbolRaw[],
  raizId: string,
): ReadonlySet<string> {
  const hijosPorPadre = new Map<string, string[]>()
  for (const equipo of equipos) {
    if (equipo.parent_equipo_id === null) continue
    const hermanos = hijosPorPadre.get(equipo.parent_equipo_id)
    if (hermanos) hermanos.push(equipo.id)
    else hijosPorPadre.set(equipo.parent_equipo_id, [equipo.id])
  }

  const ids = new Set<string>([raizId])
  const cola: string[] = [raizId]
  while (cola.length > 0) {
    const actualId = cola.shift() as string
    for (const hijoId of hijosPorPadre.get(actualId) ?? []) {
      if (!ids.has(hijoId)) {
        ids.add(hijoId)
        cola.push(hijoId)
      }
    }
  }
  return ids
}

/**
 * Ancestor walk (leaf -> root), INCLUDING the leaf itself. Depth-bounded at
 * 16, the same bound auth_has_talleres_capability_scoped and
 * trg_talleres_temporada_talleres_misma_direccion use on the SQL side, so a
 * corrupted/cyclic snapshot can't loop forever. Pure.
 */
export function idsAncestros(
  equipos: readonly EquipoArbolRaw[],
  hojaId: string,
): ReadonlySet<string> {
  const porId = new Map(equipos.map((equipo) => [equipo.id, equipo] as const))
  const ids = new Set<string>()
  let actualId: string | undefined = hojaId
  let profundidad = 0
  while (actualId !== undefined && profundidad < 16 && !ids.has(actualId)) {
    ids.add(actualId)
    actualId = porId.get(actualId)?.parent_equipo_id ?? undefined
    profundidad += 1
  }
  return ids
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

export async function loadTemporadasAbiertas(
  client: AnyClient,
  tallerId: string,
): Promise<readonly TemporadaOption[]> {
  const { data: tallerData } = await client
    .from('talleres')
    .select('dream_team_equipo_id')
    .eq('id', tallerId)
    .maybeSingle()

  const equipoId = (tallerData as { dream_team_equipo_id: string | null } | null)?.dream_team_equipo_id
  if (!equipoId) return []

  const { data: equiposData } = await client
    .from('dream_team_equipos')
    .select('id, parent_equipo_id')

  const ancestros = Array.from(idsAncestros((equiposData ?? []) as EquipoArbolRaw[], equipoId))

  const { data, error } = await client
    .from('talleres_temporadas')
    .select('id, nombre')
    .eq('estado', 'abierto')
    .in('dream_team_equipo_id', ancestros)
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  return data as TemporadaOption[]
}

// ─── T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas
// list + detail loaders ──────────────────────────────────────────────────
//
// Extracted (same queries, unchanged behavior) from the old
// app/(auth)/admin/talleres/temporadas/page.tsx and its [id]/page.tsx, so
// the new consolidated screens can mock these like every other loader in
// this family instead of hand-rolling a chainable client per page test.
// RLS on talleres_temporadas (director.read | coordinator.read | lead.read
// | volunteer.read | metrics.read | admin.manage for SELECT, scoped to
// dream_team_equipo_id since T3, odd/tasks/talleres-temporadas-y-
// ediciones.md) still decides what comes back — a caller without read
// simply sees an empty list, same as the old screens.

export interface TemporadaRow {
  readonly id: string
  readonly nombre: string
  readonly slug: string
  readonly estado: 'borrador' | 'abierto' | 'cerrado' | 'cancelado'
  readonly fecha_apertura: string
  readonly fecha_cierre: string
}

export async function loadTemporadas(client: AnyClient): Promise<readonly TemporadaRow[]> {
  const { data, error } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, estado, fecha_apertura, fecha_cierre')
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  return data as TemporadaRow[]
}

export interface TemporadaDetalleRow extends TemporadaRow {
  readonly descripcion: string | null
}

export interface TallerOption {
  readonly id: string
  readonly nombre: string
  readonly slug: string
}

export interface TemporadaDetalle {
  readonly temporada: TemporadaDetalleRow
  readonly talleres: readonly TallerOption[]
  readonly selectedTallerIds: readonly string[]
}

/**
 * Loads one temporada plus its control-surface data: every taller of the
 * temporada's OWN tree (its node or a descendant of it) with regimen=
 * 'temporada' (toggle candidates — the exact set
 * trg_talleres_temporada_talleres_misma_direccion/talleres_crear_temporada
 * would actually accept, T3 odd/tasks/talleres-temporadas-y-ediciones.md)
 * plus the current talleres_temporada_talleres membership. Returns `null`
 * when the temporada does not exist or the query errors — the caller (the
 * [id] page) turns that into `notFound()`, exactly like the old page did.
 */
export async function loadTemporadaDetalle(
  client: AnyClient,
  id: string,
): Promise<TemporadaDetalle | null> {
  const { data: temporadaData, error: temporadaError } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, descripcion, estado, fecha_apertura, fecha_cierre, dream_team_equipo_id')
    .eq('id', id)
    .maybeSingle()

  if (temporadaError || !temporadaData) return null

  const equipoId = (temporadaData as { dream_team_equipo_id: string }).dream_team_equipo_id

  const { data: equiposData } = await client
    .from('dream_team_equipos')
    .select('id, parent_equipo_id')

  const arbol = Array.from(idsDelArbol((equiposData ?? []) as EquipoArbolRaw[], equipoId))

  const [{ data: talleresData }, { data: junctionData }] = await Promise.all([
    client
      .from('talleres')
      .select('id, nombre, slug')
      .eq('estado', 'active')
      .eq('regimen', 'temporada')
      .in('dream_team_equipo_id', arbol)
      .order('nombre', { ascending: true })
      .limit(200),
    client
      .from('talleres_temporada_talleres')
      .select('taller_id')
      .eq('temporada_id', id),
  ])

  const talleres = (talleresData ?? []) as TallerOption[]
  const selectedTallerIds = ((junctionData ?? []) as { taller_id: string }[]).map((r) => r.taller_id)

  return {
    temporada: temporadaData as TemporadaDetalleRow,
    talleres,
    selectedTallerIds,
  }
}
