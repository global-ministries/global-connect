import type {
  PlatformParticipationEvent,
  PlatformParticipationReadRepository,
} from '@/lib/platform/participation'

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
