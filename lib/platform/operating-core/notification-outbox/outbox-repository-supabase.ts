/**
 * S17 — Supabase adapter for OutboxRepository (4th OC Supabase adapter).
 *
 * Calls the SQL RPCs:
 *   - claim_operating_core_notification_outbox_batch
 *   - mark_operating_core_notification_outbox_dispatched
 *   - mark_operating_core_notification_outbox_failed
 *
 * Pattern mirrors other OC Supabase adapters (S09, S12, S15).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OperatingCoreNotificationOutboxRow } from './sql-row'
import type { OperatingCoreNotificationOutboxEntry } from './outbox-types'
import type { OutboxRepository } from './outbox-repository'
import { mapSqlRowToDomain } from './outbox-types'

export interface OutboxRepositorySupabaseOptions {
  supabase: SupabaseClient
}

/**
 * Creates a Supabase-backed OutboxRepository.
 *
 * All mutating operations go through the SQL RPCs to maintain
 * atomicity and proper RLS enforcement.
 */
export function createSupabaseOutboxRepository(
  options: OutboxRepositorySupabaseOptions,
): OutboxRepository {
  const { supabase } = options

  return {
    async claim(
      batchSize: number,
      lockTimeoutMs: number,
    ): Promise<readonly OperatingCoreNotificationOutboxEntry[]> {
      const pLimit = Math.min(Math.max(Math.trunc(batchSize), 1), 50)
      const pLockTimeoutSec = Math.max(Math.trunc(lockTimeoutMs / 1000), 1)

      const { data, error } = await supabase.rpc(
        'claim_operating_core_notification_outbox_batch',
        {
          p_limit: pLimit,
          p_lock_timeout: `${pLockTimeoutSec} seconds`,
        },
      )

      if (error) {
        // Propagate as non-retryable failure
        throw new Error(
          `claim_operating_core_notification_outbox_batch failed: ${error.message}`,
        )
      }

      if (!data || data.length === 0) return []

      const rows = data as readonly OperatingCoreNotificationOutboxRow[]
      return rows.map(mapSqlRowToDomain)
    },

    async markDispatched(id: string): Promise<void> {
      const { error } = await supabase.rpc(
        'mark_operating_core_notification_outbox_dispatched',
        { p_id: id },
      )

      if (error) {
        throw new Error(
          `mark_operating_core_notification_outbox_dispatched failed: ${error.message}`,
        )
      }
    },

    async markFailed(
      id: string,
      lastError: string,
      nextAttemptAt: string,
    ): Promise<void> {
      const { error } = await supabase.rpc(
        'mark_operating_core_notification_outbox_failed',
        {
          p_id: id,
          p_last_error: lastError,
          p_next_attempt_at: nextAttemptAt,
        },
      )

      if (error) {
        throw new Error(
          `mark_operating_core_notification_outbox_failed failed: ${error.message}`,
        )
      }
    },
  }
}
