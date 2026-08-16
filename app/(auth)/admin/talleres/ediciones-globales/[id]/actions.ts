'use server'

/**
 * PR29-D — Server actions for the edicion global detail page.
 *
 * Wraps the 5 transition RPCs added in PR29-C (open/close/cancel +
 * add/remove participant). All actions share the same capability
 * gate (`talleres_crecimiento.director.write` OR
 * `talleres_crecimiento.admin.manage`) — see
 * `requireEdicionesGlobalesRole` in
 * `lib/platform/talleres/ediciones-globales.ts`.
 *
 * Each action returns a discriminated union so the client forms can
 * render the result inline (no global toast system needed). The
 * companion client components (open-edicion-form.tsx,
 * close-edicion-form.tsx, cancel-edicion-form.tsx) refresh the route
 * on success to pick up the new state from the DB.
 */

import { revalidatePath } from 'next/cache'

import { requireEdicionesGlobalesRole } from '@/lib/platform/talleres/ediciones-globales'

// ─── Generic result shape ────────────────────────────────────────────────

type ActionError = 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
export type EdicionGlobalActionResult<T = Record<string, unknown>> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: ActionError
      readonly message?: string
    }

// ─── open ────────────────────────────────────────────────────────────────

export interface OpenEdicionGlobalInput {
  readonly edicion_global_id: string
}

export async function openEdicionGlobalAction(
  input: OpenEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id) {
    return { ok: false, error: 'invalid-input', message: 'edicion_global_id requerido' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('open_edicion_global', {
    p_id: input.edicion_global_id,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  revalidatePath('/admin/talleres/ediciones-globales')
  return { ok: true, data: data as Record<string, unknown> }
}

// ─── close ───────────────────────────────────────────────────────────────

export interface CloseEdicionGlobalInput {
  readonly edicion_global_id: string
  /** When true, force-close all locales regardless of active inscriptions. */
  readonly force_local: boolean
}

export async function closeEdicionGlobalAction(
  input: CloseEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id) {
    return { ok: false, error: 'invalid-input', message: 'edicion_global_id requerido' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('close_edicion_global', {
    p_id: input.edicion_global_id,
    p_force_local: input.force_local,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  revalidatePath('/admin/talleres/ediciones-globales')
  return { ok: true, data: data as Record<string, unknown> }
}

// ─── cancel ──────────────────────────────────────────────────────────────

export interface CancelEdicionGlobalInput {
  readonly edicion_global_id: string
  readonly motivo: string
}

export async function cancelEdicionGlobalAction(
  input: CancelEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id) {
    return { ok: false, error: 'invalid-input', message: 'edicion_global_id requerido' }
  }
  if (!input.motivo?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'motivo requerido' }
  }
  if (input.motivo.trim().length > 500) {
    return { ok: false, error: 'invalid-input', message: 'motivo demasiado largo (máx 500)' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('cancel_edicion_global', {
    p_id: input.edicion_global_id,
    p_motivo: input.motivo.trim(),
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  revalidatePath('/admin/talleres/ediciones-globales')
  return { ok: true, data: data as Record<string, unknown> }
}

// ─── add participant ─────────────────────────────────────────────────────

export interface AddTallerToEdicionGlobalInput {
  readonly edicion_global_id: string
  readonly taller_id: string
}

export async function addTallerToEdicionGlobalAction(
  input: AddTallerToEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id || !input.taller_id) {
    return { ok: false, error: 'invalid-input', message: 'ids requeridos' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('add_taller_to_edicion_global', {
    p_edicion_global_id: input.edicion_global_id,
    p_taller_id: input.taller_id,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  return { ok: true, data: data as Record<string, unknown> }
}

// ─── remove participant ──────────────────────────────────────────────────

export interface RemoveTallerFromEdicionGlobalInput {
  readonly edicion_global_id: string
  readonly taller_id: string
}

export async function removeTallerFromEdicionGlobalAction(
  input: RemoveTallerFromEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id || !input.taller_id) {
    return { ok: false, error: 'invalid-input', message: 'ids requeridos' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('remove_taller_from_edicion_global', {
    p_edicion_global_id: input.edicion_global_id,
    p_taller_id: input.taller_id,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  return { ok: true, data: data as Record<string, unknown> }
}