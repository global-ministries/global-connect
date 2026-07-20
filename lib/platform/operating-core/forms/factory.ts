/**
 * S15 — FormsRepository factory.
 * Mirrors S05's repositories/factory.ts pattern.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FormsRepository } from './form-repository'
import { createFormsRepositoryFake } from './form-repository-fake'
import { createSupabaseFormsRepository } from './form-repository-supabase'

export interface OperatingCoreFormsRepositoryOptions {
  useFake?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed type for future-apply migration tables
  supabase?: SupabaseClient<any, any>
}

/**
 * Returns the appropriate FormsRepository implementation based on options.
 * - useFake=true or no supabase client → in-memory fake (for tests)
 * - supabase client provided → Supabase adapter
 */
export function createOperatingCoreFormsRepository(
  options: OperatingCoreFormsRepositoryOptions = {},
): FormsRepository {
  if (options.useFake || !options.supabase) {
    return createFormsRepositoryFake()
  }
  return createSupabaseFormsRepository({ supabase: options.supabase })
}
