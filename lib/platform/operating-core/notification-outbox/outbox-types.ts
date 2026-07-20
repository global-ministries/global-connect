/**
 * S17 — Domain types for Operating Core notification outbox.
 *
 * These are the domain-level types used by the outbox state machine,
 * repository interface, and drain dispatcher. They are independent of
 * the SQL row representation (see sql-row.ts for that).
 */

import type { OperatingCoreNotificationOutboxRow } from './sql-row'

// ---------------------------------------------------------------------------
// Kind — mirrors the 11-kind participation union from kinds.ts
// NO 'one_on_one_logged' — that kind is rejected at the domain boundary.
// ---------------------------------------------------------------------------

export type OperatingCoreNotificationKind =
  | 'visitor_capture'
  | 'registration'
  | 'cancellation'
  | 'check_in'
  | 'check_out'
  | 'attendance'
  | 'attendance_update'
  | 'service_assignment'
  | 'requirement_update'
  | 'transition'
  | 'document_received'

export type OperatingCoreNotificationTargetKind = 'email' | 'webhook'

// ---------------------------------------------------------------------------
// Status — mirrors SQL enum
// ---------------------------------------------------------------------------

export type OperatingCoreNotificationOutboxStatus = 'pending' | 'processing' | 'dispatched' | 'failed'

// ---------------------------------------------------------------------------
// Entry — the domain representation of one outbox row
// ---------------------------------------------------------------------------

export interface OperatingCoreNotificationOutboxEntry {
  readonly id: string
  readonly kind: OperatingCoreNotificationKind
  readonly subjectId: string | null
  /** Non-PII payload — the app layer validates no PII keys. */
  readonly payload: Readonly<Record<string, unknown>>
  readonly targetKind: OperatingCoreNotificationTargetKind
  readonly targetAddress: string
  readonly availableAt: string
  readonly attemptCount: number
  readonly maxAttempts: number
  readonly status: OperatingCoreNotificationOutboxStatus
  readonly lockedAt: string | null
  readonly lockedBy: string | null
  readonly lastError: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly dispatchedAt: string | null
}

// ---------------------------------------------------------------------------
// Drain result — aggregate outcome of a single drain invocation
// ---------------------------------------------------------------------------

export interface DrainResult {
  readonly claimed: readonly OperatingCoreNotificationOutboxEntry[]
  readonly dispatched: number
  readonly failed: number
  readonly requeued: number
}

// ---------------------------------------------------------------------------
// Map SQL row → domain entry
// ---------------------------------------------------------------------------

/**
 * Converts a raw SQL row to a domain entry.
 * Performs no validation — caller guarantees the row is well-formed.
 */
export function mapSqlRowToDomain(
  row: OperatingCoreNotificationOutboxRow,
): OperatingCoreNotificationOutboxEntry {
  return Object.freeze({
    id: row.id,
    kind: row.kind as OperatingCoreNotificationKind,
    subjectId: row.subject_id,
    payload: row.payload,
    targetKind: row.target_kind as OperatingCoreNotificationTargetKind,
    targetAddress: row.target_address,
    availableAt: row.available_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    status: row.status as OperatingCoreNotificationOutboxStatus,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dispatchedAt: row.dispatched_at,
  })
}
