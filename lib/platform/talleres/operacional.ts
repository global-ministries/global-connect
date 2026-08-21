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

import type { InscripcionAdminRow } from './inscripciones-types'

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

/**
 * Coord inscripcion row shape.
 *
 * Re-exported as an alias for `InscripcionAdminRow` (PR42 unified
 * shape) so the coordinator surface can share the
 * `<TablaInscripciones>` component + approve/reject buttons with the
 * global `/admin/talleres/inscripciones` surface. The old PR19
 * shape (`id, taller_id, estado, motivo_no_aprobado, created_at`)
 * is superseded — callers now get persona_nombre + edicion_nombre +
 * cohorte_edicion + link_type so the table is human-readable.
 */
export type CoordInscripcionRow = InscripcionAdminRow

/**
 * Loads pendiente inscripciones for the coordinator surface.
 *
 * Returns up to 50 rows (a coordinator should never see hundreds of
 * pendientes at once; if there are more, the workflow needs
 * tightening, not pagination). The shape matches
 * `InscripcionAdminRow` so the same `<TablaInscripciones>`
 * component used by the global admin page can render it.
 *
 * Query plan:
 *   1. SELECT base columns + embedded persona_principal/companero
 *      joins (same dual-FK hint pattern used by `admin-inscripciones.ts`).
 *   2. Batched lookup of `taller_ediciones` (with embedded abstract
 *      taller) by collected taller_ids.
 *   3. Batched lookup of `talleres_crecimiento_cohortes` by collected
 *      cohorte_ids.
 *   4. Deny-by-default: rows whose edicion join does not resolve are
 *      dropped.
 *
 * RLS-respecting: the SELECT policy on `taller_inscripciones` allows
 * coordinator / director / admin to read all rows. The page's
 * `requireOperacionalRole()` is the outer wall.
 */
export async function loadCoordInscripcionesPendientes(
  ctx: OperacionalContext
): Promise<readonly CoordInscripcionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase

  // Query 1 — inscripciones (pendientes only, with embedded persona
  // + companero joins so we avoid an extra round-trip for users).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase resolved shape
  const res: { data: any[] | null; error: { message: string } | null } =
    await client
      .from('taller_inscripciones')
      .select(
        `id, taller_id, cohorte_id, estado, link_type, created_at, updated_at,
         persona_principal:usuarios!persona_principal_id (id, nombre, apellido, email),
         companero:usuarios!companero_id (id, nombre, apellido)`,
      )
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })
      .limit(50)

  if (res.error) return []
  const inscripciones = (res.data ?? []) as Array<Record<string, unknown>>

  if (inscripciones.length === 0) return []

  // Collect ids for batched lookups.
  const edicionIds = new Set<string>()
  const cohorteIds = new Set<string>()
  for (const row of inscripciones) {
    if (typeof row.taller_id === 'string') edicionIds.add(row.taller_id)
    if (typeof row.cohorte_id === 'string') cohorteIds.add(row.cohorte_id)
  }

  // Query 2 — ediciones by id (with embedded abstract taller).
  const edicionesById = new Map<
    string,
    {
      id: string
      nombre_snapshot: string
      estado: string
      taller_id: string
      taller: { id: string; nombre: string; slug: string } | null
    }
  >()
  if (edicionIds.size > 0) {
    const edRes = await client
      .from('taller_ediciones')
      .select(
        `id, nombre_snapshot, estado, taller_id,
         taller:talleres (id, nombre, slug)`,
      )
      .in('id', Array.from(edicionIds))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolved shape
    const edData = ((edRes as any).data ?? []) as any[]
    for (const e of edData) {
      edicionesById.set(e.id, e)
    }
  }

  // Query 3 — cohortes by id.
  const cohortesById = new Map<string, { id: string; edicion: string | null }>()
  if (cohorteIds.size > 0) {
    const cRes = await client
      .from('talleres_crecimiento_cohortes')
      .select('id, edicion')
      .in('id', Array.from(cohorteIds))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolved shape
    const cData = ((cRes as any).data ?? []) as any[]
    for (const c of cData) {
      cohortesById.set(c.id, c)
    }
  }

  // Build the page rows.
  const rows: CoordInscripcionRow[] = []
  const nombreCompleto = (n: string | null, a: string | null): string =>
    [n, a].filter((x) => x && x.length > 0).join(' ') || '—'

  for (const r of inscripciones) {
    const edicion = edicionesById.get(r.taller_id as string)
    if (!edicion) continue
    const cohorte =
      typeof r.cohorte_id === 'string' ? cohortesById.get(r.cohorte_id) : null
    const persona = r.persona_principal as
      | {
          id: string
          nombre: string | null
          apellido: string | null
          email: string | null
        }
      | null
    const companero = r.companero as
      | { id: string; nombre: string | null; apellido: string | null }
      | null
    if (!persona) continue

    rows.push({
      id: r.id as string,
      edicion_id: edicion.id,
      edicion_nombre: edicion.nombre_snapshot,
      edicion_estado: edicion.estado,
      taller_id: edicion.taller_id,
      taller_nombre: edicion.taller?.nombre ?? '—',
      taller_slug: edicion.taller?.slug ?? '',
      cohorte_id: (r.cohorte_id as string | null) ?? null,
      cohorte_edicion: cohorte?.edicion ?? null,
      persona_principal_id: persona.id,
      persona_principal_nombre: nombreCompleto(persona.nombre, persona.apellido),
      persona_principal_email: persona.email ?? null,
      companero_id: companero?.id ?? null,
      companero_nombre: companero ? nombreCompleto(companero.nombre, companero.apellido) : null,
      link_type: (r.link_type as 'matrimonio' | 'novios' | null) ?? null,
      estado: r.estado as InscripcionAdminRow['estado'],
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    })
  }

  return rows
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

