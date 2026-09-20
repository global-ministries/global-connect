/**
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — open global seasons
 * (talleres_temporadas, estado='abierto') for OpenEdicionForm's
 * "Temporada" picker.
 *
 * Extracted from the old app/(auth)/admin/talleres/abstracto/[slug]/page.tsx
 * (PR46) into lib/platform/talleres/ so the new /talleres/[taller] page can
 * mock this loader like every other one in this module family, instead of
 * hand-rolling a chainable Supabase mock for one inline query in its own
 * page test. Behavior is unchanged from the original inline query: RLS on
 * talleres_temporadas (metrics.read OR director.read OR admin.manage)
 * still decides what comes back — a caller without read on seasons simply
 * gets [] and the form falls back to "— Sin temporada —" (graceful
 * degradation, not a new capability check here).
 */

export interface TemporadaOption {
  readonly id: string
  readonly nombre: string
}

interface TemporadasQueryClient {
  from(table: 'talleres_temporadas'): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts?: { ascending?: boolean }): {
          limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

export async function loadTemporadasAbiertas(
  client: TemporadasQueryClient,
): Promise<readonly TemporadaOption[]> {
  const { data, error } = await client
    .from('talleres_temporadas')
    .select('id, nombre')
    .eq('estado', 'abierto')
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  return data as TemporadaOption[]
}
