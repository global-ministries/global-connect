import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonaId } from './types'

type DbClient = SupabaseClient<Database, 'public'>

/**
 * Age ranges of Dream Team volunteers (D10 of
 * odd/tasks/ninos-voluntarios-waumba.md): under 12, 12–17, 18–25, 26 or older,
 * and no birth date. Servidores and Mi equipo show them as count pills over
 * the selected sub-area and filter the list by them.
 *
 * The range is computed in the database by `dream_team_rangos_edad`
 * (supabase/migrations/20261026100000_dream_team_metricas_edad.sql), which
 * answers only for people the caller already reaches by tree and never returns
 * the birth date. A person missing from its answer has no known range: they
 * are not counted and never match an age filter.
 */
export const RANGOS_EDAD = ['menor_12', '12_17', '18_25', '26_mas', 'sin_fecha'] as const

export type RangoEdad = (typeof RANGOS_EDAD)[number]

export const RANGO_EDAD_LABELS: Readonly<Record<RangoEdad, string>> = {
  menor_12: 'Menos de 12',
  '12_17': '12–17',
  '18_25': '18–25',
  '26_mas': '26+',
  sin_fecha: 'Sin fecha',
}

export type ContadoresEdad = Readonly<Record<RangoEdad, number>>

export function esRangoEdad(valor: unknown): valor is RangoEdad {
  return typeof valor === 'string' && (RANGOS_EDAD as readonly string[]).includes(valor)
}

/** Distinct people per range; a person in two equipos of the selection counts once. */
export function contarPorRangoEdad(
  filas: readonly { readonly personaId: string; readonly rangoEdad?: RangoEdad }[],
): ContadoresEdad {
  const personas = Object.fromEntries(RANGOS_EDAD.map((rango) => [rango, new Set<string>()])) as Record<RangoEdad, Set<string>>
  for (const fila of filas) {
    if (fila.rangoEdad) personas[fila.rangoEdad].add(fila.personaId)
  }
  return Object.fromEntries(RANGOS_EDAD.map((rango) => [rango, personas[rango].size])) as Record<RangoEdad, number>
}

interface RangoRow {
  readonly id: string
  readonly rango: string
}

/**
 * Bulk-resolves the age range of a set of `personaId`s in one round trip.
 * Ids the RPC does not return are left out of the map: "not visible to you".
 */
export async function fetchRangosEdad(
  client: DbClient,
  personaIds: readonly PersonaId[],
): Promise<ReadonlyMap<PersonaId, RangoEdad>> {
  const idsUnicos = [...new Set(personaIds)]
  if (idsUnicos.length === 0) return new Map()

  // The RPC is not in the generated database types yet, so the call is
  // untyped — the same pattern as dream_team_resolver_nombres in personas.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('dream_team_rangos_edad', {
    p_persona_ids: idsUnicos,
  })
  if (error) throw error

  const rangos = new Map<PersonaId, RangoEdad>()
  for (const row of (data ?? []) as readonly RangoRow[]) {
    if (esRangoEdad(row.rango)) rangos.set(row.id as PersonaId, row.rango)
  }
  return rangos
}
