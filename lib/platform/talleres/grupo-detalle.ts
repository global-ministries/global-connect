/**
 * T5 (odd/tasks/talleres-consolidar-pantallas.md) — loaders for
 * /talleres/[taller]/[edicion]/[grupo], the grupo detail screen. Replaces
 * app/(auth)/talleres/equipo/mis-grupos/[id]/asistencia/page.tsx and
 * .../reporte/page.tsx — this file ports loadEquipoAsistencia's and
 * loadEquipoReporte's query shapes (operacional.ts) for the grupo's own
 * home, plus new loaders the old pages never needed (they were reached
 * only after loadEquipoGrupos already proved the caller leads the grupo).
 *
 * PERMISSIONS EVIDENCE (supabase/tests/talleres-t5-lider-lectura.test.sql,
 * verified against staging under SET LOCAL ROLE authenticated with a
 * zero-capability líder fixture — see that file's header for the full
 * finding list):
 *   - taller_grupos, taller_sesiones, taller_asistencias and
 *     taller_reportes are ALL capability-only SELECT policies (lead.read /
 *     coordinator.read / director.read / ...), with no "I'm assigned to
 *     this grupo" branch — unlike taller_grupo_asignaciones itself, whose
 *     SELECT policy has an explicit own-row OR branch. A real líder,
 *     identified by an active taller_grupo_asignaciones row with
 *     rol='lider', can therefore hold ZERO effective talleres capability
 *     today (lead.* is never successfully auto-granted — see that test
 *     file's finding 6) and still be unable to read their own grupo's
 *     record, sesiones, asistencias or reporte.
 *   - taller_ediciones and talleres_crecimiento_cohortes both carve out
 *     "any authenticated user, when the edición is abierto/en_curso" —
 *     taller_grupos does NOT get that carve-out.
 *   - talleres_equipo_de_grupo(uuid) (a SECURITY DEFINER resolver already
 *     used inside taller_grupos'/taller_sesiones' own RLS, EXECUTE already
 *     granted to `authenticated`) IS callable by a zero-capability caller
 *     and resolves the taller's org node WITHOUT requiring SELECT on
 *     taller_grupos — resolveEquipoDeGrupo below wraps it so the page's
 *     gate can confirm "this grupo belongs to this taller" even in the
 *     degraded/limited render path, with no new grant.
 *   - usuarios visibility for a fellow team member (not self) was FALSE
 *     for every viewer this task could construct, including a full
 *     director: puede_ver_usuario is entirely a Grupos de Vida concept
 *     (grupo_miembros / es_lider_de_grupo / es_director_de_grupo),
 *     unrelated to talleres. Fixed in T2 of odd/tasks/talleres-lider-
 *     identidad.md: loadGrupoAsignaciones now resolves names through the
 *     talleres_grupo_equipo_personas(uuid) RPC (T1 of that same task,
 *     migration 20260924150000_talleres_lider_identidad.sql) instead of
 *     the usuarios(...) embed — a missing name still degrades to '—'
 *     rather than being invented, but the row is never dropped.
 *
 * loadAsistenciaPorClase resolves participant names through the EXISTING
 * talleres_coord_inscripciones_personas RPC (operacional.ts's
 * loadCoordInscripcionesPendientes already calls it) — inscripciones DO
 * have that name-resolution RPC, so no new DB function is needed there.
 */

export interface GrupoDetalle {
  readonly id: string
  readonly nombre: string
  readonly capacidad: number
  readonly estado: string
  readonly cohorteId: string
  /** talleres_crecimiento_cohortes.taller_id is a FK to taller_ediciones(id) — see catalogo.ts's loadNombresPorCohorte. */
  readonly edicionId: string
}

interface MaybeSingleClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