export interface CoordEdicionResumen {
  readonly id: string
  readonly nombre_snapshot: string
  readonly tipo: 'individual' | 'pareja'
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

/**
 * A distinct abstract taller with the ediciones (occurrences) grouped under it.
 * The Coordinación surface counts/lists these, NOT raw ediciones.
 */
export interface CoordTallerAgrupado {
  readonly taller_id: string
  readonly taller_nombre: string
  readonly ediciones: readonly CoordEdicionResumen[]
}

/**
 * Group taller_ediciones by their abstract taller for the Coordinación surface.
 * Embeds talleres(nombre) so the group header is the abstract offering name.
 * Orphan ediciones (taller_id NULL — best-effort backfill missed) fall back to
 * their own singleton group keyed by the edición id and labeled with its
 * nombre_snapshot, so nothing is dropped.
 */
export async function loadCoordTalleresAgrupados(
  ctx: OperacionalContext
): Promise<readonly CoordTallerAgrupado[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const { data, error } = await client
    .from('taller_ediciones')
    .select('id, taller_id, nombre_snapshot, tipo, estado, talleres(id, nombre)')
    .order('created_at', { ascending: false })
  if (error || !data) return []

  const byTaller = new Map<
    string,
    { taller_id: string; taller_nombre: string; ediciones: CoordEdicionResumen[] }
  >()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST rows
  for (const row of data as any[]) {
    const edicion: CoordEdicionResumen = {
      id: row.id,
      nombre_snapshot: row.nombre_snapshot,
      tipo: row.tipo,
      estado: row.estado,
    }
    const key: string = row.taller_id ?? `edicion:${row.id}`
    const nombre: string = row.talleres?.nombre ?? row.nombre_snapshot
    const existing = byTaller.get(key)
    if (existing) {
      existing.ediciones.push(edicion)
    } else {
      byTaller.set(key, {
        taller_id: key,
        taller_nombre: nombre,
        ediciones: [edicion],
      })
    }
  }
  return Array.from(byTaller.values())
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
