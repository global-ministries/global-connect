/**
 * W10 — DT-059 — Taller (short-term group) mentor adapter (Supabase implementation).
 * Read-only adapter that queries dream_team_servicios + dream_team_equipos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { GrupoCortoPlazoMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

type DbClient = SupabaseClient<Database, 'public'>

export function createGrupoCortoPlazoMentorAdapter(
  supabase: DbClient,
): GrupoCortoPlazoMentorAdapter {
  return {
    async resolverLiderDeTaller(personaId: string): Promise<string | null> {
      if (!personaId?.trim()) return null

      // Find active servicios in talleres_crecimiento experience for this person
      const { data: servicios, error } = await supabase
        .from('dream_team_servicios')
        .select('equipo_id, rol_id')
        .eq('persona_id', personaId)
        .eq('estado', 'activo')
        .eq('dream_team_equipos!inner(experiencia)', 'talleres_crecimiento')

      if (error || !servicios || servicios.length === 0) return null

      const { equipo_id: equipoId } = servicios[0]!

      // Don't return self as mentor
      // Find the líder role in this equipo
      const { data: roles, error: rolesError } = await supabase
        .from('dream_team_roles')
        .select('id')
        .eq('equipo_id', equipoId)
        .eq('activo', true)
        .or(`label.ilike.%Líder%,label.ilike.%Coordinador%`)
        .limit(1)

      if (rolesError || !roles || roles.length === 0) return null

      const liderRolId = roles[0]!.id

      // Find the active member with this rol in the equipo
      const { data: liderServicios, error: liderError } = await supabase
        .from('dream_team_servicios')
        .select('persona_id')
        .eq('equipo_id', equipoId)
        .eq('rol_id', liderRolId)
        .eq('estado', 'activo')
        .limit(1)

      if (liderError || !liderServicios || liderServicios.length === 0) return null

      const liderPersonaId = liderServicios[0]!.persona_id

      // Don't return self
      if (liderPersonaId === personaId) return null

      return liderPersonaId
    },
  }
}
