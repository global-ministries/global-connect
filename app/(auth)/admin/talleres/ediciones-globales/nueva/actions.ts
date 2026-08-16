'use server'

/**
 * PR29-D — Server action: createEdicionGlobalSubmit.
 *
 * Wraps the public.create_edicion_global() RPC added in PR29-C. The
 * RPC inserts a row in `public.taller_ediciones_globales` (state
 * `borrador`) and optionally associates initial talleres via the
 * junction table.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 *                  `talleres_crecimiento.admin.manage` (RPC re-checks
 *                  via auth_has_talleres_capability).
 *
 * After a successful creation the action redirects to the detail page
 * for the new global.
 *
 * Defense-in-depth validations mirror PR29-C's SQL CHECK constraints
 * so the action's contract is observable from the client form without
 * round-tripping to the DB.
 */

import { redirect } from 'next/navigation'

import { requireEdicionesGlobalesRole } from '@/lib/platform/talleres/ediciones-globales'

export interface CreateEdicionGlobalInput {
  readonly nombre: string
  readonly slug: string
  readonly descripcion: string | null
  /** ISO 8601 (toISOString) — required. */
  readonly fecha_apertura: string
  /** ISO 8601 (toISOString) — required, must be > fecha_apertura. */
  readonly fecha_cierre: string
  readonly taller_ids: ReadonlyArray<string>
}

export type CreateEdicionGlobalResult =
  | { readonly ok: true; readonly edicionGlobalId: string; readonly slug: string }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
    }

const SLUG_REGEX = /^[a-z0-9-]+$/
const RESERVED_SLUGS: ReadonlySet<string> = new Set(['__legacy__', 'legacy-pre-pr29'])

export async function createEdicionGlobalSubmit(
  input: CreateEdicionGlobalInput,
): Promise<CreateEdicionGlobalResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  // ─── Defense-in-depth validations (RPC re-validates) ──────────────────
  if (!input.nombre?.trim() || input.nombre.trim().length < 2) {
    return { ok: false, error: 'invalid-input', message: 'nombre requerido (mínimo 2 caracteres)' }
  }
  if (input.nombre.trim().length > 120) {
    return { ok: false, error: 'invalid-input', message: 'nombre demasiado largo (máx 120)' }
  }
  if (!SLUG_REGEX.test(input.slug) || input.slug.length < 2 || input.slug.length > 80) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'slug debe ser minúsculas, números o guiones (2-80 chars)',
    }
  }
  if (RESERVED_SLUGS.has(input.slug)) {
    return {
      ok: false,
      error: 'invalid-input',
      message: `slug reservado (no se permite "${input.slug}")`,
    }
  }
  if (input.descripcion && input.descripcion.length > 1000) {
    return { ok: false, error: 'invalid-input', message: 'descripción demasiado larga (máx 1000)' }
  }
  if (!input.fecha_apertura || !input.fecha_cierre) {
    return { ok: false, error: 'invalid-input', message: 'fecha_apertura y fecha_cierre requeridas' }
  }
  // Compare via Date — both inputs are ISO so lexicographic compare is
  // safe but we use Date.parse for clarity.
  if (Date.parse(input.fecha_cierre) <= Date.parse(input.fecha_apertura)) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'fecha_cierre debe ser posterior a fecha_apertura',
    }
  }
  // UUID shape check (loose — empty arrays are OK, this is just a
  // safety net so we don't pass garbage to the RPC).
  for (const id of input.taller_ids) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return { ok: false, error: 'invalid-input', message: 'taller_id inválido' }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('create_edicion_global', {
    p_nombre: input.nombre.trim(),
    p_slug: input.slug.trim(),
    p_descripcion: input.descripcion?.trim() ?? '',
    p_fecha_apertura: input.fecha_apertura,
    p_fecha_cierre: input.fecha_cierre,
    p_taller_ids: input.taller_ids,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  const result = data as { id: string; slug: string; estado: string }
  return { ok: true, edicionGlobalId: result.id, slug: result.slug }
}

/**
 * Server-side redirect after a successful create. Lives in the same
 * file as `createEdicionGlobalSubmit` because the action's caller
 * (the client form) imports the redirect target together with the
 * submit handler — keeps the public surface tight.
 */
export async function redirectToEdicionGlobalDetail(edicionGlobalId: string): Promise<never> {
  redirect(`/admin/talleres/ediciones-globales/${edicionGlobalId}`)
}