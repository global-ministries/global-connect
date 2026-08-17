'use server'

/**
 * PR36 — Server actions for the /admin/talleres/edicion/[id] page.
 *
 * Bug fix #2: the edicion detail page (PR34) is read-only and the
 * admin had no UI path to flip an existing edicion from
 * `borrador` → `abierto` (or `abierto|en_curso` → `cerrado`). The
 * only mutation surface was the OpenEdicionForm, which CREATES a
 * new edicion — not the same operation as transitioning the state
 * of an existing one.
 *
 * Two actions are exposed:
 *   - openExistingEdicion(edicionId): flips borrador → abierto.
 *   - closeExistingEdicion(edicionId): flips abierto|en_curso →
 *     cerrado.
 *
 * Both actions perform a guarded UPDATE on `taller_ediciones` with
 * a state predicate in the WHERE clause (defense-in-depth against
 * stale UI). Capability gate mirrors the OpenEdicionForm gate:
 * director.write OR admin.manage.
 *
 * We deliberately do NOT reuse the `open_edicion` SECURITY DEFINER
 * RPC for these transitions — that RPC CREATES a new edicion with
 * all the period dates / firmantes / tipo, none of which apply when
 * we already have an edicion row that just needs its state column
 * flipped. A bare UPDATE against taller_ediciones avoids the
 * periodo backfill path and the taller_periodos_generales trigger
 * (no INSERT into the legacy table is involved).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

type TransitionError =
  | 'talleres-disabled'
  | 'UNAUTHENTICATED'
  | 'NO_SESSION'
  | 'FORBIDDEN'
  | 'UPDATE_FAILED'
  | 'NOT_FOUND_OR_NOT_BORRADOR'
  | 'NOT_FOUND_OR_NOT_ACTIVE'

export interface TransitionResult {
  readonly ok: boolean
  readonly error?: TransitionError
  readonly message?: string
}

interface AdminContext {
  readonly ok: true
  readonly supabase: unknown
  readonly userId: string
  readonly tallerSlug?: string
}

interface AdminError {
  readonly ok: false
  readonly error: TransitionError
  readonly message?: string
}

type AdminGateResult = AdminContext | AdminError

/**
 * Resolve the current admin/director context. All actions gate
 * here before mutating anything.
 *
 * Note: this helper intentionally mirrors the OpenEdicionForm
 * pattern (`lib/auth/platformSessionReadOnly.ts`) rather than
 * importing any helper from `lib/platform/talleres/capabilities.ts`:
 *   - `auth_has_talleres_capability` exists only as a SQL RPC,
 *     not as a TS import.
 *   - `hasTalleresCapability` works on a plain string array, which
 *     is exactly what `session.capabilities` provides.
 * We re-check the capability gate here so the action's behavior
 * is symmetric with the UI's gate.
 */
async function requireAdminOrDirector(
  edicionId: string,
): Promise<AdminGateResult> {
  if (!isTalleresEnabled()) {
    return { ok: false, error: 'talleres-disabled' }
  }

  if (!edicionId) {
    return { ok: false, error: 'NOT_FOUND_OR_NOT_BORRADOR' }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return { ok: false, error: 'UNAUTHENTICATED' }
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return { ok: false, error: 'NO_SESSION' }
  }

  const hasCap = session.capabilities.some(
    (c) =>
      c.key === 'talleres_crecimiento.director.write' ||
      c.key === 'talleres_crecimiento.admin.manage',
  )
  if (!hasCap) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, supabase, userId: user.id }
}

/**
 * Transition an existing edicion from `borrador` to `abierto`.
 *
 * WHERE clause includes the state predicate so we never accidentally
 * flip an edicion that's already `abierto` / `en_curso` / etc.
 */
export async function openExistingEdicionAction(
  edicionId: string,
): Promise<TransitionResult> {
  const auth = await requireAdminOrDirector(edicionId)
  if (!auth.ok) {
    return { ok: false, error: auth.error, message: auth.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = auth.supabase

  const { data, error } = await client
    .from('taller_ediciones')
    .update({ estado: 'abierto' })
    .eq('id', edicionId)
    .eq('estado', 'borrador')
    .select('id, taller_id, estado')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: 'UPDATE_FAILED',
      message: error.message ?? 'unknown',
    }
  }

  if (!data) {
    return {
      ok: false,
      error: 'NOT_FOUND_OR_NOT_BORRADOR',
      message:
        'La edición no existe o no está en estado borrador. Refrescá la página.',
    }
  }

  // Revalidate the edicion detail page so the badge/state refresh.
  // Also revalidate the taller abstract page so the directory view
  // reflects the new state (the abstract page lists editions).
  revalidatePath(`/admin/talleres/edicion/${edicionId}`)

  return {
    ok: true,
    message: 'Edición abierta. Inscripciones habilitadas.',
  }
}

/**
 * Transition an existing edicion from `abierto` | `en_curso` to
 * `cerrado`. Closing writes the fecha_cierre_real indirectly via
 * the pg_cron `talleres_period_closer` (PR11) — we only flip the
 * estado here.
 */
export async function closeExistingEdicionAction(
  edicionId: string,
): Promise<TransitionResult> {
  const auth = await requireAdminOrDirector(edicionId)
  if (!auth.ok) {
    return { ok: false, error: auth.error, message: auth.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = auth.supabase

  const { data, error } = await client
    .from('taller_ediciones')
    .update({ estado: 'cerrado' })
    .eq('id', edicionId)
    .in('estado', ['abierto', 'en_curso'])
    .select('id, taller_id, estado')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      error: 'UPDATE_FAILED',
      message: error.message ?? 'unknown',
    }
  }

  if (!data) {
    return {
      ok: false,
      error: 'NOT_FOUND_OR_NOT_ACTIVE',
      message:
        'La edición no existe o no está en estado abierto/en_curso. Refrescá la página.',
    }
  }

  revalidatePath(`/admin/talleres/edicion/${edicionId}`)

  return { ok: true, message: 'Edición cerrada.' }
}
