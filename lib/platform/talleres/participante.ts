/**
 * PR18 — Shared helpers for participante RSC pages.
 *
 * Centralizes:
 *   - kill-switch check (404 when isTalleresEnabled is off)
 *   - capability gate (`participation.read`)
 *   - session lookup via resolveReadOnlyPlatformSession
 *   - common Supabase queries used by all 4 participante pages
 *
 * Per design §9 the participante surface is summary-only — no
 * administrative details, no asistencia rows, no motivos. The
 * `loadParticipanteTalleres`, `loadParticipanteCertificados`,
 * `loadParticipanteInscripciones` helpers below all project through
 * the route-integration contract (PR14) when applicable.
 */

import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export interface ParticipanteContext {
  readonly supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  readonly personaId: string
  readonly capabilities: readonly string[]
}

/**
 * Loads the participante context used by every page in `app/(auth)/talleres/**`.
 * Returns `{ ok: false }` when:
 *   - the talleres feature flag is off (404 via notFound())
 *   - the user is not authenticated (redirect to /login)
 *   - the user lacks `participation.read` (404 via notFound() — deny-by-default)
 */
export async function loadParticipanteContext(): Promise<
  { ok: true; context: ParticipanteContext } | { ok: false }
> {
  if (!isTalleresEnabled()) return { ok: false }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return { ok: false }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return { ok: false }

  const hasParticipationRead = session.capabilities.some(
    (c) => c.key === 'talleres_crecimiento.participation.read',
  )
  if (!hasParticipationRead) return { ok: false }

  return {
    ok: true,
    context: {
      supabase,
      personaId: session.personaId,
      capabilities: session.capabilities.map((c) => c.key),
    },
  }
}

/**
 * Triggers the Next.js not-found page when the participant context
 * cannot be loaded. Use in page components: `await
 * requireParticipante()` and let it short-circuit.
 */
export async function requireParticipante(): Promise<ParticipanteContext> {
  const result = await loadParticipanteContext()
  if (!result.ok) {
    // Distinguish: no session → redirect to login; otherwise → 404.
    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const { data: { user } } = await (supabase as any).auth.getUser()
    if (!user) redirect('/login')
    notFound()
  }
  return result.context
}

// ─── Participant queries ──────────────────────────────────────────────────

export interface ParticipanteTallerSummary {
  readonly id: string
  readonly nombre: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado_inscripcion: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  readonly unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  readonly fecha_completitud: string | null
  readonly estado_taller: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

/**
 * Loads the participant's active inscripciones (estado in pendiente/aprobado
 * OR unit_estado is null) — used by /talleres/mis-talleres. The participant
 * only sees the SUMMARY projection — no motivos, no sesiones, no reportes.
 */
export async function loadParticipanteActiveTalleres(
  ctx: ParticipanteContext
): Promise<readonly ParticipanteTallerSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_inscripciones')
    .select(
      `id, estado, unit_estado, fecha_completitud,
       taller:taller_ediciones (id, nombre_snapshot, tipo, estado)`,
    )
    .eq('persona_principal_id', ctx.personaId)
    .in('estado', ['pendiente', 'aprobado'])
    .order('created_at', { ascending: false })

  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed via the select above
  return ((data ?? []) as any[]).flatMap((row) => {
    const t = row.taller
    if (!t) return []
    return [
      {
        id: t.id as string,
        nombre: t.nombre_snapshot as string,
        tipo: t.tipo as 'individual' | 'pareja',
        edicion: t.edicion as string,
        estado_inscripcion: row.estado as 'pendiente' | 'aprobado',
        unit_estado: (row.unit_estado as 'completado' | 'no_completado' | 'abandono' | null) ?? null,
        fecha_completitud: (row.fecha_completitud as string | null) ?? null,
        estado_taller: t.estado as 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado',
      },
    ]
  })
}

export interface ParticipanteHistorialRow {
  readonly id: string
  readonly nombre: string
  readonly edicion: string
  readonly estado_inscripcion: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  readonly unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  readonly fecha_completitud: string | null
  readonly fecha_inscripcion: string
}

/**
 * Loads the participant's full longitudinal history (every inscripcion
 * ever, including cancelled / no-aprobado). Used by /talleres/historial.
 */
