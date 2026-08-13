'use server'

/**
 * PR23.2a — Server action: openEdicion.
 *
 * Wraps the public.open_edicion() RPC. Creates a new edicion of an
 * existing abstract taller.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 * `talleres_crecimiento.admin.manage` (the RPC re-checks). All
 * validation is done at the RPC layer; the client-side checks below
 * are defense-in-depth.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export interface OpenEdicionInput {
  readonly taller_id: string
  readonly tipo: 'individual' | 'pareja'
  readonly nombre_edicion: string
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly sesiones_estimadas: number
  readonly duracion_estimada_minutos: number
  readonly modalidad_inscripcion: 'periodo_general' | 'permanente_custom'
  readonly fecha_inicio_periodo: string // ISO
  readonly fecha_fin_periodo: string | null // ISO
  readonly firmantes: ReadonlyArray<{ nombre: string; rol: string }>
}

export type OpenEdicionResult =
  | { readonly ok: true; readonly edicionId: string; readonly periodoId: string | null }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
    }

export async function openEdicion(input: OpenEdicionInput): Promise<OpenEdicionResult> {
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
  if (!input.taller_id) {
    return { ok: false, error: 'invalid-input', message: 'taller_id requerido' }
  }
  if (!['individual', 'pareja'].includes(input.tipo)) {
    return { ok: false, error: 'invalid-input', message: 'tipo requerido (individual|pareja)' }
  }
  if (!input.nombre_edicion?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'nombre_edicion requerido' }
  }
  if (input.link_type && !['matrimonio', 'novios'].includes(input.link_type)) {
    return { ok: false, error: 'invalid-input' }
  }
  if (input.sesiones_estimadas <= 0) {
    return { ok: false, error: 'invalid-input', message: 'sesiones_estimadas > 0' }
  }
  if (input.duracion_estimada_minutos <= 0) {
    return { ok: false, error: 'invalid-input', message: 'duracion_estimada_minutos > 0' }
  }
  if (!['periodo_general', 'permanente_custom'].includes(input.modalidad_inscripcion)) {
    return { ok: false, error: 'invalid-input' }
  }
  if (!input.fecha_inicio_periodo) {
    return { ok: false, error: 'invalid-input', message: 'fecha_inicio_periodo requerida' }
  }

  const firmantesJson = input.firmantes
    .filter((f) => f.nombre?.trim() && f.rol?.trim())
    .map((f) => ({ nombre: f.nombre.trim(), rol: f.rol.trim() }))

  // Defense-in-depth: force link_type to null when tipo='individual'
  // (matches the form's UI behavior; the RPC also rejects this but
  // normalizing here keeps the action's behavior symmetric with the UI).
  const linkType = input.tipo === 'individual' ? null : input.link_type

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data, error } = await client.rpc('open_edicion', {
    p_taller_id: input.taller_id,
    p_tipo: input.tipo,
    p_nombre_edicion: input.nombre_edicion.trim(),
    p_link_type: linkType,
    p_sesiones_estimadas: input.sesiones_estimadas,
    p_duracion_estimada_minutos: input.duracion_estimada_minutos,
    p_modalidad_inscripcion: input.modalidad_inscripcion,
    p_fecha_inicio_periodo: input.fecha_inicio_periodo,
    p_fecha_fin_periodo: input.fecha_fin_periodo,
    p_firmantes: firmantesJson,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  const result = data as { edicion_id: string; periodo_id: string | null }
  return { ok: true, edicionId: result.edicion_id, periodoId: result.periodo_id }
}

export async function redirectToEdicion(tallerSlug: string, edicionId: string): Promise<never> {
  redirect(`/admin/talleres/edicion/${edicionId}`)
}
