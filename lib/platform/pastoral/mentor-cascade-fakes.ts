/**
 * W10 — In-memory fakes for mentor cascade adapters.
 * Used in tests to avoid DB dependencies.
 * Follows the repository-fake pattern from W05/W07.
 */

import type {
  GdvMentorAdapter,
  GrupoCortoPlazoMentorAdapter,
  ServicioMentorAdapter,
} from './mentor-cascade/types'

export interface FakeGdvEntry {
  readonly miembroPersonaId: string
  readonly grupoId: string
  readonly liderPersonaId: string
}

export interface FakeTallerEntry {
  readonly miembroPersonaId: string
  readonly tallerEquipoId: string
  readonly liderPersonaId: string
}

export interface FakeServicioEntry {
  readonly miembroPersonaId: string
  readonly equipoId: string
  readonly coordinadorPersonaId: string
}

/**
 * Creates a fake GDV mentor adapter for testing.
 */
export function createFakeGdvMentorAdapter(
  entries: readonly FakeGdvEntry[] = [],
): GdvMentorAdapter {
  const map = new Map<string, string>()
  for (const entry of entries) {
    // P1: one person = one active GDV per season
    // If already set, don't overwrite (first entry wins)
    if (!map.has(entry.miembroPersonaId)) {
      map.set(entry.miembroPersonaId, entry.liderPersonaId)
    }
  }

  return {
    async resolveGdVActivoPorTemporada(personaId: string): Promise<string | null> {
      return map.get(personaId) ?? null
    },
  }
}

/**
 * Creates a fake taller mentor adapter for testing.
 */
export function createFakeGrupoCortoPlazoMentorAdapter(
  entries: readonly FakeTallerEntry[] = [],
): GrupoCortoPlazoMentorAdapter {
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (!map.has(entry.miembroPersonaId)) {
      map.set(entry.miembroPersonaId, entry.liderPersonaId)
    }
  }

  return {
    async resolverLiderDeTaller(personaId: string): Promise<string | null> {
      return map.get(personaId) ?? null
    },
  }
}

/**
 * Creates a fake servicio mentor adapter for testing.
 */
export function createFakeServicioMentorAdapter(
  entries: readonly FakeServicioEntry[] = [],
): ServicioMentorAdapter {
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (!map.has(entry.miembroPersonaId)) {
      map.set(entry.miembroPersonaId, entry.coordinadorPersonaId)
    }
  }

  return {
    async resolverCoordinadorDeServicio(personaId: string): Promise<string | null> {
      return map.get(personaId) ?? null
    },
  }
}