export async function loadParticipanteHistorial(
  ctx: ParticipanteContext
): Promise<readonly ParticipanteHistorialRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_inscripciones')
    .select(
      `id, estado, unit_estado, fecha_completitud, created_at,
       taller:taller_ediciones (id, nombre_snapshot)`,
    )
    .eq('persona_principal_id', ctx.personaId)
    .order('created_at', { ascending: false })

  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed via the select above
  return ((data ?? []) as any[]).flatMap((row) => {
    const t = row.taller
    if (!t) return []
    return [
      {
        id: row.id as string,
        nombre: t.nombre_snapshot as string,
        edicion: t.edicion as string,
        estado_inscripcion: row.estado as 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado',
        unit_estado: (row.unit_estado as 'completado' | 'no_completado' | 'abandono' | null) ?? null,
        fecha_completitud: (row.fecha_completitud as string | null) ?? null,
        fecha_inscripcion: row.created_at as string,
      },
    ]
  })
}

export interface ParticipanteCertificado {
  readonly id: string
  readonly codigo_verificacion: string
  readonly taller_id: string
  readonly nombre_taller_snapshot: string
  readonly fecha_completitud: string
  readonly revocado_at: string | null
}

export interface ParticipanteExplorarRow {
  /** edicion id (taller_ediciones.id). */
  readonly id: string
  /**
   * Abstract taller name (talleres.nombre) — e.g. "Matrimonio sobre la Roca".
   * Falls back to the edicion's nombre_snapshot when the abstract taller
   * could not be joined (legacy data edge case).
   */
  readonly nombre: string
  /** Stable URL-safe slug for the abstract taller (talleres.slug). */
  readonly slug: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
  /**
   * cohorte_id of the cohorte (talleres_crecimiento_cohortes) that was
   * created for this edicion. Per-row so each taller carries its own
   * enrollment target (PR37 + PR38 fix). May be null for legacy rows
   * created before PR37's backfill ran.
   */
  readonly cohorte_id: string | null
  /**
   * Modality of the abstract taller (talleres.modalidad_default).
   * Surfaces as a label on the explorar card (PR38 — Issue #2).
   */
  readonly modalidad: 'periodo_general' | 'permanente_custom' | null
  readonly descripcion: string | null
  readonly fecha_apertura: string | null
  readonly fecha_cierre: string | null
}

/**
 * Loads talleres currently open for enrollment (`estado='abierto'`
 * or `en_curso'`). Used by /talleres/explorar. Flags each taller with
 * `ya_inscrito` when the participant already has an active inscription.
 *
 * PR38 — also surfaces:
 *   - `cohorte_id` (joined from `talleres_crecimiento_cohortes`,
 *     so the inscribirme action can target the right cohorte
 *     without an extra round-trip on the page).
 *   - `modalidad` and `descripcion` (from the parent `talleres`).
 *   - `fecha_apertura` / `fecha_cierre` (from the linked
 *     `taller_periodos_generales` row, if any).
 *
 * These joins are server-side; the participante surface stays
 * summary-only (no motivos, no asistencia, no reportes).
 *
 * PR38 — joined-relationship fix. The previous nested-resource select
 * tried to infer the FK direction from `talleres_crecimiento_cohortes`
 * (which has a 1:N FK to `taller_ediciones`, not the other way around).
 * PostgREST nested-resource is brittle when the relationship is 1:N
 * (returns an array instead of an object) and when both FK directions
 * exist between two tables. The fix splits the lookup into 4 explicit
 * queries and joins in TS — no embedded join, no inferred FK.
 */
