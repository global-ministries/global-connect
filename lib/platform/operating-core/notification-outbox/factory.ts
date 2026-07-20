/**
 * S17 — OutboxRepository factory.
 *
 * Mirrors S05/S15 factory pattern:
 *   useFake=true  → in-memory fake (for unit tests)
 *   supabase      → Supabase adapter (production)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutboxRepository } from './outbox-repository'
import { createInMemoryOutboxRepository } from './outbox-repository-fake'
import { createSupabaseOutboxRepository } from './outbox-repository-supabase'

export interface OperatingCoreOutboxRepositoryOptions {
  /** Use in-memory fake instead of Supabase adapter */
  useFake?: boolean
  /** Supabase client (required for production adapter) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed type for future-apply migration tables
  supabase?: SupabaseClient<any, any>
}

/**
 * Returns the appropriate OutboxRepository implementation based on options.
 *
 * - `useFake=true` or no supabase client → in-memory fake (tests)
 * - supabase client provided → Supabase adapter (production)
 */
export function createOperatingCoreOutboxRepository(
  options: OperatingCoreOutboxRepositoryOptions = {},
): OutboxRepository {
  if (options.useFake || !options.supabase) {
    return createInMemoryOutboxRepository()
  }
  return createSupabaseOutboxRepository({ supabase: options.supabase })
}
