/**
 * PR19 — Shared helpers for equipo / coordinacion / direccion dashboards.
 *
 * Three capability contexts:
 *   - equipo:   lead.read | lead.write | volunteer.read
 *   - coordinacion: coordinator.read | coordinator.write
 *   - direccion: director.read | director.write | metrics.read
 *
 * The participante helper (PR18) handles the participante context;
 * this module handles the operational dashboards (L / C / D roles).
 *
 * Per design §9 the dashboards are summary projections — no
 * administrative details beyond what's strictly needed for the role.
 *   - L: mis-grupos, asistencia, reporte (own grupo only)
 *   - C: inscripcioness pendientes, talleres, equipos, reportes
 *   - D: global view, periodos, solicitudes, métricas
 */

import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export type OperacionalRole = 'L' | 'C' | 'D'

export interface OperacionalContext {
  readonly supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  readonly personaId: string
  readonly role: OperacionalRole
  readonly capabilities: readonly string[]
}

/**
 * Resolve the role for the given session. A user can hold multiple
 * roles; we pick the highest (D > C > L).
 */
function resolveRole(capabilities: readonly string[]): OperacionalRole | null {
  if (capabilities.some((c) => c.startsWith('talleres_crecimiento.director.') || c === 'talleres_crecimiento.metrics.read')) {
    return 'D'
  }
  if (capabilities.some((c) => c.startsWith('talleres_crecimiento.coordinator.'))) {
    return 'C'
  }
  if (
    capabilities.some(
      (c) =>
        c.startsWith('talleres_crecimiento.lead.') ||
        c === 'talleres_crecimiento.volunteer.read',
    )
  ) {
    return 'L'
  }
  return null
}

/**
 * Loads the operacional context. Returns `{ ok: false }` when:
 *   - talleres feature flag off (404)
 *   - user not authenticated (redirect to /login)
 *   - user has no operational role capability (404)
 */
export async function loadOperacionalContext(): Promise<
  { ok: true; context: OperacionalContext } | { ok: false }
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

  const capabilityKeys = session.capabilities.map((c) => c.key)
  const role = resolveRole(capabilityKeys)
  if (!role) return { ok: false }

  return {
    ok: true,
    context: {
      supabase,
      personaId: session.personaId,
      role,
      capabilities: capabilityKeys,
    },
  }
}

/**
 * Triggers Next.js not-found when the operacional context cannot be
 * loaded. Use in page components: `await requireOperacionalRole()`
 * and let it short-circuit.
 */
export async function requireOperacionalRole(): Promise<OperacionalContext> {
  const result = await loadOperacionalContext()
  if (!result.ok) {
    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
    const { data: { user } } = await (supabase as any).auth.getUser()
    if (!user) redirect('/login')
    notFound()
  }
  return result.context
}

// ─── Equipo (L) — mis-grupos / asistencia / reporte ───────────────────────

export interface EquipoGrupo {
  readonly id: string
  readonly nombre: string
  readonly cohorte_id: string
  readonly capacidad: number
  readonly estado: string
}

export async function loadEquipoGrupos(
  ctx: OperacionalContext
): Promise<readonly EquipoGrupo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  // Líderes see only the grupos they're assigned to (rol='lider').
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .select(
      `grupo:taller_grupos (id, nombre, cohorte_id, capacidad, estado)`,
    )
    .eq('persona_id', ctx.personaId)
    .eq('activo', true)
    .eq('rol', 'lider')

  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed via select
  return ((data ?? []) as any[])
    .map((row) => row.grupo)
    .filter((g): g is EquipoGrupo => g !== null)
}

export interface EquipoAsistenciaRow {
  readonly id: string
  readonly inscripcion_id: string
  readonly persona_id: string
  readonly estado: 'presente' | 'ausente' | 'no_aplica'
  readonly created_at: string
}

export async function loadEquipoAsistencia(
  ctx: OperacionalContext,
  sesionId: string
): Promise<readonly EquipoAsistenciaRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_asistencias')
    .select('id, inscripcion_id, persona_id, estado, created_at')
    .eq('sesion_id', sesionId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as EquipoAsistenciaRow[]
}

export interface EquipoReporte {
  readonly id: string
  readonly grupo_id: string
  readonly estado: 'borrador' | 'enviado' | 'reabierto' | 'cerrado'
  readonly observaciones_generales: string
  readonly firma_lider_fecha: string | null
  readonly reabierto_motivo: string | null
}

export async function loadEquipoReporte(
  ctx: OperacionalContext,
  grupoId: string
): Promise<EquipoReporte | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_reportes')
    .select('id, grupo_id, estado, observaciones_generales, firma_lider_fecha, reabierto_motivo')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data as EquipoReporte
}

export interface EquipoSesion {
  readonly id: string
  readonly grupo_id: string
  readonly numero: number
  readonly fecha_programada: string
  readonly fecha_realizada: string | null
  readonly estado: 'programada' | 'en_curso' | 'cerrada' | 'cancelada'
}

