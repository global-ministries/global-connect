'use server'

/**
 * PR23.1 — Server action: createTallerAbstract.
 *
 * Wraps the public.create_taller_abstract() RPC. The RPC inserts a row
 * in public.talleres (the abstract catalog) and returns the new id.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 * `talleres_crecimiento.admin.manage` (the RPC re-checks). All
 * validation is done at the RPC layer; the client-side checks below
 * are defense-in-depth (matching PR21's createTaller pattern).
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export interface CreateTallerAbstractInput {
  readonly nombre: string
  readonly descripcion: string | null
  readonly modalidad_default: 'periodo_general' | 'permanente_custom'
  readonly slug?: string
  /** T3 — link an existing eligible org-chart node. Exactly one of equipoId/parentEquipoId is required. */
  readonly equipoId?: string | null
  /** T3 — create a new node under this active parent. Exactly one of equipoId/parentEquipoId is required. */
  readonly parentEquipoId?: string | null
}

export type CreateTallerAbstractResult =
  | { readonly ok: true; readonly tallerId: string; readonly slug: string }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
    }

/**
 * T3 — friendly Spanish translations for the RPC's documented error
 * codes (see 20260918160000_create_taller_abstract_equipo_choice.sql,
 * the errcode table in its header comment). Keyed by the message
 * prefix before the first ':' — an unrecognized code falls back to the
 * raw RPC message.
 */
const RPC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  MUST_CHOOSE_EXACTLY_ONE_MODE:
    'Elegí un nodo del árbol para vincular, o un padre para crear uno nuevo — no ambos ni ninguno.',
  EQUIPO_NOT_FOUND: 'El equipo elegido ya no existe.',
  EQUIPO_INACTIVE: 'El equipo elegido está inactivo.',
  EQUIPO_WRONG_EXPERIENCE: 'Ese nodo no pertenece a talleres — elegí otro.',
  EQUIPO_IS_ROOT: 'No podés vincular un nodo raíz del organigrama.',
  EQUIPO_HAS_CHILDREN: 'Ese nodo tiene hijos — elegí una hoja del árbol.',
  EQUIPO_ALREADY_LINKED: 'Ese equipo ya está vinculado a otro taller.',
  PARENT_EQUIPO_NOT_FOUND: 'El nodo padre elegido ya no existe.',
  PARENT_EQUIPO_INACTIVE: 'El nodo padre elegido está inactivo.',
}

function friendlyRpcMessage(rawMessage: string | undefined | null): string | undefined {
  if (!rawMessage) return undefined
  const code = rawMessage.split(':')[0]?.trim()
  return (code && RPC_ERROR_MESSAGES[code]) || rawMessage
}

export async function createTallerAbstract(
  input: CreateTallerAbstractInput
): Promise<CreateTallerAbstractResult> {
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

  // Defense-in-depth client validation (RPC re-validates).
  if (!input.nombre?.trim() || input.nombre.trim().length < 2) {
    return { ok: false, error: 'invalid-input', message: 'nombre requerido (mínimo 2 caracteres)' }
  }
  if (input.nombre.trim().length > 200) {
    return { ok: false, error: 'invalid-input', message: 'nombre demasiado largo (máx 200)' }
  }
  if (input.descripcion && input.descripcion.length > 2000) {
    return { ok: false, error: 'invalid-input', message: 'descripción demasiado larga (máx 2000)' }
  }
  if (!['periodo_general', 'permanente_custom'].includes(input.modalidad_default)) {
    return { ok: false, error: 'invalid-input' }
  }

  // T3 — exactly one of equipoId (vincular) / parentEquipoId (nuevo).
  // Mirrors the RPC's own (p_equipo_id IS NULL) = (p_parent_equipo_id
  // IS NULL) check, so a malformed call never spends a round-trip.
  const equipoId = input.equipoId?.trim() || null
  const parentEquipoId = input.parentEquipoId?.trim() || null
  if ((equipoId === null) === (parentEquipoId === null)) {
    return {
      ok: false,
      error: 'invalid-input',
      message: RPC_ERROR_MESSAGES['MUST_CHOOSE_EXACTLY_ONE_MODE'],
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data, error } = await client.rpc('create_taller_abstract', {
    p_nombre: input.nombre.trim(),
    p_descripcion: input.descripcion?.trim() ?? '',
    p_modalidad_default: input.modalidad_default,
    p_slug: input.slug?.trim() ?? '',
    p_equipo_id: equipoId,
    p_parent_equipo_id: parentEquipoId,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: friendlyRpcMessage(error?.message as string | undefined) ?? 'unknown error',
    }
  }

  const result = data as { taller_id: string; slug: string }
  return { ok: true, tallerId: result.taller_id, slug: result.slug }
}

export async function redirectToTalleresAbstractos(): Promise<never> {
  redirect('/admin/talleres/abstracto')
}
