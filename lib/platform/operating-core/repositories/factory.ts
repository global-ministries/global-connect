/**
 * Repository factory for Operating Core.
 * Returns in-memory fakes for now; Supabase adapter comes in a later slice.
 */
import { createInMemoryEventsRepository } from './events-repository-fake'
import { createInMemoryServicesRepository } from './services-repository-fake'
import type { EventsRepository } from './events-repository'
import type { ServicesRepository } from './services-repository'

export function createOperatingCoreEventsRepository(): EventsRepository {
  return createInMemoryEventsRepository()
}

export function createOperatingCoreServicesRepository(): ServicesRepository {
  return createInMemoryServicesRepository()
}
