/**
 * S22 — In-memory fake implementation of RecurrentEventRepository.
 *
 * For unit tests only. Implements lazy deterministic materialization
 * using the pure state functions.
 */

import { randomUUID } from 'node:crypto'
import type { RecurrentEventRepository } from './recurrent-repository'
import type { MaterializationInput, MaterializedInstance, RecurrenceRule } from './recurrent-types'
import { generateInstanceDates } from './recurrent-state'

export interface InMemoryRecurrentRepositoryOptions {
  readonly seed?: ReadonlyArray<MaterializedInstance>
  /**
   * Reader for parent events — retrieves the recurrence rule for materialization.
   * If not provided, materialization returns empty (no recurrence rule found).
   */
  readonly eventReader?: (eventId: string) => Promise<{ recurrenceRule: RecurrenceRule | null; startTime: string } | null>
}

export function createInMemoryRecurrentRepository(
  options: InMemoryRecurrentRepositoryOptions = {},
): RecurrentEventRepository {
  const instances: MaterializedInstance[] = options.seed ? [...options.seed] : []
  const { eventReader } = options

  function findById(id: string): MaterializedInstance | null {
    return instances.find((i) => i.id === id) ?? null
  }

  return {
    async materialize(input: MaterializationInput): Promise<readonly MaterializedInstance[]> {
      const { event_id, horizon_days } = input

      // Look up the parent event's recurrence rule
      let parentEvent: { recurrenceRule: RecurrenceRule | null; startTime: string } | null = null
      if (eventReader) {
        parentEvent = await eventReader(event_id)
      }

      if (!parentEvent || !parentEvent.recurrenceRule) {
        // No recurrence rule — nothing to materialize
        return []
      }

      const { recurrenceRule, startTime } = parentEvent
      const startDate = startTime.substring(0, 10) // YYYY-MM-DD

      const { dates } = generateInstanceDates(recurrenceRule, startDate, horizon_days)

      const now = new Date().toISOString()
      const newInstances: MaterializedInstance[] = []

      for (const instanceDate of dates) {
        // Check if already exists (idempotent)
        const existing = instances.find(
          (i) => i.eventId === event_id && i.instanceDate === instanceDate,
        )
        if (!existing) {
          const created: MaterializedInstance = {
            id: randomUUID(),
            eventId: event_id,
            instanceDate: instanceDate,
            estado: 'active',
            lifecycle: 'scheduled',
            startTime: `${instanceDate}T${recurrenceRule.startTime ?? '00:00'}:00Z`,
            endTime: `${instanceDate}T${recurrenceRule.startTime ?? '00:00'}:00Z`, // same for now
            capacityOperativa: 0,
            recurrenceRule: recurrenceRule,
            horizonDays: horizon_days,
            version: 1,
            createdAt: now,
            updatedAt: now,
          }
          instances.push(created)
          newInstances.push(created)
        }
      }

      // Return all instances for this event within the horizon
      return instances.filter((i) => {
        if (i.eventId !== event_id) return false
        // Check if within generated dates
        return dates.includes(i.instanceDate)
      })
    },

    async getById(id: string): Promise<MaterializedInstance | null> {
      return findById(id)
    },

    async listByEvent(
      eventId: string,
      range?: { readonly from: string; readonly to: string },
    ): Promise<readonly MaterializedInstance[]> {
      let result = instances.filter((i) => i.eventId === eventId)
      if (range) {
        result = result.filter(
          (i) => i.instanceDate >= range.from && i.instanceDate <= range.to,
        )
      }
      return result
    },
  }
}
