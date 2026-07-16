/**
 * Events repository — interface and input/output types.
 * Mirrors dream-team/repository.ts pattern.
 * Version field added for optimistic concurrency (not in base S02 types).
 */
import type {
  OperatingCoreEvent,
  OperatingCoreEventKind,
  OperatingCoreEventEstado,
  OperatingCoreRecurrenceRule,
} from '@/lib/platform/operating-core/types'

// ---------------------------------------------------------------------------
// Input/Output types
// ---------------------------------------------------------------------------

/** Versioned event — includes version for optimistic locking. */
export interface VersionedOperatingCoreEvent extends OperatingCoreEvent {
  readonly version: number
}

/** Input for creating a new event. */
export interface CreateEventInput {
  readonly serviceId: string | null
  readonly kind: OperatingCoreEventKind
  readonly title: string
  readonly startTime: string
  readonly visibilityScope: string
  readonly recurrenceRule: OperatingCoreRecurrenceRule | null
  readonly parentEventId: string | null
}

/** Patch for updating an event (partial update). */
export interface UpdateEventPatch {
  readonly title?: string
  readonly startTime?: string
  readonly visibilityScope?: string
  readonly estado?: OperatingCoreEventEstado
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface EventsRepository {
  /**
   * Find an event by its unique id.
   * Returns null if not found.
   */
  findById(id: string): Promise<VersionedOperatingCoreEvent | null>

  /**
   * List events with optional filters.
   */
  list(filter?: {
    readonly serviceId?: string
    readonly kind?: OperatingCoreEventKind
    readonly estado?: OperatingCoreEventEstado
  }): Promise<readonly VersionedOperatingCoreEvent[]>

  /**
   * Create a new event.
   * Auto-generates id, sets version to 1, sets estado to 'active'.
   */
  create(input: CreateEventInput): Promise<VersionedOperatingCoreEvent>

  /**
   * Update an event with optimistic locking.
   * @throws OperatingCoreConcurrencyConflictError if expectedVersion does not match current version
   */
  update(
    id: string,
    expectedVersion: number,
    patch: UpdateEventPatch,
  ): Promise<VersionedOperatingCoreEvent>

  /**
   * Cancel (soft-delete) an event.
   * Transitions estado to 'cancelled' with a motivo.
   */
  cancel(id: string, motivo: string, actorUserId: string): Promise<void>
}
