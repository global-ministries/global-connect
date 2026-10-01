import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

export type RolLiderGdv = 'director_general' | 'director_etapa' | 'lider' | 'colider'

export interface DreamTeamLiderGdv {
  readonly personaId: PersonaId
  readonly equipoId: string
  readonly rol: RolLiderGdv
  /** `null` for a director de etapa: `segmento_lideres` keeps no assignment date. */
  readonly desde: string | null
}

interface LiderGdvRow {
  readonly persona_id: string
  readonly equipo_id: string
  readonly rol: string
  readonly desde: string | null
}

function esRolLiderGdv(value: string): value is RolLiderGdv {
  return value === 'director_general' || value === 'director_etapa' || value === 'lider' || value === 'colider'
}

/**
 * Reads the Grupos de Vida people projected as Dream Team "servers" — leaders,
 * co-leaders, directores de etapa and directores generales — through the
 * `dream_team_lideres_gdv()` RPC (no arguments — see
 * supabase/migrations/20260911140000_dream_team_estructura_gdv.sql for the
 * leaders and supabase/migrations/20261001180000_dream_team_directores_gdv.sql
 * for the directors).
 *
 * This stays outside `DreamTeamRepository` for the same reason
 * `fetchNombresPersonas` does (see personas.ts): it is a cross-domain read
 * into Grupos de Vida (grupos/grupo_miembros), not a Dream Team table, so it
 * has no place in the repository's own read surface. The RPC is
 * SECURITY DEFINER and re-implements the tree authority check itself — a
 * caller without authority over the Grupos de Vida node gets zero rows back,
 * not an error, so there is nothing to scope here.
 *
 * One row per person AND TEAM. For a leader or co-leader `equipoId` is the
 * id of the group they currently lead or co-lead, a virtual node from
 * `dream_team_estructura_gdv()` (see estructura-gdv.ts). A person leading two
 * groups comes back as two rows, one per group: two places where they serve,
 * not one. This replaced the earlier one-row-per-person shape (with a
 * `grupos` count column) so a leader hangs off the group they actually lead
 * instead of the Grupos de Vida root.
 *
 * A director de etapa comes back on the id of their `directores` node (a
 * married couple of directors share one node, each spouse is a row) and a
 * director general on the id of their segmento, both nodes of the same
 * structure. Directors come back even with no current groups, and a director
 * de etapa has no `desde` (`null`). A row whose `rol` is anything other than
 * the four roles of `RolLiderGdv` is dropped defensively rather than trusted
 * blindly from an untyped RPC response.
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
