/**
 * In-memory fake implementation of EventsRepository.
 * For unit tests only — no Supabase adapter in this slice.
 */
import { randomUUID } from 'node:crypto'
import type {
  CreateEventInput,
  EventsRepository,
  UpdateEventPatch,
  VersionedOperatingCoreEvent,
} from './events-repository'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'

export interface InMemoryEventsRepositoryOptions {
  readonly seed?: ReadonlyArray<VersionedOperatingCoreEvent>
}

export function createInMemoryEventsRepository(
  options: InMemoryEventsRepositoryOptions = {},
): EventsRepository {
  const events: VersionedOperatingCoreEvent[] = options.seed
    ? [...options.seed]
    : []

  function requireEvent(id: string): VersionedOperatingCoreEvent {
    const found = events.find((e) => e.id === id)
    if (!found) {
      throw new Error(`Event ${id} not found`)
    }
    return found
  }

  return {
    async findById(id) {
      return events.find((e) => e.id === id) ?? null
    },

    async list(filter) {
      let result = events
      if (filter?.serviceId !== undefined) {
        result = result.filter((e) => e.serviceId === filter.serviceId)
      }
      if (filter?.kind) {
        result = result.filter((e) => e.kind === filter.kind)
      }
      if (filter?.estado) {
        result = result.filter((e) => e.estado === filter.estado)
      }
      return result
    },

    async create(input: CreateEventInput): Promise<VersionedOperatingCoreEvent> {
      const now = new Date().toISOString()
      const created: VersionedOperatingCoreEvent = {
        id: randomUUID(),
        serviceId: input.serviceId,
        kind: input.kind,
        estado: 'active',
        title: input.title,
        startTime: input.startTime,
        visibilityScope: input.visibilityScope,
        recurrenceRule: input.recurrenceRule,
        parentEventId: input.parentEventId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      events.push(created)
      return created
    },

    async update(id, expectedVersion, patch: UpdateEventPatch) {
      const current = requireEvent(id)
      if (expectedVersion !== current.version) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion, currentVersion: current.version },
        )
      }

      const updated: VersionedOperatingCoreEvent = {
        ...current,
        title: patch.title ?? current.title,
        startTime: patch.startTime ?? current.startTime,
        visibilityScope: patch.visibilityScope ?? current.visibilityScope,
        estado: patch.estado ?? current.estado,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }

      const index = events.findIndex((e) => e.id === id)
      events[index] = updated
      return updated
    },

    async cancel(id, _motivo, _actorUserId) {
      const current = requireEvent(id)
      const updated: VersionedOperatingCoreEvent = {
        ...current,
        estado: 'cancelled',
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }
      const index = events.findIndex((e) => e.id === id)
      events[index] = updated
    },
  }
}
