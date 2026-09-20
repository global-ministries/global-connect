/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — loaders for the new
 * consolidated `/talleres` catalog screen.
 *
 * `loadCatalogoTalleres` unifies what `loadDirTalleres` (flat, with
 * `total_inscripciones`) and `loadCoordTalleresAgrupados` (grouped by
 * taller) each did HALF of, per docs/talleres-de-punta-a-punta.md §8's
 * "mapa de fusiones". It queries FROM `talleres` (the abstract catalog)
 * with `taller_ediciones` embedded, so ediciones come back already
 * nested under their taller in one round trip. `talleres_select_all` is
 * PUBLIC (any authenticated user), while the embedded `taller_ediciones`
 * rows are independently RLS-scoped by `taller_ediciones_select` — no
 * app-level scope filter is applied here, per the task's explicit
 * instruction ("RLS already scopes this since paso 3").
 *
 * This does NOT replace `loadDirTalleres` or `loadCoordTalleresAgrupados`
 * — `direccion/talleres`, `direccion/metricas`, `coordinacion/talleres`
 * and the `coordinacion` portada still import them until T10 deletes
 * those routes.
 *
 * `loadMisGruposResumen` enriches `loadEquipoGrupos` (reused, not
 * re-queried by hand) with each grupo's taller/edición name and its
 * nearest upcoming class date (from `loadEquipoProximasSesiones`, also
 * reused), via small batched lookups — the same
 * cohorte→edición→taller name-resolution pattern
 * `loadCoordInscripcionesPendientes` already uses in operacional.ts.
 */

import {
  loadEquipoGrupos,
  loadEquipoProximasSesiones,
  type OperacionalContext,
} from './operacional'

// ─── Catálogo ───────────────────────────────────────────────────────────

export interface CatalogoEdicion {
  readonly id: string
  readonly nombre_snapshot: string
  readonly tipo: 'individual' | 'pareja'
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly total_inscripciones: number
}

export interface CatalogoTaller {
  readonly id: string
  readonly slug: string
  readonly nombre: string
  readonly estado: 'active' | 'archived'
  readonly dream_team_equipo_id: string | null
  readonly ediciones: readonly CatalogoEdicion[]
}

interface CatalogoQueryClient {
  from(table: 'talleres'): {
    select(columns: string): {
      order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
        data: unknown[] | null
        error: { message: string } | null
      }>
    }
  }
}

export async function loadCatalogoTalleres(
  client: CatalogoQueryClient,
): Promise<readonly CatalogoTaller[]> {
  const { data, error } = await client
    .from('talleres')
    .select(
      `id, slug, nombre, estado, dream_team_equipo_id,
       ediciones:taller_ediciones (
         id, nombre_snapshot, tipo, estado,
         inscripciones:taller_inscripciones (id)
       )`,
    )
    .order('nombre', { ascending: true })

  if (error) return []

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const edicionesRaw = (r.ediciones ?? []) as unknown[]
    const ediciones: CatalogoEdicion[] = edicionesRaw
      .map((e) => {
        const edicion = e as Record<string, unknown>
        return {
          id: edicion.id as string,
          nombre_snapshot: edicion.nombre_snapshot as string,
          tipo: edicion.tipo as CatalogoEdicion['tipo'],
          estado: edicion.estado as CatalogoEdicion['estado'],
          total_inscripciones: ((edicion.inscripciones as unknown[]) ?? []).length,
        }
      })
      .sort((a, b) => a.nombre_snapshot.localeCompare(b.nombre_snapshot))

    return {
      id: r.id as string,
      slug: r.slug as string,
      nombre: r.nombre as string,
      estado: r.estado as CatalogoTaller['estado'],
      dream_team_equipo_id: (r.dream_team_equipo_id as string | null) ?? null,
      ediciones,
    }
  })
}

// ─── Mis grupos (líder) ─────────────────────────────────────────────────

export interface MiGrupoResumen {
  readonly id: string
  readonly nombre: string
  readonly estado: string
  readonly tallerNombre: string | null
  readonly edicionNombre: string | null
  readonly proximaClase: string | null
}

