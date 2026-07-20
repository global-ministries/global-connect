/**
 * S16 — Resources repository factory.
 * Currently returns in-memory fake. Future slice adds Supabase adapter.
 */
import { createInMemoryResourcesRepository } from './resource-repository-fake'
import type { ResourcesRepository } from './resource-repository'

export function createOperatingCoreResourcesRepository(): ResourcesRepository {
  return createInMemoryResourcesRepository()
}
