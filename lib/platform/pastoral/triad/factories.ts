/**
 * W08 — DT-FACTORY — Pastoral Triada Repository factory.
 *
 * Factory that creates a PastoralTriadaRepository.
 * useFake=true → in-memory fake (for tests and dev without Supabase).
 * useFake=false → Supabase adapter (for production with real DB).
 *
 * Mirrors the pattern of createPastoralOneOnOneRepository (W05).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PastoralTriadaRepository } from './repository'
import { createInMemoryPastoralTriadaRepository } from './repository-fake'
import { createSupabasePastoralTriadaRepository } from './repository-supabase'

export interface PastoralTriadaRepositoryOptionsFake {
  readonly useFake: true
}

export interface PastoralTriadaRepositoryOptionsSupabase {
  readonly useFake: false
  readonly client: SupabaseClient
}

/**
 * Creates a PastoralTriadaRepository.
 *
 * useFake=true: returns in-memory fake (for unit tests, CI).
 * useFake=false: returns Supabase adapter (requires client).
 */
export function createPastoralTriadaRepository(
  options: PastoralTriadaRepositoryOptionsFake | PastoralTriadaRepositoryOptionsSupabase,
): PastoralTriadaRepository {
  if (options.useFake) {
    return createInMemoryPastoralTriadaRepository()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabasePastoralTriadaRepository(options.client as any)
}
