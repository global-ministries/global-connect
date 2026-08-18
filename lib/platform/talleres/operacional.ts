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
    .from('taller_ediciones')
    .select('id, nombre_snapshot, tipo, estado')
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
    .from('taller_ediciones')
    .select(
      `id, nombre_snapshot, tipo, estado,
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

/**
 * PR34 — Local edition detail for /admin/talleres/edicion/[id].
 *
 * Projections used by the admin read-only detail page. The page is
 * preview-only: it joins the edicion with its taller abstract (for the
 * back-link), the cohorte (if any), the periodo general (if any), and
 * counts inscripciones + certificados scoped by edicion.
 *
 * PR42 — IMPORTANT: the `taller_id` filter on every related query
 * (talleres_crecimiento_cohortes, taller_inscripciones, taller_certificados)
 * refers to the EDICION id, not the abstract `talleres.id`. The FK
 * relationship from those tables targets `taller_ediciones(id)`. Use
 * `edicionRow.id` (or `edicionRow.taller_id` for the abstract linkage
 * back-link) — never mix them up.
 */
export interface EdicionLocalDetalle {
  readonly id: string
  readonly taller_id: string
  readonly taller_nombre: string
  readonly taller_slug: string
  readonly nombre_snapshot: string
  readonly tipo: 'individual' | 'pareja'
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly modalidad_inscripcion: 'periodo_general' | 'permanente_custom'
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly sesiones_snapshot: number
  readonly duracion_estimada_minutos_snapshot: number
  readonly firmantes: ReadonlyArray<{ persona_id: string; rol_etiqueta: string; orden: number }>
  readonly cohorte: {
    readonly id: string
    readonly dream_team_equipo_id: string
    readonly edicion: string
    readonly started_at: string | null
    readonly ended_at: string | null
  } | null
  readonly periodo_general: {
    readonly id: string
    readonly fecha_apertura_automatica: string | null
    readonly fecha_cierre_automatica: string | null
    readonly fecha_apertura_manual: string | null
    readonly fecha_cierre_manual: string | null
    readonly fecha_cierre_real: string | null
    readonly motivo_cierre: string | null
  } | null
  readonly inscripciones_count: number
  readonly inscripciones_aprobadas_count: number
  readonly certificados_count: number
}

export async function loadEdicionLocalDetalle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  edicionId: string
): Promise<EdicionLocalDetalle | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client2: any = client
  const { data: edicionRow, error } = await client2
    .from('taller_ediciones')
    .select(
      `id, taller_id, nombre_snapshot, tipo, link_type, modalidad_inscripcion,
       estado, sesiones_snapshot, duracion_estimada_minutos_snapshot, firmantes,
       talleres:talleres!inner(id, slug, nombre, estado)`,
    )
    .eq('id', edicionId)
    .maybeSingle()

  if (error || !edicionRow) return null

  const taller = edicionRow.talleres as { id: string; slug: string; nombre: string; estado: string }

  // PR42 — Bug #3 + #4 fix. `talleres_crecimiento_cohortes.taller_id`
  // is a FK to `taller_ediciones(id)` (the *edicion*, not the abstract
  // taller). The previous implementation filtered by
  // `edicionRow.taller_id` (the abstract taller's id), which always
  // returned 0 rows. Use the *edicion* id (the row's own primary key)
  // for the cohorte + inscripciones + certificados queries below.
  const { data: cohorteRow } = await client2
    .from('talleres_crecimiento_cohortes')
    .select('id, dream_team_equipo_id, edicion, started_at, ended_at')
    .eq('taller_id', edicionRow.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Periodo general via FK on taller_ediciones (periodo_general_id may
  // be NULL for permanente_custom modality).
  let periodoRow: unknown = null
  if (edicionRow.periodo_general_id) {
    const { data } = await client2
      .from('taller_periodos_generales')
      .select('id, fecha_apertura_automatica, fecha_cierre_automatica, fecha_apertura_manual, fecha_cierre_manual, fecha_cierre_real, motivo_cierre')
      .eq('id', edicionRow.periodo_general_id)
      .maybeSingle()
    periodoRow = data
  }

  // Counts — three independent head queries scoped by taller_id
  // (the FK column targets `taller_ediciones(id)` — see PR42 comment
  // above). The edicion id is the right value to pass here.
  const { count: totalCount } = await client2
    .from('taller_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('taller_id', edicionRow.id)

  const { count: aprobadasCount } = await client2
    .from('taller_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('taller_id', edicionRow.id)
    .in('estado', ['pendiente', 'aprobado'])

  const { count: certificadosCount } = await client2
    .from('taller_certificados')
    .select('id', { count: 'exact', head: true })
    .eq('taller_id', edicionRow.id)

  const periodo = periodoRow as {
    id: string
    fecha_apertura_automatica: string | null
    fecha_cierre_automatica: string | null
    fecha_apertura_manual: string | null
    fecha_cierre_manual: string | null
    fecha_cierre_real: string | null
    motivo_cierre: string | null
  } | null

  return {
    id: edicionRow.id as string,
    taller_id: edicionRow.taller_id as string,
    taller_nombre: taller.nombre,
    taller_slug: taller.slug,
    nombre_snapshot: edicionRow.nombre_snapshot as string,
    tipo: edicionRow.tipo as 'individual' | 'pareja',
    link_type: (edicionRow.link_type as 'matrimonio' | 'novios' | null) ?? null,
    modalidad_inscripcion: edicionRow.modalidad_inscripcion as
      | 'periodo_general'
      | 'permanente_custom',
    estado: edicionRow.estado as
      | 'borrador'
      | 'abierto'
      | 'en_curso'
      | 'cerrado'
      | 'cancelado',
    sesiones_snapshot: Number(edicionRow.sesiones_snapshot ?? 0),
    duracion_estimada_minutos_snapshot: Number(
      edicionRow.duracion_estimada_minutos_snapshot ?? 0
    ),
    firmantes: ((edicionRow.firmantes as unknown[]) ?? []) as ReadonlyArray<{
      persona_id: string
      rol_etiqueta: string
      orden: number
    }>,
    cohorte: cohorteRow
      ? {
          id: cohorteRow.id,
          dream_team_equipo_id: cohorteRow.dream_team_equipo_id,
          edicion: cohorteRow.edicion,
          started_at: cohorteRow.started_at,
          ended_at: cohorteRow.ended_at,
        }
      : null,
    periodo_general: periodo
      ? {
          id: periodo.id,
          fecha_apertura_automatica: periodo.fecha_apertura_automatica,
          fecha_cierre_automatica: periodo.fecha_cierre_automatica,
          fecha_apertura_manual: periodo.fecha_apertura_manual,
          fecha_cierre_manual: periodo.fecha_cierre_manual,
          fecha_cierre_real: periodo.fecha_cierre_real,
          motivo_cierre: periodo.motivo_cierre,
        }
      : null,
    inscripciones_count: totalCount ?? 0,
    inscripciones_aprobadas_count: aprobadasCount ?? 0,
    certificados_count: certificadosCount ?? 0,
  }
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
    client.from('taller_ediciones').select('id', { count: 'exact', head: true }).in('estado', ['abierto', 'en_curso']),
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
