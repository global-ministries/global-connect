/**
 * PR42 — `/admin/talleres/inscripciones` global loader.
 *
 * Read-side projection for the global admin inscripciones view. The
 * page is restricted to director.write | admin.manage | coordinator.write
 * (same multi-capability gate as the `/admin/talleres/edicion/[id]`
 * surface). The loader itself does NOT enforce the capability gate —
 * the page wires that up so the loader stays purely about data.
 *
 * Design considerations:
 *
 *   - Batched lookups (PR38 pattern). Embedding the whole tree on
 *     `taller_inscripciones` is brittle because `taller_id` has
 *     multiple FK edges (`talleres` and `taller_ediciones`). We
 *     resolve the joins in TS with explicit `.in()` filters.
 *
 *   - Inline filters. The page passes URL-derived filters
 *     (estado, edicion_id, taller_id) into the loader so the SQL
 *     `WHERE` clause is computed server-side. We avoid passing
 *     SQL via `text` to keep the surface explicit.
 *
 *   - RLS-respecting. The SELECT policy already allows director /
 *     admin / coordination roles to see all rows. The page's
 *     capability gate is the outer wall; the loader just returns
 *     whatever the policy grants.
 *
 *   - Project only what the page renders. No `motivo_no_aprobado` is
 *     surfaced here — that field is RLS-protected for the
 *     participant and the page UI doesn't need it (the action that
 *     WRITES motivo on rejection writes it directly to the DB).
 */

export type InscripcionEstado = 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'

export interface AdminInscripcionRow {
  readonly id: string
  readonly edicion_id: string
  readonly edicion_nombre: string
  readonly edicion_estado: string
  readonly taller_id: string
  readonly taller_nombre: string
  readonly taller_slug: string
  readonly cohorte_id: string | null
  readonly cohorte_edicion: string | null
  readonly persona_principal_id: string
  readonly persona_principal_nombre: string
  readonly persona_principal_email: string | null
  readonly companero_id: string | null
  readonly companero_nombre: string | null
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly estado: InscripcionEstado
  readonly created_at: string
  readonly updated_at: string
}

export interface AdminInscripcionesFilters {
  readonly estado?: InscripcionEstado
  readonly edicion_id?: string
  readonly taller_id?: string
}

