/**
 * S04 RED — event-instances repository
 * Verifies EventInstancesRepository interface contract via in-memory fake.
 * Tests lazy RRULE materialization semantics.
 */
import { OperatingCoreEventEstado } from '@/lib/platform/operating-core/types'
import {
  OperatingCoreConcurrencyConflictError,
} from '@/lib/platform/operating-core/errors'
import type { EventInstancesRepository } from '@/lib/platform/operating-core/repositories/event-instances-repository'
import {
  createInMemoryEventInstancesRepository,
} from '@/lib/platform/operating-core/repositories/event-instances-repository-fake'
import type { VersionedOperatingCoreEvent } from '@/lib/platform/operating-core/repositories/events-repository'
import { createInMemoryEventsRepository } from '@/lib/platform/operating-core/repositories/events-repository-fake'

describe('EventInstancesRepository', () => {
  let instanceRepo: EventInstancesRepository
  let eventRepo: ReturnType<typeof createInMemoryEventsRepository>

  beforeEach(() => {
    eventRepo = createInMemoryEventsRepository()
    // Create instance repo with event reader wired to event repo
    instanceRepo = createInMemoryEventInstancesRepository({
      eventReader: eventRepo.findById.bind(eventRepo),
    })
  })

  describe('findById', () => {
    it('should return null for non-existent id', async () => {
      const result = await instanceRepo.findById('non-existent')
      expect(result).toBeNull()
    })

    it('should return instance after creation', async () => {
      const instance = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      const found = await instanceRepo.findById(instance.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(instance.id)
      expect(found!.instanceDate).toBe('2026-01-04')
    })
  })

  describe('listByEvent', () => {
    it('should return empty list when no instances exist', async () => {
      const result = await instanceRepo.listByEvent('evt-1')
      expect(result).toHaveLength(0)
    })

    it('should return all instances for an event', async () => {
      await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-11',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.create({
        eventId: 'evt-2',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 25,
      })
      const result = await instanceRepo.listByEvent('evt-1')
      expect(result).toHaveLength(2)
    })

    it('should filter by date range', async () => {
      await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-11',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-18',
        estado: 'active',
        capacityOperativa: 30,
      })
      const result = await instanceRepo.listByEvent('evt-1', {
        from: '2026-01-01',
        to: '2026-01-10',
      })
      expect(result).toHaveLength(1)
      expect(result[0].instanceDate).toBe('2026-01-04')
    })
  })

  describe('create', () => {
    it('should create instance with auto-generated id and version 1', async () => {
      const created = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.eventId).toBe('evt-1')
      expect(created.instanceDate).toBe('2026-01-04')
      expect(created.estado).toBe('active')
      expect(created.capacityOperativa).toBe(30)
      expect(created.version).toBe(1)
      expect(created.createdAt).toBeDefined()
      expect(created.updatedAt).toBeDefined()
    })
  })

  describe('update with optimistic locking', () => {
    it('should increment version on successful update', async () => {
      const created = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      const updated = await instanceRepo.update(created.id, 1, {
        estado: 'cancelled',
      })
      expect(updated.estado).toBe('cancelled')
      expect(updated.version).toBe(2)
    })

    it('should throw ConcurrencyConflictError on version mismatch', async () => {
      const created = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      await expect(
        instanceRepo.update(created.id, 99, { estado: 'cancelled' }),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('should persist update when version matches', async () => {
      const created = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.update(created.id, 1, { capacityOperativa: 50 })
      const found = await instanceRepo.findById(created.id)
      expect(found!.capacityOperativa).toBe(50)
      expect(found!.version).toBe(2)
    })
  })

  describe('cancel', () => {
    it('should transition instance to cancelled estado', async () => {
      const created = await instanceRepo.create({
        eventId: 'evt-1',
        instanceDate: '2026-01-04',
        estado: 'active',
        capacityOperativa: 30,
      })
      await instanceRepo.cancel(created.id, 'weather cancellation', 'director-1')
      const found = await instanceRepo.findById(created.id)
      expect(found!.estado).toBe('cancelled')
    })
  })

  describe('materialize (lazy RRULE-subset)', () => {
    it('should materialize instances from recurrence rule within horizon', async () => {
      // Create a recurring event (kind=service referencing a service)
      const recurringEvent = await eventRepo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Sunday Service',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: {
          freq: 'weekly',
          interval: 1,
          count: null,
          until: null,
          byDay: [0], // Sunday
          startTime: '10:00',
        },
        parentEventId: null,
      })

      // Materialize 4 weeks from the event
      const instances = await instanceRepo.materialize(recurringEvent.id, 28)

      expect(instances).toHaveLength(4)
      expect(instances[0].instanceDate).toBe('2026-01-04')
      expect(instances[1].instanceDate).toBe('2026-01-11')
      expect(instances[2].instanceDate).toBe('2026-01-18')
      expect(instances[3].instanceDate).toBe('2026-01-25')
    })

    it('should materialize with correct byDay filter', async () => {
      // Create an event with recurrence on Wednesday (3) and Sunday (0)
      const recurringEvent = await eventRepo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Multi-day Service',
        startTime: '2026-01-07T10:00:00Z', // Wednesday
        visibilityScope: 'grupos_vida',
        recurrenceRule: {
          freq: 'weekly',
          interval: 1,
          count: null,
          until: null,
          byDay: [0, 3], // Sunday and Wednesday
          startTime: '10:00',
        },
        parentEventId: null,
      })

      // Materialize 14 days (should get 2 Wednesdays and 2 Sundays)
      const instances = await instanceRepo.materialize(recurringEvent.id, 14)

      expect(instances).toHaveLength(4)
      // Verify dates are correct
      const dates = instances.map((i) => i.instanceDate).sort()
      expect(dates).toContain('2026-01-07') // Wednesday
      expect(dates).toContain('2026-01-11') // Sunday
      expect(dates).toContain('2026-01-14') // Wednesday
      expect(dates).toContain('2026-01-18') // Sunday
    })

    it('should respect count in recurrence rule', async () => {
      const recurringEvent = await eventRepo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Limited Series',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: {
          freq: 'weekly',
          interval: 1,
          count: 3, // Only 3 instances
          until: null,
          byDay: [0],
          startTime: '10:00',
        },
        parentEventId: null,
      })

      // Ask for more than count allows
      const instances = await instanceRepo.materialize(recurringEvent.id, 90)

      expect(instances).toHaveLength(3) // Should be limited by count
    })

    it('should use capacityOperativa from parent event/service', async () => {
      const recurringEvent = await eventRepo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Capacity Test',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: {
          freq: 'weekly',
          interval: 1,
          count: 2,
          until: null,
          byDay: [0],
          startTime: '10:00',
        },
        parentEventId: null,
      })

      const instances = await instanceRepo.materialize(recurringEvent.id, 14)

      expect(instances).toHaveLength(2)
      // Default capacityOperativa is 0 unless provided
      instances.forEach((inst) => {
        expect(typeof inst.capacityOperativa).toBe('number')
      })
    })

    it('should not duplicate instances on repeated materialization (idempotent)', async () => {
      const recurringEvent = await eventRepo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Idempotent Test',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: {
          freq: 'weekly',
          interval: 1,
          count: null,
          until: null,
          byDay: [0],
          startTime: '10:00',
        },
        parentEventId: null,
      })

      // Materialize with 14 days horizon (Jan 4 + 14 = Jan 18, exclusive)
      // Weekly Sundays: Jan 4, Jan 11 = 2 instances
      await instanceRepo.materialize(recurringEvent.id, 14)
      const secondResult = await instanceRepo.materialize(recurringEvent.id, 14)

      // Both calls should return the same 2 instances (idempotent)
      expect(secondResult).toHaveLength(2)

      // No duplicates created - list should still have only 2 instances
      const allInstances = await instanceRepo.listByEvent(recurringEvent.id)
      const dates = allInstances.map((i) => i.instanceDate).sort()
      expect(dates).toEqual(['2026-01-04', '2026-01-11'])
    })
  })
})
