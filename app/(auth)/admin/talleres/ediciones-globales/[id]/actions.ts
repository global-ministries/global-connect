'use server'

/**
 * PR29-D / PR31 — Server actions for the edicion global detail page.
 *
 * PR31: the 2 junction-only RPCs (`add_taller_to_edicion_global`,
 * `remove_taller_from_edicion_global`) were dropped along with the
 * junction table. The actions are now implemented as plain SQL
 * writes against `taller_ediciones.edicion_global_id` (the FK column
 * is the source of truth). The state-transition actions
 * (open/close/cancel) still wrap the surviving 3 RPCs from PR29-C.
 *
 * All actions share the same capability gate
 * (`talleres_crecimiento.director.write` OR
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
//
// PR31: the junction table was dropped. To associate an existing
// taller with this edicion global we create a new taller_ediciones
// row whose edicion_global_id points at the global. The new row
// inherits the snapshot fields + taller_id from the latest existing
// taller_ediciones row for that taller (so the UI surfaces the
// correct metadata: nombre, tipo, modalidad_inscripcion, firmantes).
// Initial estado='borrador' so the open transition propagates the
// local together with the global.

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

  // Defense-in-depth: only allow when the global is in 'borrador'.
  // The DROP add_taller_to_edicion_global RPC used to enforce this
  // implicitly (junction rows had no estado). The new direct SQL
  // path needs an explicit check because taller_ediciones can have
  // many estados.
  const { data: globalRow, error: globalError } = await client
    .from('taller_ediciones_globales')
    .select('estado')
    .eq('id', input.edicion_global_id)
    .maybeSingle()
  if (globalError) {
    return {
      ok: false,
      error: 'internal',
      message: globalError.message ?? 'unknown error',
    }
  }
  if (!globalRow) {
    return { ok: false, error: 'not-found', message: 'edicion_global no encontrada' }
  }
  if (globalRow.estado !== 'borrador') {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'no se pueden agregar grupos a una edición que ya está abierta/cerrada',
    }
  }

  // Copy snapshot fields from the taller's latest taller_ediciones
  // row (any estado). We read in two steps: pick the source row's
  // id, then INSERT based on its columns.
  const { data: sourceRows, error: sourceError } = await client
    .from('taller_ediciones')
    .select(
      'id, operating_core_event_id, tipo, modalidad_inscripcion, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot, firmantes',
    )
    .eq('taller_id', input.taller_id)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (sourceError) {
    return {
      ok: false,
      error: 'internal',
      message: sourceError.message ?? 'unknown error',
    }
  }
  const source = (sourceRows ?? [])[0]
  if (!source) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'el taller no tiene ediciones locales previas para clonar',
    }
  }

  const { data: inserted, error: insertError } = await client
    .from('taller_ediciones')
    .insert({
      operating_core_event_id: source.operating_core_event_id,
      tipo: source.tipo,
      modalidad_inscripcion: source.modalidad_inscripcion,
      estado: 'borrador',
      nombre_snapshot: source.nombre_snapshot,
      sesiones_snapshot: source.sesiones_snapshot,
      duracion_estimada_minutos_snapshot: source.duracion_estimada_minutos_snapshot,
      modalidad_inscripcion_snapshot: source.modalidad_inscripcion_snapshot,
      firmantes: source.firmantes ?? [],
      taller_id: input.taller_id,
      edicion_global_id: input.edicion_global_id,
    })
    .select('id')
    .single()
  if (insertError || !inserted) {
    return {
      ok: false,
      error: 'internal',
      message: insertError?.message ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  return {
    ok: true,
    data: { edicion_local_id: inserted.id, taller_id: input.taller_id },
  }
}

// ─── remove participant ──────────────────────────────────────────────────
//
// PR31: nullify edicion_global_id on the local edicion. The caller
// (RemoveTallerButton) supplies edicion_local_id — the specific
// taller_ediciones row that was created via addTallerToEdicionGlobal
// — so we never blanket-NULL other rows belonging to the same
// taller (e.g. the older Legacy edicion).

export interface RemoveTallerFromEdicionGlobalInput {
  readonly edicion_global_id: string
  readonly edicion_local_id: string
}

export async function removeTallerFromEdicionGlobalAction(
  input: RemoveTallerFromEdicionGlobalInput,
): Promise<EdicionGlobalActionResult> {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) return { ok: false, error: gate.error }

  if (!input.edicion_global_id || !input.edicion_local_id) {
    return { ok: false, error: 'invalid-input', message: 'ids requeridos' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Defense-in-depth: only allow when the global is in 'borrador'.
  const { data: globalRow, error: globalError } = await client
    .from('taller_ediciones_globales')
    .select('estado')
    .eq('id', input.edicion_global_id)
    .maybeSingle()
  if (globalError) {
    return {
      ok: false,
      error: 'internal',
      message: globalError.message ?? 'unknown error',
    }
  }
  if (!globalRow) {
    return { ok: false, error: 'not-found', message: 'edicion_global no encontrada' }
  }
  if (globalRow.estado !== 'borrador') {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'no se pueden quitar grupos de una edición que ya está abierta/cerrada',
    }
  }

  const { error: updateError } = await client
    .from('taller_ediciones')
    .update({ edicion_global_id: null })
    .eq('id', input.edicion_local_id)
    .eq('edicion_global_id', input.edicion_global_id)

  if (updateError) {
    return {
      ok: false,
      error: 'internal',
      message: updateError.message ?? 'unknown error',
    }
  }

  revalidatePath(`/admin/talleres/ediciones-globales/${input.edicion_global_id}`)
  return {
    ok: true,
    data: { edicion_local_id: input.edicion_local_id },
  }
}