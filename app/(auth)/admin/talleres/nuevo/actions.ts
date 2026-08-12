'use server'

/**
 * PR21 — Server action: createTaller (admin only).
 *
 * Wraps the public.create_taller_with_initial_state() RPC. Validates
 * input client-side (defense-in-depth — the RPC also re-validates),
 * invokes the RPC, and returns a discriminated-union result.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 * `talleres_crecimiento.admin.manage` (the RPC re-checks).
 *
 * Atomicity: a single Postgres transaction. Either the 6 DB writes
 * (event, metadata, periodo, cohorte, equipo) all succeed or none do.
 */

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export interface FirmanteInput {
  readonly nombre: string
  readonly rol: string
}

export interface CreateTallerInput {
  readonly nombre: string
  readonly edicion: string
  readonly tipo: 'individual' | 'pareja'
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly sesiones_estimadas: number
  readonly duracion_estimada_minutos: number
  readonly fecha_inicio_periodo: string // ISO
  readonly fecha_fin_periodo: string | null // ISO
  readonly firmantes: readonly FirmanteInput[]
  readonly cohorte_edicion_label: string
  readonly cohorte_started_at: string | null // ISO
  readonly cohorte_ended_at: string | null // ISO
  readonly equipo_id: string | null
  readonly equipo_label: string | null
}

export type CreateTallerResult =
  | { readonly ok: true; readonly tallerId: string; readonly cohorteId: string; readonly equipoId: string }
  | { readonly ok: false; readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'; readonly message?: string }

export async function createTaller(
  input: CreateTallerInput
): Promise<CreateTallerResult> {
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

  // Client-side validation (defense-in-depth; the RPC re-validates).
  if (!input.nombre?.trim()) return { ok: false, error: 'invalid-input', message: 'nombre requerido' }
  if (!input.edicion?.trim()) return { ok: false, error: 'invalid-input', message: 'edicion requerida' }
  if (!['individual', 'pareja'].includes(input.tipo)) return { ok: false, error: 'invalid-input' }
  if (input.link_type && !['matrimonio', 'novios'].includes(input.link_type)) {
    return { ok: false, error: 'invalid-input' }
  }
  if (input.link_type && input.tipo === 'individual') {
    return { ok: false, error: 'invalid-input', message: 'link_type no aplica a individual' }
  }
  if (!input.sesiones_estimadas || input.sesiones_estimadas <= 0) {
    return { ok: false, error: 'invalid-input', message: 'sesiones_estimadas > 0 requerido' }
  }
  if (!input.duracion_estimada_minutos || input.duracion_estimada_minutos <= 0) {
    return { ok: false, error: 'invalid-input', message: 'duracion_estimada_minutos > 0 requerido' }
  }
  if (!input.fecha_inicio_periodo) {
    return { ok: false, error: 'invalid-input', message: 'fecha_inicio_periodo requerida' }
  }
  if (!input.cohorte_edicion_label?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'cohorte_edicion_label requerido' }
  }
  if (!input.equipo_id && !input.equipo_label?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'equipo_id o equipo_label requerido' }
  }

  // Build firmantes JSONB.
  const firmantesJson = JSON.stringify(
    input.firmantes
      .filter((f) => f.nombre?.trim() && f.rol?.trim())
      .map((f) => ({ nombre: f.nombre.trim(), rol: f.rol.trim() })),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data, error } = await client.rpc('create_taller_with_initial_state', {
    p_nombre: input.nombre.trim(),
    p_edicion: input.edicion.trim(),
    p_tipo: input.tipo,
    p_link_type: input.link_type,
    p_sesiones_estimadas: input.sesiones_estimadas,
    p_duracion_estimada_minutos: input.duracion_estimada_minutos,
    p_modalidad_inscripcion: 'periodo_general',
    p_fecha_inicio_periodo: input.fecha_inicio_periodo,
    p_fecha_fin_periodo: input.fecha_fin_periodo,
    p_firmantes: firmantesJson,
    p_cohorte_edicion_label: input.cohorte_edicion_label.trim(),
    p_cohorte_started_at: input.cohorte_started_at,
    p_cohorte_ended_at: input.cohorte_ended_at,
    p_equipo_id: input.equipo_id,
    p_equipo_label: input.equipo_label?.trim() ?? null,
  })

  if (error || !data) {
    const msg = (error?.message ?? 'unknown error') as string
    return { ok: false, error: 'internal', message: msg }
  }

  const result = data as {
    taller_id: string
    cohorte_id: string
    equipo_id: string
  }
  return {
    ok: true,
    tallerId: result.taller_id,
    cohorteId: result.cohorte_id,
    equipoId: result.equipo_id,
  }
}

export async function redirectToTallerCreated(tallerId: string): Promise<never> {
  redirect(`/admin/talleres/${tallerId}`)
}