export async function loadEquipoProximasSesiones(
  ctx: OperacionalContext
): Promise<readonly EquipoSesion[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  // Líderes see the sesiones for grupos they're assigned to. Use the
  // join path through taller_grupo_asignaciones for deny-by-default.
  const { data, error } = await client
    .from('taller_sesiones')
    .select(
      `id, grupo_id, numero, fecha_programada, fecha_realizada, estado,
       grupo:taller_grupos!inner (
         id,
         asignaciones:taller_grupo_asignaciones!inner (
           persona_id, activo, rol
         )
       )`,
    )
    .eq('grupo.asignaciones.persona_id', ctx.personaId)
    .eq('grupo.asignaciones.activo', true)
    .eq('grupo.asignaciones.rol', 'lider')
    .in('estado', ['programada', 'en_curso'])
    .order('fecha_programada', { ascending: true })
    .limit(20)
  if (error) return []
  return (data ?? []) as EquipoSesion[]
}

// ─── Coordinacion (C) ─────────────────────────────────────────────────────

export interface CoordInscripcionRow {
  readonly id: string
  readonly taller_id: string
  readonly estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  readonly motivo_no_aprobado: string | null
  readonly created_at: string
}

export async function loadCoordInscripcionesPendientes(
  ctx: OperacionalContext
): Promise<readonly CoordInscripcionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_inscripciones')
    .select('id, taller_id, estado, motivo_no_aprobado, created_at')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as CoordInscripcionRow[]
}

export interface CoordTaller {
  readonly id: string
  readonly nombre_snapshot: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

export async function loadCoordTalleres(
  ctx: OperacionalContext
): Promise<readonly CoordTaller[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('talleres_crecimiento_metadata')
    .select('id, nombre_snapshot, tipo, edicion, estado')
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as CoordTaller[]
}

export interface CoordReporte {
  readonly id: string
  readonly grupo_id: string
  readonly estado: 'borrador' | 'enviado' | 'reabierto' | 'cerrado'
  readonly firma_lider_fecha: string | null
  readonly reabierto_motivo: string | null
}

export async function loadCoordReportes(
  ctx: OperacionalContext
): Promise<readonly CoordReporte[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_reportes')
    .select('id, grupo_id, estado, firma_lider_fecha, reabierto_motivo')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return []
  return (data ?? []) as CoordReporte[]
}

export interface CoordSolicitudRow {
  readonly id: string
  readonly inscripcion_id: string
  readonly estado: 'pendiente' | 'aprobada' | 'rechazada'
  readonly motivo: string
  readonly created_at: string
}

export async function loadCoordSolicitudes(
  ctx: OperacionalContext
): Promise<readonly CoordSolicitudRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_solicitudes_retiro')
    .select('id, inscripcion_id, estado, motivo, created_at')
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as CoordSolicitudRow[]
}

// ─── Direccion (D) ────────────────────────────────────────────────────────

export interface DirTaller extends CoordTaller {
  readonly total_inscripciones: number
}

export async function loadDirTalleres(
  ctx: OperacionalContext
): Promise<readonly DirTaller[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('talleres_crecimiento_metadata')
    .select(
      `id, nombre_snapshot, tipo, edicion, estado,
       inscripciones:taller_inscripciones (id)`,
    )
    .order('created_at', { ascending: false })
  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed via select
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id as string,
    nombre_snapshot: row.nombre_snapshot as string,
    tipo: row.tipo as 'individual' | 'pareja',
    edicion: row.edicion as string,
    estado: row.estado as DirTaller['estado'],
    total_inscripciones: ((row.inscripciones as unknown[]) ?? []).length,
  }))
}

export interface DirPeriodo {
  readonly id: string
  readonly taller_id: string
  readonly edicion_label: string
  readonly fecha_cierre_real: string | null
}

export async function loadDirPeriodos(
  ctx: OperacionalContext
): Promise<readonly DirPeriodo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_periodos_generales')
    .select('id, taller_id, edicion_label, fecha_cierre_real')
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as DirPeriodo[]
}

export interface DirResumenCounts {
  readonly talleres_activos: number
  readonly inscripciones_pendientes: number
  readonly solicitudes_pendientes: number
  readonly certificados_emitidos: number
}

export async function loadDirResumen(
  ctx: OperacionalContext
): Promise<DirResumenCounts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const [talleres, inscripciones, solicitudes, certificados] = await Promise.all([
    client.from('talleres_crecimiento_metadata').select('id', { count: 'exact', head: true }).in('estado', ['abierto', 'en_curso']),
    client.from('taller_inscripciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    client.from('taller_solicitudes_retiro').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    client.from('taller_certificados').select('id', { count: 'exact', head: true }).is('revocado_at', null),
  ])
  return {
    talleres_activos: talleres.count ?? 0,
    inscripciones_pendientes: inscripciones.count ?? 0,
    solicitudes_pendientes: solicitudes.count ?? 0,
    certificados_emitidos: certificados.count ?? 0,
  }
}
