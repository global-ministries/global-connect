/**
 * Services repository — interface and input/output types.
 * Mirrors dream-team/repository.ts pattern.
 * Version field added for optimistic concurrency (not in base S02 types).
 */
import type {
  OperatingCoreService,
  OperatingCoreServiceEstado,
} from '@/lib/platform/operating-core/types'

// ---------------------------------------------------------------------------
// Input/Output types (extend base types with version for concurrency)
// ---------------------------------------------------------------------------

/** Versioned service — includes version for optimistic locking. */
export interface VersionedOperatingCoreService extends OperatingCoreService {
  readonly version: number
}

/** Input for creating a new service. */
export interface CreateServiceInput {
  readonly campusId: string
  readonly kind: 'service' | 'group_meeting' | 'workshop' | 'activity' | 'custom'
  readonly label: string
  /** 0=Sunday, 1=Monday, … 6=Saturday */
  readonly weekday: number
  /** HH:mm format */
  readonly startTime: string
}

/** Patch for updating a service (partial update). */
export interface UpdateServicePatch {
  readonly label?: string
  /** HH:mm format */
  readonly startTime?: string
  readonly estado?: OperatingCoreServiceEstado
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ServicesRepository {
  /**
   * Find a service by its unique id.
   * Returns null if not found.
   */
  findById(id: string): Promise<VersionedOperatingCoreService | null>

  /**
   * List services with optional filters.
   */
  list(filter?: {
    readonly experiencia?: string
    readonly estado?: OperatingCoreServiceEstado
  }): Promise<readonly VersionedOperatingCoreService[]>

  /**
   * Create a new service.
   * Auto-generates id, sets version to 1, sets estado to 'active'.
   */
  create(input: CreateServiceInput): Promise<VersionedOperatingCoreService>

  /**
   * Update a service with optimistic locking.
   * @throws OperatingCoreConcurrencyConflictError if expectedVersion does not match current version
   */
  update(
    id: string,
    expectedVersion: number,
    patch: UpdateServicePatch,
  ): Promise<VersionedOperatingCoreService>

  /**
   * Cancel (soft-delete) a service.
   * Transitions estado to 'removed' with a motivo.
   */
  cancel(id: string, motivo: string, actorUserId: string): Promise<void>
}
