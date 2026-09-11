import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

/**
 * Bulk-resolves display names for a set of `personaId`s via a single
 * `usuarios.in(id)` query.
 *
 * `DreamTeamServicio` only carries `personaId` (see types.ts) and the
 * repository has no join for it — `usuarios` is not a dream-team table, so
 * this stays outside `DreamTeamRepository` and is called directly from the
 * screens that need it (servidores, mi-equipo). One query for however many
 * distinct personas are visible on screen, never one query per servicio.
 * Mirrors the same `.in('id', ids)` bulk-lookup pattern already used in
 * app/api/segmentos/[segmentoId]/directores-etapa/route.ts.
 */
export async function fetchNombresPersonas(
  client: DbClient,
  personaIds: readonly PersonaId[],
): Promise<ReadonlyMap<PersonaId, string>> {
  const idsUnicos = [...new Set(personaIds)]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await client
    .from('usuarios')
    .select('id, nombre, apellido')
    .in('id', idsUnicos)

  if (error) throw error

  const nombrePorId = new Map<PersonaId, string>()
  for (const row of data ?? []) {
    const nombreCompleto = [row.nombre, row.apellido].filter(Boolean).join(' ').trim()
    nombrePorId.set(row.id as PersonaId, nombreCompleto || 'Sin nombre')
  }
  return nombrePorId
}
