import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

export type RolLiderGdv = 'lider' | 'colider'

export interface DreamTeamLiderGdv {
  readonly personaId: PersonaId
  readonly equipoId: string
  readonly rol: RolLiderGdv
  readonly desde: string
}

interface LiderGdvRow {
  readonly persona_id: string
  readonly equipo_id: string
  readonly rol: string
  readonly desde: string
}

function esRolLiderGdv(value: string): value is RolLiderGdv {
  return value === 'lider' || value === 'colider'
}

/**
 * Reads Grupos de Vida leaders/co-leaders projected as Dream Team "servers",
 * through the `dream_team_lideres_gdv()` RPC (no arguments — see
 * supabase/migrations/20260911140000_dream_team_estructura_gdv.sql).
 *
 * This stays outside `DreamTeamRepository` for the same reason
 * `fetchNombresPersonas` does (see personas.ts): it is a cross-domain read
 * into Grupos de Vida (grupos/grupo_miembros), not a Dream Team table, so it
 * has no place in the repository's own read surface. The RPC is
 * SECURITY DEFINER and re-implements the tree authority check itself — a
 * caller without authority over the Grupos de Vida node gets zero rows back,
 * not an error, so there is nothing to scope here.
 *
 * One row per person AND GROUP they currently lead or co-lead — `equipoId`
 * is the id of that group, a virtual node from `dream_team_estructura_gdv()`
 * (see estructura-gdv.ts). A person leading two groups comes back as two
 * rows, one per group: two places where they serve, not one. This replaced
 * the earlier one-row-per-person shape (with a `grupos` count column) so a
 * leader hangs off the group they actually lead instead of the Grupos de
 * Vida root. A row whose `rol` is anything other than 'lider'/'colider' is
 * dropped defensively rather than trusted blindly from an untyped RPC
 * response.
 */
export async function fetchLideresGdv(client: DbClient): Promise<readonly DreamTeamLiderGdv[]> {
  // The RPC is not in the generated database types yet, so the call is
  // untyped — the same pattern personas.ts and repository-supabase.ts use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('dream_team_lideres_gdv')

  if (error) throw error

  const resultado: DreamTeamLiderGdv[] = []
  for (const row of (data ?? []) as readonly LiderGdvRow[]) {
    if (!esRolLiderGdv(row.rol)) continue
    resultado.push({
      personaId: row.persona_id as PersonaId,
      equipoId: row.equipo_id,
      rol: row.rol,
      desde: row.desde,
    })
  }
  return resultado
}
