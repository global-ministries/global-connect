/**
 * Event-instances repository — interface and input/output types.
 * Mirrors dream-team/repository.ts pattern.
 * Version field added for optimistic concurrency (not in base S02 types).
 * Includes lazy RRULE-subset materialization.
 */
import type {
  OperatingCoreEventInstance,
  OperatingCoreEventEstado,
} from '@/lib/platform/operating-core/types'

// ---------------------------------------------------------------------------
// Input/Output types
// ---------------------------------------------------------------------------

/** Versioned event instance — includes version for optimistic locking. */
export interface VersionedOperatingCoreEventInstance
  extends OperatingCoreEventInstance {
  readonly version: number
}

/** Input for creating a new event instance. */
export interface CreateEventInstanceInput {
  readonly eventId: string
  /** ISO date string YYYY-MM-DD */
  readonly instanceDate: string
  readonly estado: OperatingCoreEventEstado
  /** Effective capacity at time of creation */
  readonly capacityOperativa: number
}

/** Patch for updating an event instance (partial update). */
export interface UpdateEventInstancePatch {
  readonly estado?: OperatingCoreEventEstado
  readonly capacityOperativa?: number
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface EventInstancesRepository {
  /**
   * Find an event instance by its unique id.
   * Returns null if not found.
   */
  findById(id: string): Promise<VersionedOperatingCoreEventInstance | null>

  /**
   * List all instances for an event, optionally filtered by date range.
   */
  listByEvent(
    eventId: string,
    range?: {
      /** ISO date string YYYY-MM-DD (inclusive) */
      from: string
      /** ISO date string YYYY-MM-DD (inclusive) */
      to: string
    },
  ): Promise<readonly VersionedOperatingCoreEventInstance[]>

  /**
   * Materialize event instances from a recurrence rule within a horizon.
   * Lazy: only generates instances up to horizonDays from the event start.
   * Idempotent: same inputs produce same outputs; no duplicates.
   * Per recurrent-events spec: Service edits affect FUTURE instances only.
   */
  materialize(
    eventId: string,
    horizonDays: number,
  ): Promise<readonly VersionedOperatingCoreEventInstance[]>

  /**
   * Create a new event instance.
   * Auto-generates id, sets version to 1.
   */
  create(
    input: CreateEventInstanceInput,
  ): Promise<VersionedOperatingCoreEventInstance>

  /**
   * Update an event instance with optimistic locking.
   * @throws OperatingCoreConcurrencyConflictError if expectedVersion does not match
   */
  update(
    id: string,
    expectedVersion: number,
    patch: UpdateEventInstancePatch,
  ): Promise<VersionedOperatingCoreEventInstance>

  /**
   * Cancel (soft-delete) an event instance.
   * Transitions estado to 'cancelled' with a motivo.
   */
  cancel(id: string, motivo: string, actorUserId: string): Promise<void>
}
