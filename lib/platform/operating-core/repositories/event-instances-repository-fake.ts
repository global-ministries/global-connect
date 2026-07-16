/**
 * In-memory fake implementation of EventInstancesRepository.
 * For unit tests only — no Supabase adapter in this slice.
 * Implements lazy RRULE-subset materialization.
 */
import { randomUUID } from 'node:crypto'
import type {
  CreateEventInstanceInput,
  EventInstancesRepository,
  UpdateEventInstancePatch,
  VersionedOperatingCoreEventInstance,
} from './event-instances-repository'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import type { OperatingCoreRecurrenceRule } from '@/lib/platform/operating-core/types'
import type { VersionedOperatingCoreEvent } from './events-repository'

export interface InMemoryEventInstancesRepositoryOptions {
  readonly seed?: ReadonlyArray<VersionedOperatingCoreEventInstance>
  /** Event reader for materialization — retrieves the parent event's recurrence rule. */
  readonly eventReader?: (eventId: string) => Promise<VersionedOperatingCoreEvent | null>
}

export function createInMemoryEventInstancesRepository(
  options: InMemoryEventInstancesRepositoryOptions = {},
): EventInstancesRepository {
  const instances: VersionedOperatingCoreEventInstance[] = options.seed
    ? [...options.seed]
    : []

  // Default event reader if not provided — looks up from seeded instances
  // This allows tests to provide their own event store
  let eventReader = options.eventReader

  function requireInstance(id: string): VersionedOperatingCoreEventInstance {
    const found = instances.find((i) => i.id === id)
    if (!found) {
      throw new Error(`EventInstance ${id} not found`)
    }
    return found
  }

  /**
   * Generate instance dates from a recurrence rule within a horizon.
   * Implements lazy deterministic RRULE-subset materialization.
   * The horizon is exclusive: dates strictly less than (startDate + horizonDays) are included.
   */
  function generateInstanceDates(
    startTime: string,
    rule: OperatingCoreRecurrenceRule,
    horizonDays: number,
  ): string[] {
    const dates: string[] = []
    const startDate = new Date(startTime)
    // Horizon is exclusive: < startDate + horizonDays
    const horizonDate = new Date(startDate)
    horizonDate.setDate(horizonDate.getDate() + horizonDays)

    // Starting point: the start date itself
    let currentDate = new Date(startDate)
    const byDay = rule.byDay ?? []

    // Count how many instances we've generated
    let count = 0
    const maxCount = rule.count ?? Infinity

    while (currentDate < horizonDate && count < maxCount) {
      // Check if current date matches the byDay rule (if specified)
      const dayOfWeek = currentDate.getDay()
      const matchesByDay = byDay.length === 0 || byDay.includes(dayOfWeek)

      if (matchesByDay) {
        // Format as YYYY-MM-DD
        const year = currentDate.getFullYear()
        const month = String(currentDate.getMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getDate()).padStart(2, '0')
        dates.push(`${year}-${month}-${day}`)
        count++
      }

      // Advance to next occurrence
      if (byDay.length > 0) {
        // Jump to next day and find the next matching byDay
        currentDate.setDate(currentDate.getDate() + 1)
        while (currentDate < horizonDate && !byDay.includes(currentDate.getDay())) {
          currentDate.setDate(currentDate.getDate() + 1)
        }
      } else {
        // Simple weekly interval
        currentDate.setDate(currentDate.getDate() + rule.interval * 7)
      }
    }

    return dates
  }

  return {
    async findById(id) {
      return instances.find((i) => i.id === id) ?? null
    },

    async listByEvent(eventId, range) {
      let result = instances.filter((i) => i.eventId === eventId)
      if (range) {
        const fromDate = range.from
        const toDate = range.to
        result = result.filter(
          (i) => i.instanceDate >= fromDate && i.instanceDate <= toDate,
        )
      }
      return result
    },

    async materialize(eventId, horizonDays) {
      // Get the parent event to read its recurrence rule
      let parentEvent: VersionedOperatingCoreEvent | null = null

      if (eventReader) {
        parentEvent = await eventReader(eventId)
      }

      // If we have a recurrence rule, generate instances
      if (parentEvent?.recurrenceRule) {
        const rule = parentEvent.recurrenceRule
        const startTime = parentEvent.startTime
        const dates = generateInstanceDates(startTime, rule, horizonDays)

        // Create instances for each date that doesn't already exist
        const now = new Date().toISOString()
        const newInstances: VersionedOperatingCoreEventInstance[] = []

        for (const instanceDate of dates) {
          // Check if instance already exists (idempotent)
          const existing = instances.find(
            (i) => i.eventId === eventId && i.instanceDate === instanceDate,
          )
          if (!existing) {
            const created: VersionedOperatingCoreEventInstance = {
              id: randomUUID(),
              eventId,
              instanceDate,
              estado: 'active',
              capacityOperativa: 0, // Default; would come from Service in real impl
              version: 1,
              createdAt: now,
              updatedAt: now,
            }
            instances.push(created)
            newInstances.push(created)
          }
        }

        // Return all instances for this event within the dates range
        const allDates = generateInstanceDates(startTime, rule, horizonDays)
        return instances.filter(
          (i) =>
            i.eventId === eventId &&
            allDates.includes(i.instanceDate),
        )
      }

      // No recurrence rule — nothing to materialize
      return []
    },

    async create(
      input: CreateEventInstanceInput,
    ): Promise<VersionedOperatingCoreEventInstance> {
      const now = new Date().toISOString()
      const created: VersionedOperatingCoreEventInstance = {
        id: randomUUID(),
        eventId: input.eventId,
        instanceDate: input.instanceDate,
        estado: input.estado,
        capacityOperativa: input.capacityOperativa,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      instances.push(created)
      return created
    },

    async update(id, expectedVersion, patch: UpdateEventInstancePatch) {
      const current = requireInstance(id)
      if (expectedVersion !== current.version) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion, currentVersion: current.version },
        )
      }

      const updated: VersionedOperatingCoreEventInstance = {
        ...current,
        estado: patch.estado ?? current.estado,
        capacityOperativa:
          patch.capacityOperativa ?? current.capacityOperativa,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }

      const index = instances.findIndex((i) => i.id === id)
      instances[index] = updated
      return updated
    },

    async cancel(id, _motivo, _actorUserId) {
      const current = requireInstance(id)
      const updated: VersionedOperatingCoreEventInstance = {
        ...current,
        estado: 'cancelled',
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }
      const index = instances.findIndex((i) => i.id === id)
      instances[index] = updated
    },
  }
}

/** Helper to create a repository with an event reader for materialization tests. */
export function createInMemoryEventInstancesRepositoryWithEvents(
  eventRepo: {
    findById: (id: string) => Promise<VersionedOperatingCoreEvent | null>
  },
): EventInstancesRepository {
  return createInMemoryEventInstancesRepository({
    eventReader: eventRepo.findById,
  })
}
