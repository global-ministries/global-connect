/**
 * W10 — DT-059 — Servicio (Dream Team) mentor adapter (Supabase implementation).
 * Read-only adapter that queries dream_team_servicios + dream_team_equipos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ServicioMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

type DbClient = SupabaseClient<Database, 'public'>

const SERVICIO_EXPERIENCIAS = ['dps', 'ninos', 'estudiantes', 'the_living_room'] as const

export function createServicioMentorAdapter(
  supabase: DbClient,
): ServicioMentorAdapter {
  return {
    async resolverCoordinadorDeServicio(personaId: string): Promise<string | null> {
      if (!personaId?.trim()) return null

      // Try each servicio experiencia until we find an active one
      for (const experiencia of SERVICIO_EXPERIENCIAS) {
        // Find active servicios for this person in this experiencia
        const { data: servicios, error } = await supabase
          .from('dream_team_servicios')
          .select('equipo_id, rol_id, persona_id')
          .eq('persona_id', personaId)
          .eq('estado', 'activo')
          .eq('dream_team_equipos!inner(experiencia)', experiencia)
          .limit(1)

        if (error || !servicios || servicios.length === 0) continue

        const { equipo_id: equipoId, persona_id: memberPersonaId } = servicios[0]!

        // Skip if this person is the only one (no mentor to assign)
        if (memberPersonaId === personaId) continue

        // Find the coordinator or director of this equipo
        const { data: roles, error: rolesError } = await supabase
          .from('dream_team_roles')
          .select('id')
          .eq('equipo_id', equipoId)
          .eq('activo', true)
          .or(`label.ilike.%Coordinador%,label.ilike.%Director%`)
          .limit(1)

        if (rolesError || !roles || roles.length === 0) continue

        const mentorRolId = roles[0]!.id

        // Find the active member with this rol
        const { data: mentorServicios, error: mentorError } = await supabase
          .from('dream_team_servicios')
          .select('persona_id')
          .eq('equipo_id', equipoId)
          .eq('rol_id', mentorRolId)
          .eq('estado', 'activo')
          .limit(1)

        if (mentorError || !mentorServicios || mentorServicios.length === 0) continue

        const mentorPersonaId = mentorServicios[0]!.persona_id

        // Don't return self
        if (mentorPersonaId === personaId) continue

        return mentorPersonaId
      }

      return null
    },
  }
}
