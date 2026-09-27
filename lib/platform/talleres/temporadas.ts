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

import { cargarPermisos } from './permisos'

export interface TemporadaOption {
  readonly id: string
  readonly nombre: string
  /**
   * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Crear
   * edición"'s preview (OpenEdicionForm) derives fecha_inicio for a
   * régimen=temporada taller straight from the chosen temporada's own
   * fecha_apertura, without a second round trip.
   */
  readonly fecha_apertura: string
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
    .select('id, nombre, fecha_apertura')
    .eq('estado', 'abierto')
    .in('dream_team_equipo_id', ancestros)
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  return data as TemporadaOption[]
}

// ─── T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — which
// direcciones (root Dream Team nodes) actually run temporada-based talleres,
// for /talleres/temporadas' own "group by dirección" list and its "Crear
// Temporada" header CTA ─────────────────────────────────────────────────
//
// A "dirección" here is exactly a root node (parent_equipo_id IS NULL) —
// the SAME node kind talleres_crear_temporada's own p_equipo_id ends up
// being, since the "Crear temporada" form (below) only ever offers root
// nodes as the dirección picker. `puedeEditar` mirrors how /talleres/
// [taller] derives its own `editarTaller` (cargarPermisos(client,
// equipoId).editarTaller) — never a flat `caps.includes(...)` check.

export interface EquipoRaizRaw extends EquipoArbolRaw {
  readonly label: string
  readonly activo: boolean
}

/**
 * Pure: root nodes (parent_equipo_id null, activo) whose own tree contains
 * at least one taller. Separated from `loadDireccionesConTalleres` so the
 * tree math is unit-testable without a database, same discipline as
 * `idsDelArbol`/`idsAncestros` above.
 */
export function raicesConTalleres(
  equipos: readonly EquipoRaizRaw[],
  tallerEquipoIds: ReadonlySet<string>,
): readonly EquipoRaizRaw[] {
  return equipos.filter((equipo) => {
    if (equipo.parent_equipo_id !== null || !equipo.activo) return false
    const arbol = idsDelArbol(equipos, equipo.id)
    for (const id of tallerEquipoIds) {
      if (arbol.has(id)) return true
    }
    return false
  })
}

export interface DireccionConTalleres {
  readonly id: string
  readonly label: string
  readonly puedeEditar: boolean
}

