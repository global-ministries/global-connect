/**
 * S04 RED — services repository
 * Verifies ServicesRepository interface contract via in-memory fake.
 */
import { OperatingCoreServiceEstado } from '@/lib/platform/operating-core/types'
import {
  OperatingCoreConcurrencyConflictError,
} from '@/lib/platform/operating-core/errors'
import type { ServicesRepository } from '@/lib/platform/operating-core/repositories/services-repository'
import { createInMemoryServicesRepository } from '@/lib/platform/operating-core/repositories/services-repository-fake'

describe('ServicesRepository', () => {
  let repo: ServicesRepository

  beforeEach(() => {
    repo = createInMemoryServicesRepository()
  })

  describe('findById', () => {
    it('should return null for non-existent id', async () => {
      const result = await repo.findById('non-existent')
      expect(result).toBeNull()
    })

    it('should return service after creation', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Sunday Service',
        weekday: 0,
        startTime: '10:00',
      })
      const found = await repo.findById(created.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.label).toBe('Sunday Service')
    })
  })

  describe('list', () => {
    it('should return empty list when no services exist', async () => {
      const result = await repo.list()
      expect(result).toHaveLength(0)
    })

    it('should return all services after creation', async () => {
      await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Sunday Service',
        weekday: 0,
        startTime: '10:00',
      })
      await repo.create({
        campusId: 'campus-1',
        kind: 'group_meeting',
        label: 'Wednesday Bible Study',
        weekday: 2,
        startTime: '19:00',
      })
      const result = await repo.list()
      expect(result).toHaveLength(2)
    })

    it('should filter by estado', async () => {
      const s1 = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Active Service',
        weekday: 0,
        startTime: '10:00',
      })
      await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Disabled Service',
        weekday: 1,
        startTime: '11:00',
      })
      await repo.update(s1.id, s1.version, { estado: 'disabled' })
      const result = await repo.list({ estado: 'disabled' })
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Active Service')
    })
  })

  describe('create', () => {
    it('should create service with auto-generated id and version 1', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'New Service',
        weekday: 0,
        startTime: '10:00',
      })
      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.campusId).toBe('campus-1')
      expect(created.kind).toBe('service')
      expect(created.label).toBe('New Service')
      expect(created.weekday).toBe(0)
      expect(created.startTime).toBe('10:00')
      expect(created.estado).toBe('active')
      expect(created.version).toBe(1)
      expect(created.createdAt).toBeDefined()
      expect(created.updatedAt).toBeDefined()
    })
  })

  describe('update with optimistic locking', () => {
    it('should increment version on successful update', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Original',
        weekday: 0,
        startTime: '10:00',
      })
      const updated = await repo.update(created.id, 1, { label: 'Updated' })
      expect(updated.label).toBe('Updated')
      expect(updated.version).toBe(2)
    })

    it('should throw ConcurrencyConflictError on version mismatch', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Test',
        weekday: 0,
        startTime: '10:00',
      })
      await expect(
        repo.update(created.id, 99, { label: 'Hacked' }),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('should persist update when version matches', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'Before',
        weekday: 0,
        startTime: '10:00',
      })
      await repo.update(created.id, 1, { label: 'After' })
      const found = await repo.findById(created.id)
      expect(found!.label).toBe('After')
      expect(found!.version).toBe(2)
    })
  })

  describe('cancel', () => {
    it('should transition service to removed estado', async () => {
      const created = await repo.create({
        campusId: 'campus-1',
        kind: 'service',
        label: 'To Cancel',
        weekday: 0,
        startTime: '10:00',
      })
      await repo.cancel(created.id, 'no longer needed', 'director-1')
      const found = await repo.findById(created.id)
      expect(found!.estado).toBe('removed')
    })
  })
})
