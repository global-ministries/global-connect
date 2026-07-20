/**
 * S17 — OutboxRepository interface.
 *
 * Abstracts the data access layer for the notification outbox.
 * Implementations: in-memory fake (tests) and Supabase adapter (production).
 */

import type { OperatingCoreNotificationOutboxEntry } from './outbox-types'

export interface OutboxRepository {
  /**
   * Atomically claim a batch of entries for processing.
   *
   * Uses FOR UPDATE SKIP LOCKED under the hood to prevent double-claim
   * when multiple drain instances run concurrently (Vercel Cron).
   *
   * @param batchSize — maximum number of entries to claim (1-50)
   * @param lockTimeoutMs — stale lock recovery threshold in milliseconds
   * @returns the claimed entries (empty array if none available)
   */
  claim(
    batchSize: number,
    lockTimeoutMs: number,
  ): Promise<readonly OperatingCoreNotificationOutboxEntry[]>

  /**
   * Mark an entry as successfully dispatched.
   * Called after the delivery provider accepts the notification.
   *
   * @param id — the entry id
   */
  markDispatched(id: string): Promise<void>

  /**
   * Mark an entry as failed with a error message and next retry time.
   *
   * If the entry has exhausted its max_attempts, the status transitions
   * to 'failed'. Otherwise it transitions back to 'pending' and
   * available_at is set to the next retry time.
   *
   * @param id — the entry id
   * @param lastError — error message describing the failure
   * @param nextAttemptAt — ISO timestamp for the next attempt
   */
  markFailed(
    id: string,
    lastError: string,
    nextAttemptAt: string,
  ): Promise<void>
}
