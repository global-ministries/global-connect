/**
 * W10 — DT-059 — GDV mentor adapter (Supabase implementation).
 * Read-only adapter that queries grupo_miembros for GDV leadership.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { GdvMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

type DbClient = SupabaseClient<Database, 'public'>
type GrupoMiembroRow = {
  readonly grupo_id: string
  readonly rol: string
}

export function createGdvMentorSupabaseAdapter(
  supabase: DbClient,
): GdvMentorAdapter {
  return {
    async resolveGdVActivoPorTemporada(personaId: string): Promise<string | null> {
      if (!personaId?.trim()) return null

      // Find active member rows (fecha_salida IS NULL)
      const { data: memberRows, error } = await supabase
        .from('grupo_miembros')
        .select('grupo_id, rol')
        .eq('usuario_id', personaId)
        .is('fecha_salida', null) as unknown as {
          data: readonly GrupoMiembroRow[] | null
          error: unknown
        }

      if (error || !memberRows || memberRows.length === 0) return null

      // Filter to non-líder members (miembro or colíder)
      const activeGroups = (memberRows as readonly GrupoMiembroRow[]).filter(
        (row: GrupoMiembroRow) => row.rol === 'Miembro' || row.rol === 'Colíder',
      )

      if (activeGroups.length === 0) return null

      // P1: one person = one active GDV per season — take first
      const groupId = activeGroups[0]!.grupo_id

      // Find the líder of this group
      const { data: liderRows, error: liderError } = await supabase
        .from('grupo_miembros')
        .select('usuario_id')
        .eq('grupo_id', groupId)
        .eq('rol', 'Líder')
        .is('fecha_salida', null)
        .limit(1) as unknown as {
          data: readonly { readonly usuario_id: string }[] | null
          error: unknown
        }

      if (liderError || !liderRows || liderRows.length === 0) return null

      return liderRows[0]!.usuario_id ?? null
    },
  }
}
