'use server'

/**
 * PR C (Fase 5 GdV-parity) — Server actions for the global-season admin UI.
 *
 * These mirror the Grupos de Vida temporada flow: a Dirección user creates a
 * global season (`talleres_temporadas`), toggles WHICH talleres open enrollment
 * (`talleres_temporada_talleres` junction), and moves the season through its
 * estado machine (borrador → abierto → cerrado / cancelado).
 *
 * Unlike the openEdicion action (which wraps a SECURITY DEFINER RPC), these
 * write DIRECTLY under RLS via the anon/cookie-bound SSR client — the PR B
 * migration ships `talleres_temporadas_{insert,update,delete}` policies gated
 * on director.write OR admin.manage, so a plain insert/update/delete is
 * authorized exactly like a GdV temporada write. The capability check below is
 * defense-in-depth: it fails fast with a typed error before hitting RLS.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export type TemporadaActionResult =
  | { readonly ok: true; readonly temporadaId?: string }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
    }

type WriteGate =
  | { readonly ok: true; readonly supabase: unknown }
  | { readonly ok: false; readonly error: 'forbidden' | 'not-found' | 'unauthorized' }

/**
 * Kill switch → auth → capability gate, mirroring the openEdicion action.
 * Returns the SSR client on success so callers write under RLS.
 */
async function requireWriteGate(): Promise<WriteGate> {
  if (!isTalleresEnabled()) return { ok: false, error: 'not-found' }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return { ok: false, error: 'unauthorized' }

  const caps = session.capabilities.map((c) => c.key)
  const hasCap =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')
  if (!hasCap) return { ok: false, error: 'forbidden' }

  return { ok: true, supabase }
}

// ─── createTemporada ────────────────────────────────────────────────────────

export interface CreateTemporadaInput {
  readonly nombre: string
  readonly slug: string
  readonly descripcion: string | null
  readonly fecha_apertura: string // ISO
  readonly fecha_cierre: string // ISO
}

/**
 * Creates a global season in estado='borrador'. Validation mirrors the PR B
 * table CHECKs (nombre 2..120, slug `^[a-z0-9-]+$` 2..80, descripcion ≤1000,
 * fecha_cierre > fecha_apertura) so the UI fails fast before RLS/CHECK. The
 * reserved slug `legacy` (backfill parent) is rejected here.
 */
export async function createTemporada(
  input: CreateTemporadaInput,
): Promise<TemporadaActionResult> {
  const gate = await requireWriteGate()
  if (!gate.ok) return gate

  const nombre = input.nombre?.trim() ?? ''
  if (nombre.length < 2 || nombre.length > 120) {
    return { ok: false, error: 'invalid-input', message: 'El nombre debe tener entre 2 y 120 caracteres.' }
  }

  const slug = input.slug?.trim() ?? ''
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2 || slug.length > 80) {
    return { ok: false, error: 'invalid-input', message: 'El slug solo admite minúsculas, números y guiones (2 a 80 caracteres).' }
  }
  if (slug === 'legacy') {
    return { ok: false, error: 'invalid-input', message: 'El slug "legacy" está reservado.' }
  }

  const descripcion = input.descripcion?.trim() ? input.descripcion.trim() : null
  if (descripcion && descripcion.length > 1000) {
    return { ok: false, error: 'invalid-input', message: 'La descripción no puede superar 1000 caracteres.' }
  }

  if (!input.fecha_apertura || !input.fecha_cierre) {
    return { ok: false, error: 'invalid-input', message: 'Las fechas de apertura y cierre son requeridas.' }
  }
  if (new Date(input.fecha_cierre) <= new Date(input.fecha_apertura)) {
    return { ok: false, error: 'invalid-input', message: 'La fecha de cierre debe ser posterior a la de apertura.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('talleres_temporadas')
    .insert({
      nombre,
      slug,
      descripcion,
      fecha_apertura: input.fecha_apertura,
      fecha_cierre: input.fecha_cierre,
      estado: 'borrador',
    })
    .select('id')
    .single()

  if (error) {
    if ((error.code as string) === '23505') {
      return { ok: false, error: 'invalid-input', message: 'Ya existe una temporada con ese slug.' }
    }
    return { ok: false, error: 'internal', message: (error.message as string) ?? 'unknown error' }
  }
  if (!data) return { ok: false, error: 'internal', message: 'No se pudo crear la temporada.' }

  revalidatePath('/admin/talleres/temporadas')
  return { ok: true, temporadaId: data.id as string }
}

// ─── toggleTallerInTemporada ─────────────────────────────────────────────────

export interface ToggleTallerInput {
  readonly temporadaId: string
  readonly tallerId: string
  readonly on: boolean
}

/**
 * The "elijo qué talleres abren" control surface: on=true links a taller to the
 * season (INSERT junction, tolerating a 23505 if already linked so the toggle
 * is idempotent); on=false unlinks it (DELETE by both ids).
 */
export async function toggleTallerInTemporada(
  input: ToggleTallerInput,
): Promise<TemporadaActionResult> {
  const gate = await requireWriteGate()
  if (!gate.ok) return gate

  if (!input.temporadaId || !input.tallerId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId y tallerId son requeridos.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  if (input.on) {
    const { error } = await client
      .from('talleres_temporada_talleres')
      .insert({ temporada_id: input.temporadaId, taller_id: input.tallerId })
    // 23505 = already linked → idempotent success.
    if (error && (error.code as string) !== '23505') {
      return { ok: false, error: 'internal', message: (error.message as string) ?? 'unknown error' }
    }
  } else {
    const { error } = await client
      .from('talleres_temporada_talleres')
      .delete()
      .eq('temporada_id', input.temporadaId)
      .eq('taller_id', input.tallerId)
    if (error) {
      return { ok: false, error: 'internal', message: (error.message as string) ?? 'unknown error' }
    }
  }

  revalidatePath(`/admin/talleres/temporadas/${input.temporadaId}`)
  return { ok: true }
}

// ─── transitionTemporada ─────────────────────────────────────────────────────

/**
 * Allowed source states for each target estado. A guarded UPDATE filters on
 * these so an illegal transition matches zero rows (→ invalid-input) rather
 * than silently clobbering the estado.
 */
const ALLOWED_FROM: Record<'abierto' | 'cerrado' | 'cancelado', readonly string[]> = {
  abierto: ['borrador'],
  cerrado: ['abierto'],
  cancelado: ['borrador', 'abierto'],
}

export interface TransitionTemporadaInput {
  readonly temporadaId: string
  readonly next: 'abierto' | 'cerrado' | 'cancelado'
}

export async function transitionTemporada(
  input: TransitionTemporadaInput,
): Promise<TemporadaActionResult> {
  const gate = await requireWriteGate()
  if (!gate.ok) return gate

  if (!input.temporadaId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId es requerido.' }
  }
  const allowed = ALLOWED_FROM[input.next]
  if (!allowed) {
    return { ok: false, error: 'invalid-input', message: 'Transición no permitida.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('talleres_temporadas')
    .update({ estado: input.next })
    .eq('id', input.temporadaId)
    .in('estado', allowed)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'internal', message: (error.message as string) ?? 'unknown error' }
  }
  if (!data) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'Transición no permitida desde el estado actual.',
    }
  }

  revalidatePath(`/admin/talleres/temporadas/${input.temporadaId}`)
  revalidatePath('/admin/talleres/temporadas')
  return { ok: true, temporadaId: input.temporadaId }
}
