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
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { personaId } from '@/lib/platform/dream-team/types'

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
  /**
   * PR46 — global season (talleres_temporadas) this edición belongs to.
   * `null` means "not bound to any season" (backward-compatible). Always
   * sent so the RPC resolves the 11-arg overload (never the 10-arg one).
   */
  readonly temporada_id: string | null
}

export type OpenEdicionResult =
  | {
      readonly ok: true
      readonly edicionId: string
      readonly periodoId: string | null
      readonly temporadaId: string | null
    }
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
    // PR46: always sent (uuid or null) so PostgREST resolves the 11-arg
    // overload. Never omit — omitting would fall back to the 10-arg one.
    p_temporada_id: input.temporada_id ?? null,
  })

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: (error?.message as string) ?? 'unknown error',
    }
  }

  const result = data as {
    edicion_id: string
    periodo_id: string | null
    temporada_id: string | null
  }
  return {
    ok: true,
    edicionId: result.edicion_id,
    periodoId: result.periodo_id,
    temporadaId: result.temporada_id ?? null,
  }
}

export async function redirectToEdicion(tallerSlug: string, edicionId: string): Promise<never> {
  redirect(`/admin/talleres/edicion/${edicionId}`)
}

// ──────────────────────────────────────────────────────────────────────
// Cimiento 4 — assignServicio
// ──────────────────────────────────────────────────────────────────────

/**
 * Assign a persona as coordinador/director of an abstract taller.
 *
 * The abstract taller has exactly ONE dream_team equipo, reached only via
 * its ediciones → cohortes bridge (cohortes.dream_team_equipo_id). We
 * resolve that equipo server-side, resolve the rol id from its LABEL (never
 * a client-supplied rol_id), then activate a dream_team servicio
 * (estado='activo'). The `sync_talleres_grants_on_servicio_change` trigger
 * materializes the scoped capability grants — this action never writes
 * grants directly.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 * `talleres_crecimiento.admin.manage` (same as openEdicion).
 */
export interface AssignServicioInput {
  readonly taller_id: string
  readonly persona_id: string
  readonly rol: 'coordinador' | 'director'
}

export type AssignServicioResult =
  | {
      readonly ok: true
      readonly servicioId: string
      readonly already?: boolean
    }
  | {
      readonly ok: false
      readonly error:
        | 'forbidden'
        | 'unauthorized'
        | 'not-found'
        | 'invalid-input'
        | 'no-equipo'
        | 'no-role'
        | 'internal'
      readonly message?: string
    }

const ASSIGN_ROLES = ['coordinador', 'director'] as const

const NO_EQUIPO_MESSAGE =
  'Este taller todavía no tiene equipo. Abrí una edición primero.'

export async function assignServicio(
  input: AssignServicioInput,
): Promise<AssignServicioResult> {
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

  // Defense-in-depth input validation.
  if (!input.taller_id?.trim() || !input.persona_id?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'taller_id y persona_id requeridos' }
  }
  if (!ASSIGN_ROLES.includes(input.rol)) {
    return { ok: false, error: 'invalid-input', message: 'rol inválido (coordinador|director)' }
  }

  try {
    // taller_ediciones / talleres_crecimiento_cohortes are not in the
    // generated Database types → raw any-cast client (matches page.tsx).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const client: any = supabase

    // Resolve the taller's single equipo: ediciones of this taller, then the
    // dream_team_equipo_id linked through any of their cohortes.
    const { data: edicionesData } = await client
      .from('taller_ediciones')
      .select('id')
      .eq('taller_id', input.taller_id)
    const edicionIds = ((edicionesData ?? []) as Array<{ id: string }>).map((e) => e.id)
    if (edicionIds.length === 0) {
      return { ok: false, error: 'no-equipo', message: NO_EQUIPO_MESSAGE }
    }

    const { data: cohorteData } = await client
      .from('talleres_crecimiento_cohortes')
      .select('dream_team_equipo_id')
      .in('taller_id', edicionIds)
      .limit(1)
    const equipoId =
      ((cohorteData ?? []) as Array<{ dream_team_equipo_id: string | null }>)[0]
        ?.dream_team_equipo_id ?? null
    if (!equipoId) {
      return { ok: false, error: 'no-equipo', message: NO_EQUIPO_MESSAGE }
    }

    const repo = createSupabaseDreamTeamRepository(supabase)

    // Resolve the rol id from its LABEL — never trust a client rol_id.
    const roles = await repo.listRolesPorEquipo(equipoId)
    const rol = roles.find((r) => r.label === input.rol)
    if (!rol) {
      return {
        ok: false,
        error: 'no-role',
        message: `El equipo no tiene el rol "${input.rol}" configurado.`,
      }
    }

    // Idempotency: an existing active servicio for this persona on this
    // equipo already carries the grants — return it instead of duplicating.
    const existing = await repo.listServicios({
      equipoId,
      personaId: personaId(input.persona_id),
      estado: 'activo',
    })
    const [existingServicio] = existing
    if (existingServicio) {
      return { ok: true, servicioId: existingServicio.id, already: true }
    }

    const servicio = await repo.createServicio({
      personaId: personaId(input.persona_id),
      equipoId,
      rolId: rol.id,
      estado: 'activo',
      fechaInicio: new Date().toISOString(),
      motivoActual: 'admin_asignacion',
    })
    return { ok: true, servicioId: servicio.id }
  } catch (error) {
    console.error('[assignServicio] error:', error)
    return { ok: false, error: 'internal', message: (error as Error)?.message }
  }
}
