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
 * One action is exposed:
 *   - openExistingEdicionAction(edicionId): flips borrador → abierto.
 *
 * It performs a guarded UPDATE on `taller_ediciones` with a state
 * predicate in the WHERE clause (defense-in-depth against stale UI).
 * Capability gate mirrors the OpenEdicionForm gate: director.write OR
 * admin.manage.
 *
 * We deliberately do NOT reuse the `open_edicion` SECURITY DEFINER
 * RPC for this transition — that RPC CREATES a new edicion with
 * all the period dates / firmantes / tipo, none of which apply when
 * we already have an edicion row that just needs its state column
 * flipped. A bare UPDATE against taller_ediciones avoids the
 * periodo backfill path and the taller_periodos_generales trigger
 * (no INSERT into the legacy table is involved).
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * closeExistingEdicionAction (abierto|en_curso → cerrado) is REMOVED:
 * `cerrado` (and `en_curso`) are now derived from the edición's own dates
 * (talleres_estado_efectivo), never a manual transition someone has to
 * remember to press. See this file's bottom for the removal note, and
 * components/talleres/open-edicion-button.tsx's CancelarEdicionButton
 * (a NEW action, cancelarEdicion, in app/(auth)/talleres/[taller]/
 * [edicion]/actions.ts) for its replacement — borrador|abierto → cancelado.
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
 * Revalidate every screen that shows this edicion's estado badge:
 * the old admin detail page (lives until T10 retires it) and the
 * new consolidated /talleres/[taller]/[edicion] page. The new path
 * needs the taller's slug, which the UPDATE's `taller_id` lets us
 * resolve with one extra read.
 */
async function revalidateEdicionScreens(
  client: unknown,
  edicionId: string,
  tallerId: string,
): Promise<void> {
  revalidatePath(`/admin/talleres/edicion/${edicionId}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: taller } = await (client as any)
    .from('talleres')
    .select('slug')
    .eq('id', tallerId)
    .maybeSingle()

  if (taller?.slug) {
    revalidatePath(`/talleres/${taller.slug}/${edicionId}`)
  }
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

  await revalidateEdicionScreens(auth.supabase, edicionId, data.taller_id)

  return {
    ok: true,
    // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
    // edición's estado is now derived from its own dates
    // (talleres_estado_efectivo), not a manual switch someone flips again
    // later: this only ever moves borrador -> abierto; from there, en_curso
    // and cerrado follow automatically.
    message: 'Edición abierta. Su estado ahora se calcula a partir de las fechas de la edición.',
  }
}

// closeExistingEdicionAction (abierto|en_curso -> cerrado) was removed in
// T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6): `cerrado` is
// now derived from the edición's own dates (talleres_estado_efectivo),
// never a manual transition. Its only caller, CloseEdicionButton
// (components/talleres/open-edicion-button.tsx), was removed alongside it
// — see that file's own header for CancelarEdicionButton, its replacement.
