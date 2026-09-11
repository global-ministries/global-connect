import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

interface NombreRow {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
}

/**
 * Bulk-resolves display names for a set of `personaId`s in a single round trip.
 *
 * `DreamTeamServicio` only carries `personaId` (see types.ts) and the
 * repository has no join for it, so this stays outside `DreamTeamRepository`
 * and is called directly from the screens that need it (servidores,
 * mi-equipo). One call for however many distinct personas are on screen,
 * never one per servicio.
 *
 * It goes through the `dream_team_resolver_nombres` RPC rather than selecting
 * from `usuarios`. `usuarios` has its own role-based RLS that denies an area
 * director the names of volunteers outside their Grupo de Vida — even though
 * the `dream_team_servicios` RLS correctly lets them see those servicios. A
 * direct select rendered "Persona no encontrada" on every row of the area
 * director's own team. The RPC resolves names only for people the caller has
 * tree-proven authority over (see
 * supabase/migrations/20260910180000_dream_team_resolver_nombres.sql).
 *
 * Ids the RPC does not return are left out of the map on purpose, so callers
 * can tell "not resolvable for you" apart from "resolved but unnamed".
 */
export async function fetchNombresPersonas(
  client: DbClient,
  personaIds: readonly PersonaId[],
): Promise<ReadonlyMap<PersonaId, string>> {
  const idsUnicos = [...new Set(personaIds)]
  if (idsUnicos.length === 0) return new Map()

  // The RPC is not in the generated database types yet, so the call is
  // untyped — the same pattern repository-supabase.ts uses for
  // dream_team_apply_servicio_grants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('dream_team_resolver_nombres', {
    p_persona_ids: idsUnicos,
  })

  if (error) throw error

  const nombrePorId = new Map<PersonaId, string>()
  for (const row of (data ?? []) as readonly NombreRow[]) {
    const nombreCompleto = [row.nombre, row.apellido].filter(Boolean).join(' ').trim()
    nombrePorId.set(row.id as PersonaId, nombreCompleto || 'Sin nombre')
  }
  return nombrePorId
}