interface NombresCohorte {
  readonly tallerNombre: string | null
  readonly edicionNombre: string | null
}

/**
 * Batched name resolution: cohorte -> (edición via taller_id, which is a
 * FK to taller_ediciones(id) — see operacional.ts's PR42 comment on
 * EdicionLocalDetalle for the same non-obvious FK target) -> taller.
 * Three small `.in()` lookups instead of a single deep embed, matching
 * the established batching pattern in loadCoordInscripcionesPendientes.
 */
async function loadNombresPorCohorte(
  ctx: OperacionalContext,
  cohorteIds: readonly string[],
): Promise<Map<string, NombresCohorte>> {
  const result = new Map<string, NombresCohorte>()
  const uniqueCohorteIds = Array.from(new Set(cohorteIds))
  if (uniqueCohorteIds.length === 0) return result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase

  const { data: cohortesData } = await client
    .from('talleres_crecimiento_cohortes')
    .select('id, taller_id')
    .in('id', uniqueCohorteIds)
  const cohortes = (cohortesData ?? []) as Array<{ id: string; taller_id: string | null }>

  const edicionIds = Array.from(
    new Set(cohortes.map((c) => c.taller_id).filter((id): id is string => id !== null)),
  )
  if (edicionIds.length === 0) return result

  const { data: edicionesData } = await client
    .from('taller_ediciones')
    .select('id, nombre_snapshot, taller_id')
    .in('id', edicionIds)
  const ediciones = (edicionesData ?? []) as Array<{
    id: string
    nombre_snapshot: string
    taller_id: string | null
  }>
  const edicionesById = new Map(ediciones.map((e) => [e.id, e]))

  const tallerIds = Array.from(
    new Set(ediciones.map((e) => e.taller_id).filter((id): id is string => id !== null)),
  )
  const tallerNombreById = new Map<string, string>()
  if (tallerIds.length > 0) {
    const { data: talleresData } = await client
      .from('talleres')
      .select('id, nombre')
      .in('id', tallerIds)
    for (const t of (talleresData ?? []) as Array<{ id: string; nombre: string }>) {
      tallerNombreById.set(t.id, t.nombre)
    }
  }

  for (const c of cohortes) {
    const edicion = c.taller_id ? edicionesById.get(c.taller_id) : undefined
    result.set(c.id, {
      edicionNombre: edicion?.nombre_snapshot ?? null,
      tallerNombre: edicion?.taller_id ? tallerNombreById.get(edicion.taller_id) ?? null : null,
    })
  }
  return result
}

/**
 * Docs §"Decisiones": "Mis grupos" y "Próximas sesiones" = sección del
 * catálogo para el líder. Reuses loadEquipoGrupos +
 * loadEquipoProximasSesiones (never re-queried by hand) and merges: each
 * grupo gets its taller/edición name and the EARLIEST of its own
 * upcoming sesiones as `proximaClase`.
 */
export async function loadMisGruposResumen(
  ctx: OperacionalContext,
): Promise<readonly MiGrupoResumen[]> {
  const grupos = await loadEquipoGrupos(ctx)
  if (grupos.length === 0) return []

  const [sesiones, nombresPorCohorte] = await Promise.all([
    loadEquipoProximasSesiones(ctx),
    loadNombresPorCohorte(ctx, grupos.map((g) => g.cohorte_id)),
  ])

  const proximaPorGrupo = new Map<string, string>()
  for (const s of sesiones) {
    const actual = proximaPorGrupo.get(s.grupo_id)
    if (!actual || s.fecha_programada < actual) {
      proximaPorGrupo.set(s.grupo_id, s.fecha_programada)
    }
  }

  return grupos.map((g) => {
    const nombres = nombresPorCohorte.get(g.cohorte_id)
    return {
      id: g.id,
      nombre: g.nombre,
      estado: g.estado,
      tallerNombre: nombres?.tallerNombre ?? null,
      edicionNombre: nombres?.edicionNombre ?? null,
      proximaClase: proximaPorGrupo.get(g.id) ?? null,
    }
  })
}
