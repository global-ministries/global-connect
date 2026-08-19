'use server'

/**
 * PR42 + redesign — Shared server actions for the inscripciones
 * admin + coordination surfaces.
 *
 * Used by:
 *   - `/admin/talleres/inscripciones` (global admin surface)
 *   - `/talleres/coordinacion/inscripciones` (coord pendientes)
 *
 * Both pages share the same `<TablaInscripciones>` component, which
 * calls these actions via props (`onApprove`, `onReject`) so the
 * component itself doesn't import them — keeps the component free
 * of server-action wiring and lets each page decide if it wants to
 * wrap the actions with extra logging, telemetry, etc.
 *
 * Two actions are exposed:
 *   - approveInscripcionAction(inscripcionId): flip pendiente → aprobado.
 *   - rejectInscripcionAction(inscripcionId, motivo): flip pendiente
 *     → no_aprobado. The motivo is REQUIRED by the
 *     `trg_taller_inscripciones_couple_unit` trigger (otherwise
 *     the UPDATE is rejected with a CHECK violation).
 *
 * Capability gate mirrors the page-level gate and the RLS policy:
 *   talleres_crecimiento.director.write
 *   OR talleres_crecimiento.admin.manage
 *   OR talleres_crecimiento.coordinator.write
 *
 * The action's WHERE clause defensively checks the current `estado`
 * so a coordinator can never accidentally re-approve a row that's
 * already `aprobado` (no-op idempotent) or `no_aprobado` (rejected).
 * The trigger rejects motivo_no_aprobado with length 0 / whitespace.
 *
 * revalidation: the action revalidates BOTH pages that consume it
 * (`/admin/talleres/inscripciones` for the global admin surface
 * and `/talleres/coordinacion/inscripciones` for the coordination
 * pendientes surface). The coordinator's `/talleres/coordinacion`
 * index re-renders the pendientes counter on the next request
 * because that page reads the loader on every navigation.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export type InscripcionError =
  | 'talleres-disabled'
  | 'UNAUTHENTICATED'
  | 'NO_SESSION'
  | 'FORBIDDEN'
  | 'UPDATE_FAILED'
  | 'NOT_FOUND_OR_NOT_PENDIENTE'
  | 'INVALID_MOTIVO'

export interface InscripcionActionResult {
  readonly ok: boolean
  readonly error?: InscripcionError
  readonly message?: string
}

interface InscripcionGateOk {
  readonly ok: true
  readonly supabase: unknown
  readonly userId: string
}

interface InscripcionGateErr {
  readonly ok: false
  readonly error: InscripcionError
  readonly message?: string
}

type InscripcionGateResult = InscripcionGateOk | InscripcionGateErr

async function requireInscripcionWriteCap(
  inscripcionId: string,
): Promise<InscripcionGateResult> {
  if (!inscripcionId) {
    return { ok: false, error: 'NOT_FOUND_OR_NOT_PENDIENTE' }
  }
  if (!isTalleresEnabled()) {
    return { ok: false, error: 'talleres-disabled' }
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
      c.key === 'talleres_crecimiento.admin.manage' ||
      c.key === 'talleres_crecimiento.coordinator.write',
  )
  if (!hasCap) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, supabase, userId: user.id }
}

function revalidateInscripcionSurfaces(): void {
  revalidatePath('/admin/talleres/inscripciones')
  revalidatePath('/talleres/coordinacion/inscripciones')
  revalidatePath('/talleres/coordinacion')
}

/**
 * Approve a pendiente inscripcion. Transitions the row to
 * `estado='aprobado'`. The update is a no-op (returns
 * `NOT_FOUND_OR_NOT_PENDIENTE`) if the row doesn't exist or is
 * already in a non-pendiente state.
 */
export async function approveInscripcionAction(
  inscripcionId: string,
): Promise<InscripcionActionResult> {
  const auth = await requireInscripcionWriteCap(inscripcionId)
  if (!auth.ok) {
    return { ok: false, error: auth.error, message: auth.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = auth.supabase

  const { data, error } = await client
    .from('taller_inscripciones')
    .update({ estado: 'aprobado' })
    .eq('id', inscripcionId)
    .eq('estado', 'pendiente')
    .select('id')
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
      error: 'NOT_FOUND_OR_NOT_PENDIENTE',
      message:
        'La inscripci\u00f3n no existe o no est\u00e1 en estado pendiente. Refresc\u00e1 la p\u00e1gina.',
    }
  }

  revalidateInscripcionSurfaces()
  return { ok: true, message: 'Inscripci\u00f3n aprobada.' }
}

/**
 * Reject a pendiente inscripcion. Transitions the row to
 * `estado='no_aprobado'` and writes `motivo_no_aprobado` (REQUIRED by
 * the `trg_taller_inscripciones_couple_unit` BEFORE UPDATE trigger).
 *
 * The trigger rejects the UPDATE when motivo is NULL/empty/whitespace,
 * so the action validates the input client-side as well.
 */
export async function rejectInscripcionAction(
  inscripcionId: string,
  motivo: string,
): Promise<InscripcionActionResult> {
  const trimmedMotivo = (motivo ?? '').trim()
  if (!trimmedMotivo) {
    return {
      ok: false,
      error: 'INVALID_MOTIVO',
      message: 'El motivo de rechazo es obligatorio.',
    }
  }

  const auth = await requireInscripcionWriteCap(inscripcionId)
  if (!auth.ok) {
    return { ok: false, error: auth.error, message: auth.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = auth.supabase

  const { data, error } = await client
    .from('taller_inscripciones')
    .update({ estado: 'no_aprobado', motivo_no_aprobado: trimmedMotivo })
    .eq('id', inscripcionId)
    .eq('estado', 'pendiente')
    .select('id')
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
      error: 'NOT_FOUND_OR_NOT_PENDIENTE',
      message:
        'La inscripci\u00f3n no existe o no est\u00e1 en estado pendiente. Refresc\u00e1 la p\u00e1gina.',
    }
  }

  revalidateInscripcionSurfaces()
  return { ok: true, message: 'Inscripci\u00f3n rechazada.' }
}