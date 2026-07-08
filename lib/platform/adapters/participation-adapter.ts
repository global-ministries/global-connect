import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PlatformParticipationEvent,
  PlatformParticipationReadRepository,
} from '@/lib/platform/participation'
import type { Database } from '@/lib/supabase/database.types'
import type { DreamTeamParticipationEventWriter } from '@/lib/platform/dream-team/repository'
import type { DreamTeamParticipationEvent, PersonaId } from '@/lib/platform/dream-team/types'

/**
 * In-memory `PlatformParticipationReadRepository` for integration tests.
 *
 * Holds a fixed event set and answers queries by filtering over it. The
 * methods are pure functions over `this.events` (no DB, no env, no mutation),
 * so future real adapters can mirror this shape while delegating to RPC/RLS.
 * This adapter is a data provider only — it performs NO authorization; the
 * read boundary is enforced by `canReadPlatformParticipationEvent`.
 */
export class ParticipationInMemoryAdapter implements PlatformParticipationReadRepository {
  private readonly events: readonly PlatformParticipationEvent[]

  constructor(events: readonly PlatformParticipationEvent[]) {
    this.events = events
  }

  async findEventsByActorPersonaId(
    personaId: string,
  ): Promise<readonly PlatformParticipationEvent[]> {
    return this.events.filter((event) => event.actorPersonaId === personaId)
  }

  async findEventsByScope(params: {
    experience: string
    scopeType: string
    scopeId?: string
  }): Promise<readonly PlatformParticipationEvent[]> {
    return this.events.filter(
      (event) =>
        event.scope.experience === params.experience &&
        event.scope.scopeType === params.scopeType &&
        (params.scopeId === undefined || event.scope.scopeId === params.scopeId),
    )
  }
}

// ── Dream Team service participation writer (Supabase) ───────────────

type DbParticipationEvent = Database['public']['Tables']['dream_team_participation_eventos']['Row']

/**
 * Supabase-backed `DreamTeamParticipationEventWriter` for `service` events.
 *
 * Persists to `dream_team_participation_eventos` and reads back by servicio or
 * persona. This is the write side of the participation ledger for Dream Team;
 * authorization is still enforced by `canReadPlatformParticipationEvent`.
 */
export function createDreamTeamParticipationSupabaseWriter(
  client: SupabaseClient<Database, 'public'>,
): DreamTeamParticipationEventWriter {
  return {
    async append(event: Omit<DreamTeamParticipationEvent, 'id'>): Promise<DreamTeamParticipationEvent> {
      const { data, error } = await client
        .from('dream_team_participation_eventos')
        .insert({
          persona_id: event.personaId,
          servicio_id: event.servicioId,
          tipo_evento: event.tipoEvento,
          payload: event.payload as DbParticipationEvent['payload'],
          fecha: event.fecha,
        })
        .select()
        .single()

      if (error || !data) {
        throw new Error(`Failed to append participation event: ${error?.message ?? 'no data returned'}`)
      }
      return mapDbToDomain(data)
    },

    async list(servicioId: string): Promise<readonly DreamTeamParticipationEvent[]> {
      const { data, error } = await client
        .from('dream_team_participation_eventos')
        .select('*')
        .eq('servicio_id', servicioId)
        .order('fecha', { ascending: true })

      if (error) {
        throw new Error(`Failed to list participation events: ${error.message}`)
      }
      return (data ?? []).map(mapDbToDomain)
    },

    async listByPersona(personaId: PersonaId): Promise<readonly DreamTeamParticipationEvent[]> {
      const { data, error } = await client
        .from('dream_team_participation_eventos')
        .select('*')
        .eq('persona_id', personaId)
        .order('fecha', { ascending: false })

      if (error) {
        throw new Error(`Failed to list participation events by persona: ${error.message}`)
      }
      return (data ?? []).map(mapDbToDomain)
    },
  }
}

function mapDbToDomain(row: DbParticipationEvent): DreamTeamParticipationEvent {
  return {
    id: row.id,
    personaId: row.persona_id as PersonaId,
    servicioId: row.servicio_id,
    tipoEvento: row.tipo_evento as DreamTeamParticipationEvent['tipoEvento'],
    payload:
      typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {},
    fecha: row.fecha,
  }
}