export async function loadGrupoDetalle(
  client: MaybeSingleClient,
  grupoId: string,
): Promise<GrupoDetalle | null> {
  const { data: grupoRow, error: grupoError } = await client
    .from('taller_grupos')
    .select('id, nombre, capacidad, estado, cohorte_id')
    .eq('id', grupoId)
    .maybeSingle()

  if (grupoError || !grupoRow) return null
  const grupo = grupoRow as {
    id: string
    nombre: string
    capacidad: number
    estado: string
    cohorte_id: string
  }

  const { data: cohorteRow, error: cohorteError } = await client
    .from('talleres_crecimiento_cohortes')
    .select('id, taller_id')
    .eq('id', grupo.cohorte_id)
    .maybeSingle()

  if (cohorteError || !cohorteRow) return null
  const cohorte = cohorteRow as { id: string; taller_id: string }

  return {
    id: grupo.id,
    nombre: grupo.nombre,
    capacidad: grupo.capacidad,
    estado: grupo.estado,
    cohorteId: grupo.cohorte_id,
    edicionId: cohorte.taller_id,
  }
}

// ─── Mi asignación (the gate's degraded-state escape hatch) ─────────────

export interface MiAsignacionGrupo {
  readonly id: string
  readonly rol: 'lider' | 'voluntario'
  readonly activo: boolean
}

