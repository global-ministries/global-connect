/**
 * W05 — DT-031 — Pastoral 1:1 Repository factory.
 *
 * Factory that creates a PastoralOneOnOneRepository.
 * useFake=true → in-memory fake (for tests and dev without Supabase).
 * useFake=false → Supabase adapter (for production with real DB).
 *
 * Mirrors the pattern of createOperatingCoreEventsRepository (F3 factory.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PastoralOneOnOneRepository } from './repository'
import {
  createInMemoryPastoralOneOnOneRepository,
} from './repository-fake'
import { createSupabasePastoralOneOnOneRepository } from './repository-supabase'

export interface PastoralOneOnOneRepositoryOptionsFake {
  readonly useFake: true
}

export interface PastoralOneOnOneRepositoryOptionsSupabase {
  readonly useFake: false
  readonly client: SupabaseClient
}

/**
 * Creates a PastoralOneOnOneRepository.
 *
 * useFake=true: returns in-memory fake (for unit tests, CI).
 * useFake=false: returns Supabase adapter (requires client).
 */
export function createPastoralOneOnOneRepository(
  options: PastoralOneOnOneRepositoryOptionsFake | PastoralOneOnOneRepositoryOptionsSupabase,
): PastoralOneOnOneRepository {
  if (options.useFake) {
    return createInMemoryPastoralOneOnOneRepository()
  }
  return createSupabasePastoralOneOnOneRepository(options.client)
}
