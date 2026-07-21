/**
 * S17 (extended S19) — Hand-written SQL row types for operating_core_notification_outbox.
 *
 * DO NOT regenerate database.types.ts. These types mirror the SQL columns
 * exactly and are the authoritative mapping layer between the database and
 * the domain layer.
 *
 * S19 adds: next_retry_at, sent_at
 *
 * Columns map as follows (snake_case SQL → camelCase domain convention):
 *   id                → id
 *   kind              → kind
 *   subject_id        → subjectId
 *   payload           → payload
 *   target_kind       → targetKind
 *   target_address    → targetAddress
 *   available_at      → availableAt
 *   attempt_count     → attemptCount
 *   max_attempts      → maxAttempts
 *   status            → status
 *   locked_at         → lockedAt
 *   locked_by         → lockedBy
 *   last_error        → lastError
 *   created_at        → createdAt
 *   updated_at        → updatedAt
 *   dispatched_at     → dispatchedAt
 *   next_retry_at     → nextRetryAt    (S19)
 *   sent_at           → sentAt         (S19)
 */

export type OperatingCoreNotificationOutboxStatusSql =
  | 'pending'
  | 'processing'
  | 'dispatched'
  | 'failed'

export interface OperatingCoreNotificationOutboxRow {
  readonly id: string
  readonly kind: string
  readonly subject_id: string | null
  readonly payload: Readonly<Record<string, unknown>>
  readonly target_kind: string
  readonly target_address: string
  readonly available_at: string
  readonly attempt_count: number
  readonly max_attempts: number
  readonly status: OperatingCoreNotificationOutboxStatusSql
  readonly locked_at: string | null
  readonly locked_by: string | null
  readonly last_error: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly dispatched_at: string | null
  // S19 — retry + sent state
  readonly next_retry_at: string | null
  readonly sent_at: string | null
}