interface AsignacionQueryClient {
  from(table: 'taller_grupo_asignaciones'): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          eq(column: string, value: unknown): {
            maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

/**
 * Reads the caller's OWN taller_grupo_asignaciones row for this grupo —
 * the one row taller_grupo_asignaciones_select always lets a caller read
 * regardless of capability (persona_id = caller's own usuarios.id).
 * Distinguishes "this grupo doesn't exist / isn't yours" (null — 404)
 * from "it's yours but the full record is RLS-hidden" (honest limited
 * state) without granting anything new.
 */
export async function loadMiAsignacionGrupo(
  client: AsignacionQueryClient,
  grupoId: string,
  personaId: string,
): Promise<MiAsignacionGrupo | null> {
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .select('id, rol, activo')
    .eq('grupo_id', grupoId)
    .eq('persona_id', personaId)
    .eq('activo', true)
    .maybeSingle()

  if (error || !data) return null
  return data as MiAsignacionGrupo
}

// ─── Equipo resolver (public-safe org-node check) ───────────────────────

interface RpcClient {
  rpc(
    name: 'talleres_equipo_de_grupo',
    args: { p_grupo_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Wraps the existing talleres_equipo_de_grupo(uuid) SECURITY DEFINER
 * resolver (EXECUTE already granted to `authenticated`; already used
 * inside taller_grupos'/taller_sesiones' own RLS). Lets the page confirm
 * "this grupo belongs to this taller" in the degraded path, without any
 * SELECT on taller_grupos and without any new grant.
 */
export async function resolveEquipoDeGrupo(
  client: RpcClient,
  grupoId: string,
): Promise<string | null> {
  const { data, error } = await client.rpc('talleres_equipo_de_grupo', { p_grupo_id: grupoId })
  if (error || typeof data !== 'string') return null
  return data
}

// ─── Es miembro del grupo (T2, odd/tasks/talleres-lider-identidad.md) ───

interface EsMiembroClient {
  rpc(
    name: 'talleres_es_miembro_del_grupo',
    args: { p_grupo_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Wraps talleres_es_miembro_del_grupo(uuid) (T1, migration
 * 20260924150000_talleres_lider_identidad.sql): true when the caller has
 * an ACTIVE taller_grupo_asignaciones row for this grupo (líder or
 * voluntario). STAGING only until T3 ships it to production — fails soft
 * to false on any error, including 42883 "function does not exist" on an
 * environment that doesn't have it yet, and on a rejected client call, so
 * the page never crashes and simply keeps the degraded state.
 *
 * Deliberately its own boolean, not folded into talleres_mis_permisos:
 * that RPC answers "what can I do at this org-chart node", and a grupo is
 * not a node (T1's Decisiones) — two different questions, two functions.
 */
export async function loadEsMiembroDelGrupo(
  client: EsMiembroClient,
  grupoId: string,
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('talleres_es_miembro_del_grupo', { p_grupo_id: grupoId })
    if (error || typeof data !== 'boolean') return false
    return data
  } catch {
    return false
  }
}

interface RolEnGrupoClient {
  rpc(
    name: 'talleres_rol_en_grupo',
    args: { p_grupo_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * T3 — wraps talleres_rol_en_grupo(uuid) (T1): 'lider' | 'voluntario' | NULL
 * for the CALLER in this grupo. This is what decides who may pass list and
 * who may close a class; the capability tree is consulted only as a
 * supervisor fallback (`permisos.gestionarGrupos`).
 *
 * Fails soft to `null` (an outsider), never throws: the page renders the
 * read view either way, and a missing function on an environment without
 * T1 must not blank the screen.
 */
export async function loadRolEnGrupo(
  client: RolEnGrupoClient,
  grupoId: string,
): Promise<'lider' | 'voluntario' | null> {
  try {
    const { data, error } = await client.rpc('talleres_rol_en_grupo', { p_grupo_id: grupoId })
    if (error || (data !== 'lider' && data !== 'voluntario')) return null
    return data
  } catch {
    return null
  }
}

// ─── Su gente (equipo: líder/voluntarios) ───────────────────────────────

export interface GrupoAsignacionPersona {
  readonly id: string
  readonly personaId: string
  readonly rol: 'lider' | 'voluntario'
  /** Degrades to '—' when the RPC can't resolve a name — never drops the row (T6b rule). */
  readonly nombre: string
}

interface GrupoEquipoClient {
  rpc(
    name: 'talleres_grupo_equipo_personas',
    args: { p_grupo_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

interface SesionesQueryClient {
  from(table: 'taller_sesiones'): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
          data: unknown[] | null
          error: { message: string } | null
        }>
      }
    }
  }
}

function nombreCompleto(nombre: unknown, apellido: unknown): string {
  return [nombre, apellido]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
}

/**
 * "Equipo" (líder/voluntarios). Names resolve through the
 * talleres_grupo_equipo_personas(uuid) RPC (T1, migration
 * 20260924150000_talleres_lider_identidad.sql), which mirrors
 * taller_grupo_asignaciones_select — replacing the old usuarios(...)
 * embed, which degraded to nothing for every viewer this task could
 * construct (puede_ver_usuario is a Grupos de Vida concept, unrelated to
 * talleres). A missing name degrades to '—' — the row is never dropped
 * (T6b rule, same as loadGrupoInscripciones/loadAsistenciaPorClase
 * below). Inactive asignaciones (activo=false) are filtered out
 * client-side — the RPC itself doesn't filter on it.
 */
export async function loadGrupoAsignaciones(
  client: GrupoEquipoClient,
  grupoId: string,
): Promise<readonly GrupoAsignacionPersona[]> {
  const { data, error } = await client.rpc('talleres_grupo_equipo_personas', { p_grupo_id: grupoId })
  if (error || !Array.isArray(data)) return []

  return (data as Array<{
    asignacion_id: string
    persona_id: string
    rol: 'lider' | 'voluntario'
    activo: boolean
    nombre: unknown
    apellido: unknown
  }>)
    .filter((row) => row.activo)
    .map((row) => ({
      id: row.asignacion_id,
      personaId: row.persona_id,
      rol: row.rol,
      nombre: nombreCompleto(row.nombre, row.apellido) || '—',
    }))
}

// ─── Su gente real (T2, odd/tasks/talleres-inscripcion-a-grupo.md) ──────

export interface GrupoInscripcionPersona {
  readonly id: string
  readonly personaId: string
  /** Degrades to '—' when the RPC can't resolve a name — never drops the row (T6b rule). */
  readonly nombre: string
}

export interface GrupoInscripciones {
  readonly aprobadas: readonly GrupoInscripcionPersona[]
  readonly retiradas: readonly GrupoInscripcionPersona[]
}

interface GrupoInscripcionesClient {
  from(table: 'taller_inscripciones'): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
          data: unknown[] | null
          error: { message: string } | null
        }>
      }
    }
  }
  rpc(
    name: 'talleres_coord_inscripciones_personas',
    args: { p_inscripcion_ids: readonly string[] },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * "Su gente" — the inscripciones actually placed in this grupo
 * (taller_inscripciones.grupo_id, T1 of this task), split into aprobadas
 * (the group's current roster, counted toward ocupación by the caller)
 * and retiradas (kept for history — grupo_id is never cleared on
 * retiro — shown separately and never counted). Any other estado
 * (pendiente, no_aprobado, completado) never carries a grupo_id per the
 * RPC's own guard, so this query naturally excludes them.
 *
 * Names resolve via the existing talleres_coord_inscripciones_personas
 * RPC (same one admin-inscripciones.ts / operacional.ts already call) —
 * a missing resolution degrades to '—' rather than dropping the row.
 */
export async function loadGrupoInscripciones(
  client: GrupoInscripcionesClient,
  grupoId: string,
): Promise<GrupoInscripciones> {
  const { data, error } = await client
    .from('taller_inscripciones')
    .select('id, persona_principal_id, companero_id, estado')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: true })

  if (error || !data) return { aprobadas: [], retiradas: [] }

  const rows = data as Array<{
    id: string
    persona_principal_id: string
    companero_id: string | null
    estado: string
  }>

  const inscripcionIds = rows.map((r) => r.id)
  const personasByInscripcion = new Map<string, string>()
  if (inscripcionIds.length > 0) {
    const { data: personasData } = await client.rpc('talleres_coord_inscripciones_personas', {
      p_inscripcion_ids: inscripcionIds,
    })
    const personas = (personasData ?? []) as Array<{
      inscripcion_id: string
      pp_nombre: string | null
      pp_apellido: string | null
    }>
    for (const p of personas) {
      personasByInscripcion.set(p.inscripcion_id, nombreCompleto(p.pp_nombre, p.pp_apellido))
    }
  }

  const toPersona = (r: (typeof rows)[number]): GrupoInscripcionPersona => ({
    id: r.id,
    personaId: r.persona_principal_id,
    nombre: personasByInscripcion.get(r.id) || '—',
  })

  return {
    aprobadas: rows.filter((r) => r.estado === 'aprobado').map(toPersona),
    retiradas: rows.filter((r) => r.estado === 'retirado').map(toPersona),
  }
}

// ─── Grupos de una cohorte (T3, opciones del selector de asignación) ────

export interface GrupoOpcion {
  readonly id: string
  readonly nombre: string
}

interface GruposDeCohorteClient {
  from(table: 'taller_grupos'): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
          data: unknown[] | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/**
 * The grupos of one cohorte, for the Inscritos bulk-assign selector
 * (T3, odd/tasks/talleres-inscripcion-a-grupo.md). Ordered by nombre.
 */
export async function loadGruposDeCohorte(
  client: GruposDeCohorteClient,
  cohorteId: string,
): Promise<readonly GrupoOpcion[]> {
  const { data, error } = await client
    .from('taller_grupos')
    .select('id, nombre')
    .eq('cohorte_id', cohorteId)
    .order('nombre', { ascending: true })

  if (error || !data) return []
  return data as GrupoOpcion[]
}

// ─── Clases ──────────────────────────────────────────────────────────────

export interface GrupoSesion {
  readonly id: string
  readonly numero: number
  readonly fechaProgramada: string
  readonly fechaRealizada: string | null
  readonly estado: 'programada' | 'en_curso' | 'cerrada' | 'cancelada'
  /** taller_sesiones.tema (T1, 20260925090000) — the clase's own name; NULL until the líder writes one. */
  readonly tema: string | null
}

/**
 * The grupo's clases, ordered by número. `tema` is taller_sesiones' class
 * name (T1, odd/tasks/talleres-asistencia-lider.md) — added because docs
 * §9 asks the UI to show "Clase {numero} · {tema}"; it is NULL for a
 * clase the líder hasn't named yet, and the read view falls back to
 * "Clase {numero}" rather than inventing a name.
 */
export async function loadGrupoSesiones(
  client: SesionesQueryClient,
  grupoId: string,
): Promise<readonly GrupoSesion[]> {
  const { data, error } = await client
    .from('taller_sesiones')
    .select('id, numero, fecha_programada, fecha_realizada, estado, tema')
    .eq('grupo_id', grupoId)
    .order('numero', { ascending: true })

  if (error || !data) return []
  return data.map((row) => {
    const r = row as {
      id: string
      numero: number
      fecha_programada: string
      fecha_realizada: string | null
      estado: GrupoSesion['estado']
      tema: string | null
    }
    return {
      id: r.id,
      numero: r.numero,
      fechaProgramada: r.fecha_programada,
      fechaRealizada: r.fecha_realizada,
      estado: r.estado,
      tema: r.tema ?? null,
    }
  })
}

// ─── Asistencia (read-only; marking form is paso 7) ─────────────────────

export interface AsistenciaPersonaRow {
  readonly id: string
  /** taller_asistencias.inscripcion_id — the RPC's batch key (T3). */
  readonly inscripcionId: string
  readonly personaId: string
  readonly nombre: string
  readonly estado: 'presente' | 'ausente' | 'no_aplica'
  /** taller_asistencias.motivo (T1) — only meaningful when estado='ausente' (DB CHECK); NULL otherwise. */
  readonly motivo: string | null
}

interface AsistenciaQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
          data: unknown[] | null
          error: { message: string } | null
        }>
      }
    }
  }
  rpc(
    name: 'talleres_coord_inscripciones_personas',
    args: { p_inscripcion_ids: readonly string[] },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Read-only attendance for one clase, by person NAME — never a raw
 * identifier — reusing the EXISTING talleres_coord_inscripciones_personas
 * RPC (operacional.ts's loadCoordInscripcionesPendientes already calls
 * it) rather than a new DB function.
 *
 * T2 (odd/tasks/talleres-asistencia-lider.md): also exposes
 * taller_asistencias.motivo (T1's column, the absence reason the read
 * view shows under an ausente, mirroring Grupos de Vida's AttendanceList).
 * The DB CHECK only allows a motivo when estado='ausente', so any other
 * row is mapped to NULL, never to a stale string.
 */
export async function loadAsistenciaPorClase(
  client: AsistenciaQueryClient,
  sesionId: string,
): Promise<readonly AsistenciaPersonaRow[]> {
  const { data, error } = await client
    .from('taller_asistencias')
    .select('id, persona_id, inscripcion_id, estado, motivo')
    .eq('sesion_id', sesionId)
    .order('created_at', { ascending: true })

  if (error || !data || data.length === 0) return []

  const rows = data as Array<{
    id: string
    persona_id: string
    inscripcion_id: string
    estado: AsistenciaPersonaRow['estado']
    motivo: string | null
  }>
  const inscripcionIds = Array.from(new Set(rows.map((r) => r.inscripcion_id)))

  const { data: personasData } = await client.rpc('talleres_coord_inscripciones_personas', {
    p_inscripcion_ids: inscripcionIds,
  })
  const personas = (personasData ?? []) as Array<{
    inscripcion_id: string
    pp_nombre: string | null
    pp_apellido: string | null
  }>
  const nombreByInscripcion = new Map(
    personas.map((p) => [p.inscripcion_id, nombreCompleto(p.pp_nombre, p.pp_apellido)]),
  )

  return rows.map((r) => ({
    id: r.id,
    inscripcionId: r.inscripcion_id,
    personaId: r.persona_id,
    nombre: nombreByInscripcion.get(r.inscripcion_id) || '—',
    estado: r.estado,
    motivo: r.estado === 'ausente' ? r.motivo ?? null : null,
  }))
}

// ─── Reporte ─────────────────────────────────────────────────────────────

export interface GrupoReporte {
  readonly id: string
  readonly estado: 'borrador' | 'enviado' | 'reabierto' | 'cerrado'
  readonly observacionesGenerales: string
  readonly firmaLiderFecha: string | null
  readonly reabiertoMotivo: string | null
}

interface ReporteQueryClient {
  from(table: 'taller_reportes'): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts?: { ascending?: boolean }): {
          limit(count: number): {
            maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

/** Ports loadEquipoReporte's query shape (operacional.ts) for the grupo's own page. */
export async function loadGrupoReporte(
  client: ReporteQueryClient,
  grupoId: string,
): Promise<GrupoReporte | null> {
  const { data, error } = await client
    .from('taller_reportes')
    .select('id, estado, observaciones_generales, firma_lider_fecha, reabierto_motivo')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const row = data as {
    id: string
    estado: GrupoReporte['estado']
    observaciones_generales: string
    firma_lider_fecha: string | null
    reabierto_motivo: string | null
  }
  return {
    id: row.id,
    estado: row.estado,
    observacionesGenerales: row.observaciones_generales,
    firmaLiderFecha: row.firma_lider_fecha,
    reabiertoMotivo: row.reabierto_motivo,
  }
}
