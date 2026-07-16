/**
 * In-memory fake implementation of ServicesRepository.
 * For unit tests only — no Supabase adapter in this slice.
 */
import { randomUUID } from 'node:crypto'
import type {
  CreateServiceInput,
  ServicesRepository,
  UpdateServicePatch,
  VersionedOperatingCoreService,
} from './services-repository'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'

export interface InMemoryServicesRepositoryOptions {
  readonly seed?: ReadonlyArray<VersionedOperatingCoreService>
}

export function createInMemoryServicesRepository(
  options: InMemoryServicesRepositoryOptions = {},
): ServicesRepository {
  const services: VersionedOperatingCoreService[] = options.seed
    ? [...options.seed]
    : []

  function requireService(id: string): VersionedOperatingCoreService {
    const found = services.find((s) => s.id === id)
    if (!found) {
      throw new Error(`Service ${id} not found`)
    }
    return found
  }

  return {
    async findById(id) {
      return services.find((s) => s.id === id) ?? null
    },

    async list(filter) {
      let result = services
      if (filter?.estado) {
        result = result.filter((s) => s.estado === filter.estado)
      }
      // experiencia filter is a no-op in this slice (Experience is out of scope for repos)
      return result
    },

    async create(input: CreateServiceInput): Promise<VersionedOperatingCoreService> {
      const now = new Date().toISOString()
      const created: VersionedOperatingCoreService = {
        id: randomUUID(),
        campusId: input.campusId,
        kind: input.kind,
        label: input.label,
        weekday: input.weekday,
        startTime: input.startTime,
        estado: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      services.push(created)
      return created
    },

    async update(id, expectedVersion, patch: UpdateServicePatch) {
      const current = requireService(id)
      if (expectedVersion !== current.version) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion, currentVersion: current.version },
        )
      }

      const updated: VersionedOperatingCoreService = {
        ...current,
        label: patch.label ?? current.label,
        startTime: patch.startTime ?? current.startTime,
        estado: patch.estado ?? current.estado,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }

      const index = services.findIndex((s) => s.id === id)
      services[index] = updated
      return updated
    },

    async cancel(id, _motivo, _actorUserId) {
      const current = requireService(id)
      const updated: VersionedOperatingCoreService = {
        ...current,
        estado: 'removed',
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      }
      const index = services.findIndex((s) => s.id === id)
      services[index] = updated
    },
  }
}
