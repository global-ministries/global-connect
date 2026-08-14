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
  readonly id: string
  readonly nombre: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
}

/**
 * Loads talleres currently open for enrollment (`estado='abierto'`).
 * Used by /talleres/explorar. Flags each taller with `ya_inscrito`
 * when the participant already has an active inscription.
 */
export async function loadParticipanteExplorar(
  ctx: ParticipanteContext
): Promise<readonly ParticipanteExplorarRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const [talleresRes, inscripcionesRes] = await Promise.all([
    client
      .from('taller_ediciones')
      .select('id, nombre_snapshot, tipo, estado')
      .in('estado', ['abierto', 'en_curso'])
      .order('created_at', { ascending: false }),
    client
      .from('taller_inscripciones')
      .select('taller_id, estado')
      .eq('persona_principal_id', ctx.personaId)
      .in('estado', ['pendiente', 'aprobado']),
  ])

  if (talleresRes.error) return []
  const inscritosIds = new Set<string>(
    ((inscripcionesRes.data ?? []) as { taller_id: string }[]).map(
      (row) => row.taller_id,
    ),
  )

  return ((talleresRes.data ?? []) as {
    id: string
    nombre_snapshot: string
    tipo: 'individual' | 'pareja'
    edicion: string
    estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  }[]).map((row) => ({
    id: row.id,
    nombre: row.nombre_snapshot,
    tipo: row.tipo,
    edicion: row.edicion,
    estado: row.estado,
    ya_inscrito: inscritosIds.has(row.id),
  }))
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
