/**
 * S16 TDD RED — resources-repository tests with in-memory fake.
 * Tests cover:
 * - create + findById + list with filters
 * - transferOwnership creates successor + archives prior (IMMutable)
 * - archive marks row archived
 */
import type {
  CreateResourceInput,
  ResourceTransferRequest,
} from '@/lib/platform/operating-core/resources/resource-types'
import { createInMemoryResourcesRepository } from '@/lib/platform/operating-core/resources/resource-repository-fake'

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeCreateInput(overrides: Partial<CreateResourceInput> = {}): CreateResourceInput {
  return {
    kind: 'link',
    title: 'Test Resource',
    description: 'A test resource',
    category: 'documentation',
    tags: ['test'],
    area_experience_id: 'exp-1',
    visible_to_roles: ['director'],
    visible_to_capabilities: [],
    created_by_persona_id: 'persona-1',
    current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ResourcesRepository (fake)
// ---------------------------------------------------------------------------

describe('ResourcesRepository (fake)', () => {
  let repo: import('@/lib/platform/operating-core/resources/resource-repository').ResourcesRepository

  beforeEach(() => {
    repo = createInMemoryResourcesRepository()
  })

  // ---------------------------------------------------------------------------
  // create + findById
  // ---------------------------------------------------------------------------

  describe('create + findById', () => {
    it('creates a resource and returns it with all fields populated', async () => {
      const input = makeCreateInput({ title: 'My Resource', kind: 'file' })
      const resource = await repo.create(input)

      expect(resource.id).toBeDefined()
      expect(resource.kind).toBe('file')
      expect(resource.title).toBe('My Resource')
      expect(resource.category).toBe('documentation')
      expect(resource.tags).toEqual(['test'])
      expect(resource.area_experience_id).toBe('exp-1')
      expect(resource.created_by_persona_id).toBe('persona-1')
      expect(resource.archived_at).toBeNull()
      expect(resource.successor_of).toBeNull()
    })

    it('findById returns the created resource', async () => {
      const created = await repo.create(makeCreateInput({ title: 'Find Me' }))
      const found = await repo.findById(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.title).toBe('Find Me')
    })

    it('findById returns null for unknown id', async () => {
      const found = await repo.findById('unknown-id')
      expect(found).toBeNull()
    })

    it('created resource has null archived_at and successor_of', async () => {
      const resource = await repo.create(makeCreateInput())
      expect(resource.archived_at).toBeNull()
      expect(resource.successor_of).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // list with filters
  // ---------------------------------------------------------------------------

  describe('list with filters', () => {
    beforeEach(async () => {
      await repo.create(makeCreateInput({ title: 'Link 1', kind: 'link', category: 'docs', tags: ['a'] }))
      await repo.create(makeCreateInput({ title: 'File 1', kind: 'file', category: 'docs', tags: ['a', 'b'] }))
      await repo.create(makeCreateInput({ title: 'Video 1', kind: 'video', category: 'media', tags: ['b'] }))
    })

    it('returns all resources when no filter', async () => {
      const list = await repo.list()
      expect(list).toHaveLength(3)
    })

    it('filters by kind', async () => {
      const list = await repo.list({ kind: 'link' })
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe('Link 1')
    })

    it('filters by area_experience_id', async () => {
      await repo.create(makeCreateInput({ area_experience_id: 'exp-2', title: 'Exp 2 Link' }))
      const list = await repo.list({ area_experience_id: 'exp-2' })
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe('Exp 2 Link')
    })

    it('filters by category', async () => {
      const list = await repo.list({ category: 'media' })
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe('Video 1')
    })

    it('filters by tag', async () => {
      const list = await repo.list({ tag: 'a' })
      expect(list).toHaveLength(2)
    })

    it('does not include archived by default', async () => {
      // Manually archive one resource via repo
      const r = await repo.create(makeCreateInput({ title: 'Will Archive' }))
      await repo.archive({
        resource_id: r.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T12:00:00.000Z',
        reason: 'test',
      })

      const list = await repo.list()
      expect(list.find((res) => res.title === 'Will Archive')).toBeUndefined()
    })

    it('includes archived when includeArchived=true', async () => {
      const r = await repo.create(makeCreateInput({ title: 'Will Archive' }))
      await repo.archive({
        resource_id: r.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T12:00:00.000Z',
        reason: 'test',
      })

      const list = await repo.list({ includeArchived: true })
      expect(list.find((res) => res.title === 'Will Archive')).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // transferOwnership — IMMUTABLE (the centerpiece of S16)
  // ---------------------------------------------------------------------------

  describe('transferOwnership — IMMUTABLE', () => {
    it('creates successor row and archives prior without mutating original', async () => {
      const prior = await repo.create(makeCreateInput({
        title: 'Prior Resource',
        area_experience_id: 'exp-1',
        visible_to_roles: ['director'],
        visible_to_capabilities: [],
      }))

      const request: ResourceTransferRequest = {
        resource_id: prior.id,
        new_area_experience_id: 'exp-2',
        new_visible_to_roles: ['coordinator'],
        new_visible_to_capabilities: [],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
      }

      const result = await repo.transferOwnership(request)

      // Verify successor exists
      expect(result.successor.id).not.toBe(prior.id)
      expect(result.successor.area_experience_id).toBe('exp-2')
      expect(result.successor.visible_to_roles).toEqual(['coordinator'])
      expect(result.successor.successor_of).toBe(prior.id)
      expect(result.successor.archived_at).toBeNull()
      expect(result.successor.title).toBe('Prior Resource') // title preserved

      // CRITICAL: Verify prior row's area_experience_id is UNCHANGED
      const priorAfter = await repo.findById(prior.id)
      expect(priorAfter!.area_experience_id).toBe('exp-1') // UNCHANGED
      expect(priorAfter!.visible_to_roles).toEqual(['director']) // UNCHANGED

      // Verify prior row is archived
      expect(priorAfter!.archived_at).toBe('2026-07-20T14:00:00.000Z')

      // archived reference should point to prior
      expect(result.archived.id).toBe(prior.id)
      expect(result.archived.archived_at).toBe('2026-07-20T14:00:00.000Z')
    })

    it('prior row area_experience_id remains unchanged after transferOwnership', async () => {
      const prior = await repo.create(makeCreateInput({
        area_experience_id: 'original-scope',
        visible_to_roles: ['admin'],
        visible_to_capabilities: ['cap-a'],
      }))

      await repo.transferOwnership({
        resource_id: prior.id,
        new_area_experience_id: 'new-scope',
        new_visible_to_roles: ['member'],
        new_visible_to_capabilities: ['cap-b'],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
      })

      const priorAfter = await repo.findById(prior.id)
      // The CRITICAL immutability check: original's ownership fields never changed
      expect(priorAfter!.area_experience_id).toBe('original-scope')
      expect(priorAfter!.visible_to_roles).toEqual(['admin'])
      expect(priorAfter!.visible_to_capabilities).toEqual(['cap-a'])
      expect(priorAfter!.archived_at).not.toBeNull()
    })

    it('successor row has successor_of pointing to prior id', async () => {
      const prior = await repo.create(makeCreateInput())

      const result = await repo.transferOwnership({
        resource_id: prior.id,
        new_area_experience_id: 'exp-2',
        new_visible_to_roles: [],
        new_visible_to_capabilities: [],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
      })

      expect(result.successor.successor_of).toBe(prior.id)
    })

    it('archived_at is set on prior row but not on successor', async () => {
      const prior = await repo.create(makeCreateInput())

      const transferTime = '2026-07-20T14:00:00.000Z'

      const result = await repo.transferOwnership({
        resource_id: prior.id,
        new_area_experience_id: 'exp-2',
        new_visible_to_roles: [],
        new_visible_to_capabilities: [],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: transferTime,
      })

      const priorAfter = await repo.findById(prior.id)
      expect(priorAfter!.archived_at).toBe(transferTime)
      expect(result.successor.archived_at).toBeNull()
    })

    it('throws when transferring to same scope (no-op rejected)', async () => {
      const resource = await repo.create(makeCreateInput({ area_experience_id: 'exp-same' }))

      const request: ResourceTransferRequest = {
        resource_id: resource.id,
        new_area_experience_id: 'exp-same', // same scope — no-op
        new_visible_to_roles: [],
        new_visible_to_capabilities: [],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
      }

      await expect(repo.transferOwnership(request)).rejects.toThrow()
    })

    it('throws when transferring archived resource', async () => {
      const resource = await repo.create(makeCreateInput())
      await repo.archive({
        resource_id: resource.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T12:00:00.000Z',
        reason: 'test archive',
      })

      const request: ResourceTransferRequest = {
        resource_id: resource.id,
        new_area_experience_id: 'exp-2',
        new_visible_to_roles: [],
        new_visible_to_capabilities: [],
        actor_persona_id: 'persona-actor',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
      }

      await expect(repo.transferOwnership(request)).rejects.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // archive
  // ---------------------------------------------------------------------------

  describe('archive', () => {
    it('marks resource as archived without deleting it', async () => {
      const resource = await repo.create(makeCreateInput())
      const archived = await repo.archive({
        resource_id: resource.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
        reason: 'no longer needed',
      })

      expect(archived.id).toBe(resource.id)
      expect(archived.archived_at).toBe('2026-07-20T14:00:00.000Z')

      // Still findable
      const found = await repo.findById(resource.id)
      expect(found).not.toBeNull()
      expect(found!.archived_at).toBe('2026-07-20T14:00:00.000Z')
    })

    it('throws when resource not found', async () => {
      await expect(repo.archive({
        resource_id: 'nonexistent',
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
        reason: 'test',
      })).rejects.toThrow()
    })

    it('throws when already archived', async () => {
      const resource = await repo.create(makeCreateInput())
      await repo.archive({
        resource_id: resource.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T12:00:00.000Z',
        reason: 'first archive',
      })

      await expect(repo.archive({
        resource_id: resource.id,
        actor_persona_id: 'persona-1',
        current_iso_timestamp: '2026-07-20T14:00:00.000Z',
        reason: 'second archive',
      })).rejects.toThrow()
    })
  })
})
