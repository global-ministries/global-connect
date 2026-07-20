/**
 * S16 — Operating Core Resources in-memory fake repository.
 */
import type {
  OperatingCoreResource,
  CreateResourceInput,
  ResourceTransferRequest,
  ResourceArchiveRequest,
} from './resource-types'
import type { ResourcesRepository, ListResourcesFilter } from './resource-repository'
import { buildSuccessorFromTransfer, validateCreateInput } from './resource-state'

export function createInMemoryResourcesRepository(): ResourcesRepository {
  const store = new Map<string, OperatingCoreResource>()

  async function create(input: CreateResourceInput): Promise<OperatingCoreResource> {
    const validation = validateCreateInput(input)
    if (!validation.ok) {
      throw new Error(validation.error)
    }

    const resource: OperatingCoreResource = {
      id: crypto.randomUUID(),
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      tags: input.tags ?? [],
      area_experience_id: input.area_experience_id,
      visible_to_roles: input.visible_to_roles ?? [],
      visible_to_capabilities: input.visible_to_capabilities ?? [],
      created_by_persona_id: input.created_by_persona_id,
      created_at: input.current_iso_timestamp,
      archived_at: null,
      successor_of: null,
    }

    store.set(resource.id, resource)
    return resource
  }

  async function findById(id: string): Promise<OperatingCoreResource | null> {
    return store.get(id) ?? null
  }

  async function list(filter?: ListResourcesFilter): Promise<readonly OperatingCoreResource[]> {
    let results = Array.from(store.values())

    if (filter?.kind !== undefined) {
      results = results.filter((r) => r.kind === filter.kind)
    }

    if (filter?.area_experience_id !== undefined) {
      results = results.filter((r) => r.area_experience_id === filter.area_experience_id)
    }

    if (filter?.category !== undefined) {
      results = results.filter((r) => r.category === filter.category)
    }

    if (filter?.tag !== undefined) {
      results = results.filter((r) => r.tags.includes(filter.tag!))
    }

    if (!filter?.includeArchived) {
      results = results.filter((r) => r.archived_at === null)
    }

    return results
  }

  async function transferOwnership(
    request: ResourceTransferRequest,
  ): Promise<{ successor: OperatingCoreResource; archived: OperatingCoreResource }> {
    const current = store.get(request.resource_id)
    if (!current) {
      throw new Error('resource_not_found')
    }

    const result = buildSuccessorFromTransfer(current, request)
    if (!result.success) {
      throw new Error(result.error)
    }

    // Archive the prior row (immutable: only set archived_at, no other changes)
    const archived: OperatingCoreResource = {
      ...current,
      archived_at: result.archived_at,
    }
    store.set(current.id, archived)

    // Insert successor row
    store.set(result.successor.id, result.successor)

    return { successor: result.successor, archived }
  }

  async function archive(request: ResourceArchiveRequest): Promise<OperatingCoreResource> {
    const current = store.get(request.resource_id)
    if (!current) {
      throw new Error('resource_not_found')
    }

    if (current.archived_at !== null) {
      throw new Error('resource_archived')
    }

    const archived: OperatingCoreResource = {
      ...current,
      archived_at: request.current_iso_timestamp,
    }

    store.set(current.id, archived)
    return archived
  }

  return { create, findById, list, transferOwnership, archive }
}