export interface AdminInscripcionesResult {
  readonly rows: readonly AdminInscripcionRow[]
  readonly total: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

/**
 * Lists all inscripciones that the current RLS scope allows, with the
 * optional server-side filters applied as `.eq()` / `.in()` clauses.
 *
 * Returns rows in `created_at DESC` order. The page renders whatever
 * the loader returns; no client-side projection is applied.
 */
export async function loadAdminInscripciones(
  client: AnyClient,
  filters: AdminInscripcionesFilters = {}
): Promise<AdminInscripcionesResult> {
  // Query 1 — inscripciones. Select the bare columns we need plus the
  // joined ediciones+(taller abstract) reference. We avoid the
  // embedded join because `taller_id` is ambiguous across the two
  // parent tables; the explicit FK hint (`taller_id!edicion_id`) is
  // not supported by PostgREST — instead we resolve the join in TS.
  let query = client
    .from('taller_inscripciones')
    .select(
      `id, taller_id, estado, link_type, created_at, updated_at,
       cohorte_id,
       persona_principal:usuarios!persona_principal_id (id, nombre, apellido, email),
       companero:usuarios!companero_id (id, nombre, apellido)`,
    )
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.estado) {
    query = query.eq('estado', filters.estado)
  }
  if (filters.edicion_id) {
    query = query.eq('taller_id', filters.edicion_id)
  }
  if (filters.taller_id) {
    // The FK relationship is to taller_ediciones (the edicion).
    // When the user filters by the abstract `talleres.id`, we need
    // to translate to the edicion ids. We do that after the first
    // query so we can keep the SQL simple.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolved shape
  const res: { data: any[] | null; error: { message: string } | null } = await query

  if (res.error) return { rows: [], total: 0 }
  const inscripciones = (res.data ?? []) as Array<Record<string, unknown>>

  // Collect ids for the batched lookups.
  const edicionIds = new Set<string>()
  const cohorteIds = new Set<string>()
  for (const row of inscripciones) {
    if (typeof row.taller_id === 'string') edicionIds.add(row.taller_id)
    if (typeof row.cohorte_id === 'string') cohorteIds.add(row.cohorte_id)
  }
  // persona_principal is an embedded object (id, nombre, apellido, email).
  // compa\u00f1ero is similarly embedded. No extra lookup needed for
  // those — they're already in the row.

  // Query 2 — ediciones (with abstract taller) by ids.
  const edicionesById = new Map<
    string,
    {
      id: string
      nombre_snapshot: string
      estado: string
      taller_id: string
      taller: { id: string; nombre: string; slug: string } | null
    }
  >()
  if (edicionIds.size > 0) {
    const edRes = await client
      .from('taller_ediciones')
      .select(
        `id, nombre_snapshot, estado, taller_id,
         taller:talleres (id, nombre, slug)`,
      )
      .in('id', Array.from(edicionIds))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolved shape
    const edData = (edRes.data ?? []) as any[]
    for (const e of edData) {
      edicionesById.set(e.id, e)
    }
  }

  // Query 3 — cohortes by ids.
  const cohortesById = new Map<string, { id: string; edicion: string | null }>()
  if (cohorteIds.size > 0) {
    const cRes = await client
      .from('talleres_crecimiento_cohortes')
      .select('id, edicion')
      .in('id', Array.from(cohorteIds))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolved shape
    const cData = (cRes.data ?? []) as any[]
    for (const c of cData) {
      cohortesById.set(c.id, c)
    }
  }

  // Apply the abstract-taller filter (post-query). This is necessary
  // because the JOIN to `talleres` lives behind `taller_ediciones`,
  // not on `taller_inscripciones` directly.
  let filtered = inscripciones
  if (filters.taller_id) {
    const edicionIdsForTaller = new Set<string>()
    for (const [, ed] of edicionesById) {
      if (ed.taller_id === filters.taller_id) edicionIdsForTaller.add(ed.id)
    }
    filtered = filtered.filter((r) => edicionIdsForTaller.has(r.taller_id as string))
  }

  // Build the page rows.
  const rows: AdminInscripcionRow[] = []
  for (const r of filtered) {
    const edicion = edicionesById.get(r.taller_id as string)
    if (!edicion) continue
    const cohorte =
      typeof r.cohorte_id === 'string' ? cohortesById.get(r.cohorte_id) : null
    const persona = r.persona_principal as
      | { id: string; nombre: string | null; apellido: string | null; email: string | null }
      | null
    const companero = r.companero as
      | { id: string; nombre: string | null; apellido: string | null }
      | null
    if (!persona) continue

    const nombreCompleto = (n: string | null, a: string | null) =>
      [n, a].filter((x) => x && x.length > 0).join(' ') || '—'

    rows.push({
      id: r.id as string,
      edicion_id: edicion.id,
      edicion_nombre: edicion.nombre_snapshot,
      edicion_estado: edicion.estado,
      taller_id: edicion.taller_id,
      taller_nombre: edicion.taller?.nombre ?? '—',
      taller_slug: edicion.taller?.slug ?? '',
      cohorte_id: (r.cohorte_id as string | null) ?? null,
      cohorte_edicion: cohorte?.edicion ?? null,
      persona_principal_id: persona.id,
      persona_principal_nombre: nombreCompleto(persona.nombre, persona.apellido),
      persona_principal_email: persona.email ?? null,
      companero_id: companero?.id ?? null,
      companero_nombre: companero ? nombreCompleto(companero.nombre, companero.apellido) : null,
      link_type: (r.link_type as 'matrimonio' | 'novios' | null) ?? null,
      estado: r.estado as InscripcionEstado,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    })
  }

  return { rows, total: rows.length }
}
