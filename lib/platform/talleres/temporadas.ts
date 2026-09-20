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

// ─── T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas
// list + detail loaders ──────────────────────────────────────────────────
//
// Extracted (same queries, unchanged behavior) from the old
// app/(auth)/admin/talleres/temporadas/page.tsx and its [id]/page.tsx, so
// the new consolidated screens can mock these like every other loader in
// this family instead of hand-rolling a chainable client per page test.
// RLS on talleres_temporadas (metrics.read | director.read | admin.manage
// for SELECT) still decides what comes back — a caller without read simply
// sees an empty list, same as the old screens.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

export interface TemporadaRow {
  readonly id: string
  readonly nombre: string
  readonly slug: string
  readonly estado: 'borrador' | 'abierto' | 'cerrado' | 'cancelado'
  readonly fecha_apertura: string
  readonly fecha_cierre: string
}

export async function loadTemporadas(client: AnyClient): Promise<readonly TemporadaRow[]> {
  const { data, error } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, estado, fecha_apertura, fecha_cierre')
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  if (error || !data) return []
  return data as TemporadaRow[]
}

export interface TemporadaDetalleRow extends TemporadaRow {
  readonly descripcion: string | null
}

export interface TallerOption {
  readonly id: string
  readonly nombre: string
  readonly slug: string
}

export interface TemporadaDetalle {
  readonly temporada: TemporadaDetalleRow
  readonly talleres: readonly TallerOption[]
  readonly selectedTallerIds: readonly string[]
}

/**
 * Loads one temporada plus its control-surface data: every active taller
 * (toggle candidates) and the current talleres_temporada_talleres
 * membership. Returns `null` when the temporada does not exist or the
 * query errors — the caller (the [id] page) turns that into `notFound()`,
 * exactly like the old page did.
 */
export async function loadTemporadaDetalle(
  client: AnyClient,
  id: string,
): Promise<TemporadaDetalle | null> {
  const { data: temporadaData, error: temporadaError } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, descripcion, estado, fecha_apertura, fecha_cierre')
    .eq('id', id)
    .maybeSingle()

  if (temporadaError || !temporadaData) return null

  const [{ data: talleresData }, { data: junctionData }] = await Promise.all([
    client
      .from('talleres')
      .select('id, nombre, slug')
      .eq('estado', 'active')
      .order('nombre', { ascending: true })
      .limit(200),
    client
      .from('talleres_temporada_talleres')
      .select('taller_id')
      .eq('temporada_id', id),
  ])

  const talleres = (talleresData ?? []) as TallerOption[]
  const selectedTallerIds = ((junctionData ?? []) as { taller_id: string }[]).map((r) => r.taller_id)

  return {
    temporada: temporadaData as TemporadaDetalleRow,
    talleres,
    selectedTallerIds,
  }
}
