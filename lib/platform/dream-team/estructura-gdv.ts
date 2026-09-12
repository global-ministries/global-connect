import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

export type TipoNodoGdv = 'direccion' | 'segmento' | 'grupo'
export type RolResponsableGdv = 'director_general' | 'director_etapa' | 'lider' | 'colider'

export interface ResponsableGdv {
  readonly personaId: PersonaId
  readonly nombre: string
  readonly rol: RolResponsableGdv
}

/**
 * One row of the virtual Grupos de Vida branch: the direction node itself
 * (`tipo: 'direccion'`, `parentId: null` — see `fetchEstructuraGdv` below for
 * why it never becomes a tree node of its own), a segmento hanging off it,
 * or a vigente grupo hanging off its segmento. `nodoId`/`parentId` are real
 * Grupos de Vida ids (segmento.id, grupos.id), never invented, so callers
 * can key on them unambiguously alongside real `dream_team_equipos` ids.
 */
export interface NodoEstructuraGdv {
  readonly nodoId: string
  readonly parentId: string | null
  readonly tipo: TipoNodoGdv
  readonly label: string
  readonly responsables: readonly ResponsableGdv[]
}

interface ResponsableGdvRow {
  readonly persona_id: string
  readonly nombre: string
  readonly rol: string
}

interface NodoEstructuraGdvRow {
  readonly nodo_id: string
  readonly parent_id: string | null
  readonly tipo: string
  readonly label: string
  readonly responsables: unknown
}

function esTipoNodoGdv(value: string): value is TipoNodoGdv {
  return value === 'direccion' || value === 'segmento' || value === 'grupo'
}

function esRolResponsableGdv(value: string): value is RolResponsableGdv {
  return value === 'director_general' || value === 'director_etapa' || value === 'lider' || value === 'colider'
}

/**
 * Maps the `responsables` jsonb column defensively: not an array (null, a
 * malformed payload) becomes no responsables rather than throwing, and each
 * entry with an unrecognized `rol` is dropped on its own rather than
 * discarding the whole row.
 */
function mapResponsables(value: unknown): readonly ResponsableGdv[] {
  if (!Array.isArray(value)) return []

  const resultado: ResponsableGdv[] = []
  for (const item of value as readonly ResponsableGdvRow[]) {
    if (!esRolResponsableGdv(item.rol)) continue
    resultado.push({
      personaId: item.persona_id as PersonaId,
      nombre: item.nombre,
      rol: item.rol,
    })
  }
  return resultado
}

/**
 * Reads the real Grupos de Vida hierarchy (Dirección → Segmentos → Grupos
 * vigentes) with each branch's responsables, through the
 * `dream_team_estructura_gdv()` RPC (no arguments — see
 * supabase/migrations/20260911140000_dream_team_estructura_gdv.sql).
 *
 * Stays outside `DreamTeamRepository` for the same cross-domain reason as
 * `fetchLideresGdv`/`fetchNombresPersonas` (see lideres-gdv.ts, personas.ts):
 * this reads Grupos de Vida (segmentos/grupos), not a Dream Team table. The
 * RPC is SECURITY DEFINER and re-implements the tree authority check itself
 * — a caller without authority over the Grupos de Vida node gets zero rows
 * back, not an error.
 *
 * The single `tipo: 'direccion'` row is NOT a node to render — it carries
 * the REAL `dream_team_equipos` id of the Grupos de Vida root (with
 * `parentId: null`) purely so its responsables (the segment director
 * generales) can be attached to that already-existing equipo. Creating a
 * second node for it would duplicate a branch the tree already has (see
 * estructura-arbol.ts's `construirNodosArbol`, which does that attachment).
 * A row whose `tipo` is unrecognized, or a responsable whose `rol` is
 * unrecognized, is dropped defensively rather than trusted blindly from an
 * untyped RPC response.
 */
export async function fetchEstructuraGdv(client: DbClient): Promise<readonly NodoEstructuraGdv[]> {
  // The RPC is not in the generated database types yet, so the call is
  // untyped — the same pattern lideres-gdv.ts and personas.ts use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('dream_team_estructura_gdv')

  if (error) throw error

  const resultado: NodoEstructuraGdv[] = []
  for (const row of (data ?? []) as readonly NodoEstructuraGdvRow[]) {
    if (!esTipoNodoGdv(row.tipo)) continue
    resultado.push({
      nodoId: row.nodo_id,
      parentId: row.parent_id,
      tipo: row.tipo,
      label: row.label,
      responsables: mapResponsables(row.responsables),
    })
  }
  return resultado
}