export async function loadDireccionesConTalleres(
  client: AnyClient,
): Promise<readonly DireccionConTalleres[]> {
  const [{ data: equiposData }, { data: talleresData }] = await Promise.all([
    client.from('dream_team_equipos').select('id, label, parent_equipo_id, activo'),
    client.from('talleres').select('dream_team_equipo_id').not('dream_team_equipo_id', 'is', null),
  ])

  const equipos = (equiposData ?? []) as EquipoRaizRaw[]
  const tallerEquipoIds = new Set(
    ((talleresData ?? []) as { dream_team_equipo_id: string | null }[])
      .map((t) => t.dream_team_equipo_id)
      .filter((id): id is string => id !== null),
  )

  const raices = raicesConTalleres(equipos, tallerEquipoIds)
  const permisos = await Promise.all(raices.map((raiz) => cargarPermisos(client, raiz.id)))

  return raices
    .map((raiz, i) => ({ id: raiz.id, label: raiz.label, puedeEditar: permisos[i]!.editarTaller }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export interface TallerParaTemporada {
  readonly id: string
  readonly nombre: string
  /** The taller's own org-chart node label (may differ from the dirección's own label). */
  readonly nodoLabel: string
  readonly regimen: 'temporada' | 'cadencia'
}

/**
 * Every ACTIVE taller of one dirección's own tree, regardless of régimen —
 * "Crear temporada"'s checklist shows régimen=temporada talleres as
 * checkable candidates and régimen=cadencia ones disabled (they open by
 * their own cadencia, never by a temporada).
 */
export async function loadTalleresDeDireccion(
  client: AnyClient,
  direccionId: string,
): Promise<readonly TallerParaTemporada[]> {
  const [{ data: equiposData }, { data: talleresData }] = await Promise.all([
    client.from('dream_team_equipos').select('id, label, parent_equipo_id'),
    client
      .from('talleres')
      .select('id, nombre, regimen, dream_team_equipo_id')
      .eq('estado', 'active'),
  ])

  const equipos = (equiposData ?? []) as EquipoArbolRaw[]
  const labelPorId = new Map(
    ((equiposData ?? []) as { id: string; label: string }[]).map((e) => [e.id, e.label] as const),
  )
  const arbol = idsDelArbol(equipos, direccionId)

  return ((talleresData ?? []) as Array<{
    id: string
    nombre: string
    regimen: 'temporada' | 'cadencia'
    dream_team_equipo_id: string | null
  }>)
    .filter((t) => t.dream_team_equipo_id !== null && arbol.has(t.dream_team_equipo_id))
    .map((t) => ({
      id: t.id,
      nombre: t.nombre,
      nodoLabel: labelPorId.get(t.dream_team_equipo_id as string) ?? '',
      regimen: t.regimen,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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
  /** T5 — which dirección (root node) owns this temporada; groups the list by it. */
  readonly dream_team_equipo_id: string
  /** T5 — talleres_temporada_talleres row count for "N talleres · M ediciones". */
  readonly tallerCount: number
  /** T5 — non-cancelled taller_ediciones with this temporada_id (a cancelled slot never resurrects). */
  readonly edicionCount: number
}

/**
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the list page
 * groups by dirección and shows "N talleres · M ediciones" per row, so this
 * now fans out to two count queries (batched by temporada id, same shape as
 * cargarPermisosPorEquipos's own dedup-and-batch pattern) after the base
 * list query. Skipped entirely when there are zero temporadas.
 */
export async function loadTemporadas(client: AnyClient): Promise<readonly TemporadaRow[]> {
  const { data, error } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, estado, fecha_apertura, fecha_cierre, dream_team_equipo_id')
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  const rows = data as Array<Omit<TemporadaRow, 'tallerCount' | 'edicionCount'>>
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const [{ data: junctionData }, { data: edicionesData }] = await Promise.all([
    client.from('talleres_temporada_talleres').select('temporada_id').in('temporada_id', ids),
    client
      .from('taller_ediciones')
      .select('temporada_id')
      .in('temporada_id', ids)
      .neq('estado', 'cancelado'),
  ])

  const tallerCountPorId = new Map<string, number>()
  for (const row of (junctionData ?? []) as { temporada_id: string }[]) {
    tallerCountPorId.set(row.temporada_id, (tallerCountPorId.get(row.temporada_id) ?? 0) + 1)
  }
  const edicionCountPorId = new Map<string, number>()
  for (const row of (edicionesData ?? []) as { temporada_id: string | null }[]) {
    if (!row.temporada_id) continue
    edicionCountPorId.set(row.temporada_id, (edicionCountPorId.get(row.temporada_id) ?? 0) + 1)
  }

  return rows.map((row) => ({
    ...row,
    tallerCount: tallerCountPorId.get(row.id) ?? 0,
    edicionCount: edicionCountPorId.get(row.id) ?? 0,
  }))
}

/**
 * T5 — decoupled from `TemporadaRow` on purpose: the detail header never
 * needs the list's own `tallerCount`/`edicionCount` (it derives its own
 * from `talleresEnTemporada` below), and needs `descripcion` plus the
 * dirección's own label instead.
 */
export interface TemporadaDetalleRow {
  readonly id: string
  readonly nombre: string
  readonly slug: string
  readonly descripcion: string | null
  readonly estado: 'borrador' | 'abierto' | 'cerrado' | 'cancelado'
  readonly fecha_apertura: string
  readonly fecha_cierre: string
  readonly dream_team_equipo_id: string
}

export interface TallerOption {
  readonly id: string
  readonly nombre: string
  readonly slug: string
}

/** One taller's own edición inside this temporada (never a cancelled one — see `loadTemporadaDetalle`). */
export interface EdicionDeTemporada {
  readonly id: string
  readonly nombre_snapshot: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly fecha_inicio: string | null
  readonly fecha_fin: string | null
  readonly total_inscripciones: number
}

export interface TallerConEdicionDeTemporada {
  readonly id: string
  readonly nombre: string
  readonly slug: string
  readonly edicion: EdicionDeTemporada
}

export interface TemporadaDetalle {
  readonly temporada: TemporadaDetalleRow
  /** T5 — the dirección's own org-chart label (never the temporada's own slug). */
  readonly direccionLabel: string
  /** T5 — one row per taller that already has a non-cancelled edición here ("Talleres y ediciones"). */
  readonly talleresEnTemporada: readonly TallerConEdicionDeTemporada[]
  /** T5 — régimen=temporada talleres of the dirección's own tree NOT yet in this temporada ("Agregar taller"). */
  readonly talleresDisponibles: readonly TallerOption[]
}

interface RawEdicionDeTemporadaRow {
  readonly id: string
  readonly nombre_snapshot: string
  readonly estado: EdicionDeTemporada['estado']
  readonly fecha_inicio: string | null
  readonly fecha_fin: string | null
  readonly taller_id: string
  readonly taller: { readonly id: string; readonly nombre: string; readonly slug: string } | null
  readonly inscripciones: readonly { readonly id: string }[] | null
}

/**
 * Loads one temporada plus its control-surface data.
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — rewritten:
 * "which talleres are IN this temporada" is now read straight off
 * `taller_ediciones.temporada_id` (a non-cancelled edición there IS
 * membership — the junction row and it always exist together, T3's own
 * model) instead of `talleres_temporada_talleres`, which stays a write-time
 * authority table for the RPCs and is never read here. "Agregar taller"'s
 * own candidate list is still every régimen=temporada taller of the
 * temporada's OWN tree, minus the ones already in `talleresEnTemporada`.
 *
 * Returns `null` when the temporada does not exist or the query errors —
 * the caller (the [id] page) turns that into `notFound()`.
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
    .select('id, label, parent_equipo_id')

  const equipos = (equiposData ?? []) as Array<EquipoArbolRaw & { label: string }>
  const direccionLabel = equipos.find((e) => e.id === equipoId)?.label ?? ''
  const arbol = Array.from(idsDelArbol(equipos, equipoId))

  const [{ data: talleresArbolData }, { data: edicionesData }] = await Promise.all([
    client
      .from('talleres')
      .select('id, nombre, slug')
      .eq('estado', 'active')
      .eq('regimen', 'temporada')
      .in('dream_team_equipo_id', arbol)
      .order('nombre', { ascending: true })
      .limit(200),
    client
      .from('taller_ediciones')
      .select(
        `id, nombre_snapshot, estado, fecha_inicio, fecha_fin, taller_id,
         taller:talleres!taller_id (id, nombre, slug),
         inscripciones:taller_inscripciones (id)`,
      )
      .eq('temporada_id', id)
      .neq('estado', 'cancelado'),
  ])

  const talleresArbol = (talleresArbolData ?? []) as TallerOption[]
  const edicionRows = (edicionesData ?? []) as RawEdicionDeTemporadaRow[]

  const talleresEnTemporada: TallerConEdicionDeTemporada[] = edicionRows.map((row) => ({
    id: row.taller?.id ?? row.taller_id,
    nombre: row.taller?.nombre ?? row.nombre_snapshot,
    slug: row.taller?.slug ?? '',
    edicion: {
      id: row.id,
      nombre_snapshot: row.nombre_snapshot,
      estado: row.estado,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      total_inscripciones: (row.inscripciones ?? []).length,
    },
  }))

  const enTemporadaIds = new Set(talleresEnTemporada.map((t) => t.id))
  const talleresDisponibles = talleresArbol.filter((t) => !enTemporadaIds.has(t.id))

  return {
    temporada: temporadaData as TemporadaDetalleRow,
    direccionLabel,
    talleresEnTemporada,
    talleresDisponibles,
  }
}
