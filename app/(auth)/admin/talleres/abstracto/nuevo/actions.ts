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
}

export type CreateTallerAbstractResult =
  | { readonly ok: true; readonly tallerId: string; readonly slug: string }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data, error } = await client.rpc('create_taller_abstract', {
    p_nombre: input.nombre.trim(),
    p_descripcion: input.descripcion?.trim() ?? '',
    p_modalidad_default: input.modalidad_default,
    p_slug: input.slug?.trim() ?? '',
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  const result = data as { taller_id: string; slug: string }
  return { ok: true, tallerId: result.taller_id, slug: result.slug }
}

export async function redirectToTalleresAbstractos(): Promise<never> {
  redirect('/admin/talleres/abstracto')
}
