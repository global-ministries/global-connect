/**
 * S04 RED — events repository
 * Verifies EventsRepository interface contract via in-memory fake.
 */
import { OperatingCoreEventKind, OperatingCoreEventEstado } from '@/lib/platform/operating-core/types'
import {
  OperatingCoreConcurrencyConflictError,
} from '@/lib/platform/operating-core/errors'
import type { EventsRepository } from '@/lib/platform/operating-core/repositories/events-repository'
import { createInMemoryEventsRepository } from '@/lib/platform/operating-core/repositories/events-repository-fake'

describe('EventsRepository', () => {
  let repo: EventsRepository

  beforeEach(() => {
    repo = createInMemoryEventsRepository()
  })

  describe('findById', () => {
    it('should return null for non-existent id', async () => {
      const result = await repo.findById('non-existent')
      expect(result).toBeNull()
    })

    it('should return event after creation', async () => {
      const created = await repo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Sunday Service',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      const found = await repo.findById(created.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.title).toBe('Sunday Service')
    })
  })

  describe('list', () => {
    it('should return empty list when no events exist', async () => {
      const result = await repo.list()
      expect(result).toHaveLength(0)
    })

    it('should return all events after creation', async () => {
      await repo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Sunday Service',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await repo.create({
        serviceId: null,
        kind: 'workshop',
        title: 'Workshop',
        startTime: '2026-01-05T14:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      const result = await repo.list()
      expect(result).toHaveLength(2)
    })

    it('should filter by serviceId', async () => {
      const e1 = await repo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Service 1',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await repo.create({
        serviceId: 'svc-2',
        kind: 'service',
        title: 'Service 2',
        startTime: '2026-01-04T11:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      const result = await repo.list({ serviceId: 'svc-1' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(e1.id)
    })

    it('should filter by kind', async () => {
      await repo.create({
        serviceId: null,
        kind: 'service',
        title: 'Service Event',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await repo.create({
        serviceId: null,
        kind: 'workshop',
        title: 'Workshop Event',
        startTime: '2026-01-05T14:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      const result = await repo.list({ kind: 'workshop' })
      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('workshop')
    })
  })

  describe('create', () => {
    it('should create event with auto-generated id and version 1', async () => {
      const created = await repo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'New Event',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.serviceId).toBe('svc-1')
      expect(created.kind).toBe('service')
      expect(created.title).toBe('New Event')
      expect(created.estado).toBe('active')
      expect(created.version).toBe(1)
      expect(created.createdAt).toBeDefined()
      expect(created.updatedAt).toBeDefined()
    })
  })

  describe('update with optimistic locking', () => {
    it('should increment version on successful update', async () => {
      const created = await repo.create({
        serviceId: 'svc-1',
        kind: 'service',
        title: 'Original',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      const updated = await repo.update(created.id, 1, { title: 'Updated' })
      expect(updated.title).toBe('Updated')
      expect(updated.version).toBe(2)
    })

    it('should throw ConcurrencyConflictError on version mismatch', async () => {
      const created = await repo.create({
        serviceId: null,
        kind: 'workshop',
        title: 'Test',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await expect(
        repo.update(created.id, 99, { title: 'Hacked' }),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('should persist update when version matches', async () => {
      const created = await repo.create({
        serviceId: null,
        kind: 'activity',
        title: 'Before',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await repo.update(created.id, 1, { title: 'After' })
      const found = await repo.findById(created.id)
      expect(found!.title).toBe('After')
      expect(found!.version).toBe(2)
    })
  })

  describe('cancel', () => {
    it('should transition event to cancelled estado', async () => {
      const created = await repo.create({
        serviceId: null,
        kind: 'custom',
        title: 'To Cancel',
        startTime: '2026-01-04T10:00:00Z',
        visibilityScope: 'grupos_vida',
        recurrenceRule: null,
        parentEventId: null,
      })
      await repo.cancel(created.id, 'weather cancellation', 'director-1')
      const found = await repo.findById(created.id)
      expect(found!.estado).toBe('cancelled')
    })
  })
})
