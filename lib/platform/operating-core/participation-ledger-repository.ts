/**
 * Participation Ledger — repository interface
 * S07 —mirrors dream-team/repository.ts pattern
 */
import type { OperatingCoreParticipationKind } from './kinds'
import { OPERATING_CORE_PARTICIPATION_KINDS } from './kinds'

// ─── Input types ──────────────────────────────────────────────────────────────

export interface AppendParticipationEventInput {
  readonly kind: OperatingCoreParticipationKind
  readonly subjectId: string
  readonly occurredAt?: string  // ISO; defaults to now()
  readonly actorPersonaId: string
  readonly captureSource: 'form' | 'manual' | 'bulk' | 'system' | string
  readonly experience: string
  readonly eventId?: string | null
  readonly serviceId?: string | null
  readonly eventInstanceId?: string | null
  readonly correctsEventId?: string | null
  readonly metadata?: Record<string, unknown>  // MUST NOT contain PII keys
}

export interface ListParticipationEventsFilter {
  readonly subjectId?: string
  readonly kind?: OperatingCoreParticipationKind | readonly OperatingCoreParticipationKind[]
  readonly eventId?: string
  readonly serviceId?: string
  readonly eventInstanceId?: string
  readonly actorPersonaId?: string
  readonly occurredFrom?: string  // ISO
  readonly occurredTo?: string    // ISO
  readonly status?: 'recorded' | 'corrected' | 'superseded' | 'rejected'
}

// ─── Output type (mirrors OperatingCoreParticipationEvent from types.ts) ───────

export interface ParticipationLedgerEvent {
  readonly id: string
  readonly kind: OperatingCoreParticipationKind
  readonly subjectId: string
  readonly occurredAt: string
  readonly actorPersonaId: string
  readonly captureSource: string
  readonly experience: string
  readonly eventId: string | null
  readonly serviceId: string | null
  readonly eventInstanceId: string | null
  readonly correctsEventId: string | null
  readonly status: 'recorded' | 'corrected' | 'superseded' | 'rejected'
  readonly metadata: Readonly<Record<string, unknown>>
  readonly createdAt: string
}

// ─── Repository interface ──────────────────────────────────────────────────────

export interface ParticipationLedgerRepository {
  /**
   * Append a new participation event. The row is always inserted (append-only).
   */
  append(input: AppendParticipationEventInput): Promise<ParticipationLedgerEvent>

  /**
   * List participation events for a subject, optionally filtered.
   */
  listBySubject(
    subjectId: string,
    filter?: Omit<ListParticipationEventsFilter, 'subjectId'>,
  ): Promise<readonly ParticipationLedgerEvent[]>

  /**
   * Find a single event by id.
   */
  findById(id: string): Promise<ParticipationLedgerEvent | null>

  /**
   * Correct an existing event by appending a new correction row.
   * The original row is NEVER modified.
   */
  correct(
    originalId: string,
    input: Omit<AppendParticipationEventInput, 'correctsEventId'>,
  ): Promise<ParticipationLedgerEvent>
}

// ─── Kind guard (S02 reused) ─────────────────────────────────────────────────

export { OPERATING_CORE_PARTICIPATION_KINDS }