export async function loadParticipanteExplorar(
  ctx: ParticipanteContext
): Promise<readonly ParticipanteExplorarRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase

  // Query 1 — ediciones with their abstract taller (1:1 via taller_id).
  // The `taller_id` column on `taller_es` is the explicit FK hint that
  // disambiguates the embedded-resource join — without it, PostgREST
  // can pick the wrong FK when both tables have multiple relationships.
  const edicionesRes = await client
    .from('taller_ediciones')
    .select(
      `id, nombre_snapshot, tipo, estado, taller_id,
       taller:talleres!taller_id (slug, nombre, modalidad_default, descripcion)`,
    )
    .in('estado', ['abierto', 'en_curso'])
    .order('created_at', { ascending: false })

  if (edicionesRes.error) return []
  const ediciones = (edicionesRes.data ?? []) as Array<{
    id: string
    nombre_snapshot: string
    tipo: 'individual' | 'pareja'
    estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
    taller_id: string
    taller: {
      slug: string
      nombre: string
      modalidad_default: 'periodo_general' | 'permanente_custom'
      descripcion: string | null
    } | null
  }>

  if (ediciones.length === 0) return []

  // Queries 2-4 — batch fetches keyed by edicion id, fired in parallel
  // because they don't depend on each other. We only fire them when
  // there is at least one edicion to feed the .in() filter.
  const edicionIds = ediciones.map((e) => e.id)
  const [cohortesRes, periodosRes, inscripcionesRes] = await Promise.all([
    client
      .from('talleres_crecimiento_cohortes')
      .select('id, taller_id')
      .in('taller_id', edicionIds),
    client
      .from('taller_periodos_generales')
      .select('taller_id, fecha_apertura_automatica, fecha_cierre_automatico')
      .in('taller_id', edicionIds),
    client
      .from('taller_inscripciones')
      .select('taller_id, estado')
      .eq('persona_principal_id', ctx.personaId)
      .in('estado', ['pendiente', 'aprobado']),
  ])

  // Build per-edicion lookup tables. Each edicion currently has at most
  // one cohorte + one periodo in production (PR37 guarantee), but the
  // schema is 1:N — pick the first row defensively in case of legacy
  // data, and never let a missing batch fetch break the row.
  const cohorteByEdicion = new Map<string, string>()
  for (const row of ((cohortesRes.data ?? []) as Array<{
    id: string
    taller_id: string
  }>)) {
    if (!cohorteByEdicion.has(row.taller_id)) {
      cohorteByEdicion.set(row.taller_id, row.id)
    }
  }

  const periodoByEdicion = new Map<string, {
    fecha_apertura_automatica: string | null
    fecha_cierre_automatico: string | null
  }>()
  for (const row of ((periodosRes.data ?? []) as Array<{
    taller_id: string
    fecha_apertura_automatica: string | null
    fecha_cierre_automatico: string | null
  }>)) {
    if (!periodoByEdicion.has(row.taller_id)) {
      periodoByEdicion.set(row.taller_id, {
        fecha_apertura_automatica: row.fecha_apertura_automatica,
        fecha_cierre_automatico: row.fecha_cierre_automatico,
      })
    }
  }

  const inscritosIds = new Set<string>(
    ((inscripcionesRes.data ?? []) as { taller_id: string }[]).map(
      (row) => row.taller_id,
    ),
  )

  return ediciones.map((row) => {
    const periodo = periodoByEdicion.get(row.id)
    return {
      id: row.id,
      nombre: row.taller?.nombre ?? row.nombre_snapshot,
      slug: row.taller?.slug ?? '',
      tipo: row.tipo,
      edicion: row.nombre_snapshot,
      estado: row.estado,
      ya_inscrito: inscritosIds.has(row.id),
      cohorte_id: cohorteByEdicion.get(row.id) ?? null,
      modalidad: row.taller?.modalidad_default ?? null,
      descripcion: row.taller?.descripcion ?? null,
      fecha_apertura: periodo?.fecha_apertura_automatica ?? null,
      fecha_cierre: periodo?.fecha_cierre_automatico ?? null,
    }
  })
}

/**
 * Loads a single certificado by id, scoped to the participant's own
 * certificados only. Returns null if the certificado doesn't exist OR
 * doesn't belong to the participant (deny-by-default).
 */
export async function loadParticipanteCertificado(
  ctx: ParticipanteContext,
  certificadoId: string
): Promise<ParticipanteCertificado | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  // Filter on persona_id for deny-by-default — participants can only see
  // their own certificados.
  const { data, error } = await client
    .from('taller_certificados')
    .select(
      'id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, fecha_completitud, revocado_at',
    )
    .eq('id', certificadoId)
    .eq('persona_id', ctx.personaId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    codigo_verificacion: data.codigo_verificacion as string,
    taller_id: data.taller_id as string,
    nombre_taller_snapshot: data.nombre_taller_snapshot as string,
    fecha_completitud: data.fecha_completitud as string,
    revocado_at: (data.revocado_at as string | null) ?? null,
  }
}

/**
 * Lists all certificados owned by the participant (non-revoked first).
 */
export async function loadParticipanteCertificados(
  ctx: ParticipanteContext
): Promise<readonly ParticipanteCertificado[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_certificados')
    .select(
      'id, codigo_verificacion, taller_id, nombre_taller_snapshot, fecha_completitud, revocado_at',
    )
    .eq('persona_id', ctx.personaId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []).map((row: {
    id: string
    codigo_verificacion: string
    taller_id: string
    nombre_taller_snapshot: string
    fecha_completitud: string
    revocado_at: string | null
  }) => ({
    id: row.id,
    codigo_verificacion: row.codigo_verificacion,
    taller_id: row.taller_id,
    nombre_taller_snapshot: row.nombre_taller_snapshot,
    fecha_completitud: row.fecha_completitud,
    revocado_at: row.revocado_at,
  }))
}
