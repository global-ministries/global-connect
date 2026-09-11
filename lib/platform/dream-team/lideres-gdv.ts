import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

export type RolLiderGdv = 'lider' | 'colider'

export interface DreamTeamLiderGdv {
  readonly personaId: PersonaId
  readonly equipoId: string
  readonly rol: RolLiderGdv
  readonly grupos: number
  readonly desde: string
}

interface LiderGdvRow {
  readonly persona_id: string
  readonly equipo_id: string
  readonly rol: string
  readonly grupos: number
  readonly desde: string
}

function esRolLiderGdv(value: string): value is RolLiderGdv {
  return value === 'lider' || value === 'colider'
}

/**
 * Reads Grupos de Vida leaders/co-leaders projected as Dream Team "servers",
 * through the `dream_team_lideres_gdv()` RPC (no arguments — see
 * supabase/migrations/20260911120000_dream_team_lideres_gdv.sql).
 *
 * This stays outside `DreamTeamRepository` for the same reason
 * `fetchNombresPersonas` does (see personas.ts): it is a cross-domain read
 * into Grupos de Vida (grupos/grupo_miembros), not a Dream Team table, so it
 * has no place in the repository's own read surface. The RPC is
 * SECURITY DEFINER and re-implements the tree authority check itself — a
 * caller without authority over the Grupos de Vida node gets zero rows back,
 * not an error, so there is nothing to scope here.
 *
 * One row per person who currently leads or co-leads at least one active
 * Grupo de Vida — a person leading several groups still comes back as a
 * single row, with the count in `grupos`. A row whose `rol` is anything
 * other than 'lider'/'colider' is dropped defensively rather than trusted
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
      grupos: row.grupos,
      desde: row.desde,
    })
  }
  return resultado
}
