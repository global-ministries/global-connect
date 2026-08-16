/**
 * PR29-D — Helper module for admin-facing `Ediciones Globales` UI.
 *
 * Mirrors the admin-side data shape of the new global-ediciones
 * feature added in PR29-B (additive table + junction) and PR29-C
 * (6 SECURITY DEFINER RPCs). This helper is UI-layer only — all
 * mutations go through the 6 RPCs (`create_edicion_global`,
 * `open_edicion_global`, `close_edicion_global`,
 * `cancel_edicion_global`, `add_taller_to_edicion_global`,
 * `remove_taller_from_edicion_global`); the SQL functions re-check
 * the capability gate, so the server-side `requireEdicionesGlobalesRole`
 * below is defense-in-depth.
 *
 * Capability gate: `talleres_crecimiento.director.write` OR
 *                  `talleres_crecimiento.admin.manage`.
 *
 * Out of scope:
 *   - Mutations (delegated to the per-page server actions — see
 *     `app/(auth)/admin/talleres/ediciones-globales/[id]/actions.ts`
 *     and `nueva/actions.ts`).
 *   - Capability model (unchanged from PR25).
 *
 * This file is NOT in the byte-identity protected list. It is a
 * brand-new module introduced in PR29-D.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

// ─── Types ────────────────────────────────────────────────────────────────

/** Estado machine de `taller_ediciones_globales.estado` (DB CHECK constraint). */
export type EdicionGlobalEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'

/** Row of `taller_ediciones_globales` joined with participant count. */
export interface EdicionGlobal {
  readonly id: string
  readonly nombre: string
  readonly slug: string
  readonly descripcion: string | null
  readonly fecha_apertura: string
  readonly fecha_cierre: string
  readonly estado: EdicionGlobalEstado
  readonly created_by_persona_id: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly version: number
  readonly participantes_count: number
}

/** A taller that participates in an edicion global. */
export interface TallerParticipante {
  readonly id: string
  readonly slug: string
  readonly nombre: string
  readonly modalidad_default: 'periodo_general' | 'permanente_custom'
  readonly estado: 'active' | 'archived'
  /** `taller_ediciones.id` for this taller's local edition (taller_ediciones has edicion_global_id). */
  readonly edicion_local_id: string | null
  /** Estado of the local edition (the column on `taller_ediciones` table). */
  readonly edicion_local_estado:
    | 'borrador'
    | 'abierto'
    | 'en_curso'
    | 'cerrado'
    | 'cancelado'
    | null
}

/** Detail view = EdicionGlobal + the list of participantes. */
export interface EdicionGlobalDetalle extends EdicionGlobal {
  readonly participantes: ReadonlyArray<TallerParticipante>
}

// ─── Capability gate (server-side helper) ────────────────────────────────

/**
 * Discriminated result of `requireEdicionesGlobalesRole()`. Mirrors
 * the pattern used in other admin pages (createTallerAbstract,
 * openEdicion). When `ok: false` the caller should short-circuit with
 * the appropriate UI surface (e.g. an "Acceso denegado" card).
 */
export type EdicionesGlobalesRoleGate =
  | {
      readonly ok: true
      readonly supabase: SupabaseClient
      readonly personaId: string
    }
  | {
      readonly ok: false
      readonly error: 'not-found' | 'unauthorized' | 'forbidden'
    }

/**
 * Server-side capability check for administering ediciones globales.
 *
 * Returns the supabase client + personaId when the user holds either
 * `talleres_crecimiento.director.write` or
 * `talleres_crecimiento.admin.manage`. The 6 RPCs in PR29-C re-check
 * the same gate via `auth_has_talleres_capability` so this is
 * defense-in-depth + a single place to refactor the UI's auth flow.
 *
 * Status semantics:
 *   - `not-found` when the talleres feature flag is off (kill switch
 *     wins — the whole surface disappears, even for admins).
 *   - `unauthorized` when there's no authed user OR no persona could
 *     be resolved for them.
 *   - `forbidden` when the user holds neither director.write nor
 *     admin.manage.
 */
export async function requireEdicionesGlobalesRole(): Promise<EdicionesGlobalesRoleGate> {
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

  return { ok: true, supabase, personaId: session.personaId }
}

// ─── Loaders (read-only, server-side) ────────────────────────────────────

/**
 * Loads all ediciones globales ordered by `fecha_apertura DESC`,
 * each joined with a `participantes_count` from the junction table.
 *
 * Returns `[]` on error so callers can render an empty state without
 * branching on supabase error shape — the page-level error path is
 * rendered via the kill-switch card already.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase rpc/select returns untyped for new tables
export async function loadEdicionesGlobales(client: any): Promise<EdicionGlobal[]> {
  const { data, error } = await client
    .from('taller_ediciones_globales')
    .select(
      'id, nombre, slug, descripcion, fecha_apertura, fecha_cierre, estado, created_by_persona_id, created_at, updated_at, version, taller_edicion_global_participantes(count)',
    )
    .order('fecha_apertura', { ascending: false })
    .limit(200)

  if (error || !data) return []

  // Supabase returns the join as `{ taller_edicion_global_participantes: [{ count: N }] }`
  return (data as Array<Record<string, unknown>>).map((row) => {
    const join = row.taller_edicion_global_participantes
    const count = Array.isArray(join)
      ? Number((join[0] as { count?: number } | undefined)?.count ?? 0)
      : 0
    return {
      id: row.id as string,
      nombre: row.nombre as string,
      slug: row.slug as string,
      descripcion: (row.descripcion as string | null) ?? null,
      fecha_apertura: row.fecha_apertura as string,
      fecha_cierre: row.fecha_cierre as string,
      estado: row.estado as EdicionGlobalEstado,
      created_by_persona_id: (row.created_by_persona_id as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      version: Number(row.version ?? 1),
      participantes_count: count,
    }
  })
}

/**
 * Loads a single edicion global by id along with its participantes
 * (the talleres associated via the junction table). Returns null if
 * not found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase rpc/select returns untyped for new tables
export async function loadEdicionGlobalById(client: any, id: string): Promise<EdicionGlobalDetalle | null> {
  const { data: globalRow, error: globalError } = await client
    .from('taller_ediciones_globales')
    .select(
      'id, nombre, slug, descripcion, fecha_apertura, fecha_cierre, estado, created_by_persona_id, created_at, updated_at, version',
    )
    .eq('id', id)
    .maybeSingle()

  if (globalError || !globalRow) return null

  const { data: participantesRows } = await client
    .from('taller_edicion_global_participantes')
    .select(
      'taller_id, talleres:talleres!inner(id, slug, nombre, modalidad_default, estado), taller_ediciones(id, estado)',
    )
    .eq('edicion_global_id', id)

  const participantes: TallerParticipante[] = (participantesRows ?? []).map(
    (row: Record<string, unknown>) => {
      const taller = row.talleres as {
        id: string
        slug: string
        nombre: string
        modalidad_default: 'periodo_general' | 'permanente_custom'
        estado: 'active' | 'archived'
      }
      const local = row.taller_ediciones as
        | Array<{ id: string; estado: TallerParticipante['edicion_local_estado'] }>
        | { id: string; estado: TallerParticipante['edicion_local_estado'] }
        | null
      let edicionLocalId: string | null = null
      let edicionLocalEstado: TallerParticipante['edicion_local_estado'] = null
      if (Array.isArray(local) && local.length > 0) {
        edicionLocalId = local[0]!.id
        edicionLocalEstado = local[0]!.estado ?? null
      } else if (local && !Array.isArray(local)) {
        edicionLocalId = local.id
        edicionLocalEstado = local.estado ?? null
      }
      return {
        id: taller.id,
        slug: taller.slug,
        nombre: taller.nombre,
        modalidad_default: taller.modalidad_default,
        estado: taller.estado,
        edicion_local_id: edicionLocalId,
        edicion_local_estado: edicionLocalEstado,
      }
    },
  )

  const base: EdicionGlobal = {
    id: globalRow.id as string,
    nombre: globalRow.nombre as string,
    slug: globalRow.slug as string,
    descripcion: (globalRow.descripcion as string | null) ?? null,
    fecha_apertura: globalRow.fecha_apertura as string,
    fecha_cierre: globalRow.fecha_cierre as string,
    estado: globalRow.estado as EdicionGlobalEstado,
    created_by_persona_id: (globalRow.created_by_persona_id as string | null) ?? null,
    created_at: globalRow.created_at as string,
    updated_at: globalRow.updated_at as string,
    version: Number(globalRow.version ?? 1),
    participantes_count: participantes.length,
  }

  return { ...base, participantes }
}

/**
 * Result of `loadTalleresDisponibles`. `disponibles` is the list of
 * active talleres NOT yet associated with the global (the "add taller"
 * dropdown options). `totalActivos` is the count of all active talleres
 * in the DB — used by the UI to distinguish "no active talleres exist"
 * from "all active talleres are already in this edition".
 */
export interface TalleresDisponiblesResult {
  readonly disponibles: ReadonlyArray<TallerParticipante>
  /** Total active talleres in `public.talleres` (before filtering by junction). */
  readonly totalActivos: number
}

/**
 * Loads the list of talleres activos (not archived) that are NOT yet
 * associated with the given edicion global. Used by the "agregar
 * taller" dropdown.
 *
 * Returns `{ disponibles: [], totalActivos: 0 }` on error. Errors are
 * logged to the server console so a silent failure (RLS denial,
 * schema cache miss, FK resolution failure, etc.) is visible in the
 * server logs instead of being collapsed to an empty state in the UI.
 *
 * The `totalActivos` field exists so the UI can render a precise
 * message when `disponibles` is empty: if `totalActivos === 0` the DB
 * genuinely has no active talleres; if `totalActivos > 0` then all
 * active talleres are already in the global (no UX action needed).
 */
export async function loadTalleresDisponibles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase select returns untyped for new tables
  client: any,
  edicionGlobalId: string,
): Promise<TalleresDisponiblesResult> {
  // Step 1: talleres already in this global. We also capture the error
  // here so we can log it: a silent failure would be a false negative
  // (the dropdown would offer talleres already in the global, and the
  // RPC's UNIQUE constraint would reject the add).
  const { data: yaEnGlobal, error: yaEnGlobalError } = await client
    .from('taller_edicion_global_participantes')
    .select('taller_id')
    .eq('edicion_global_id', edicionGlobalId)
  if (yaEnGlobalError) {
    console.error(
      '[ediciones-globales] loadTalleresDisponibles: ' +
      'taller_edicion_global_participantes query failed ' +
      `(edicion_global_id=${edicionGlobalId})`,
      yaEnGlobalError,
    )
  }
  const yaEnGlobalIds = new Set(
    ((yaEnGlobal ?? []) as Array<{ taller_id: string }>).map((r) => r.taller_id),
  )

  // Step 2: all active talleres. Errors are logged to the server console
  // so silent failures (RLS denial, schema cache miss, FK resolution
  // failure, etc.) show up in the server logs instead of being
  // collapsed to an empty `[]` in the UI.
  const { data: talleresActivos, error } = await client
    .from('talleres')
    .select('id, slug, nombre, modalidad_default, estado')
    .eq('estado', 'active')
    .order('nombre', { ascending: true })
    .limit(500)
  if (error) {
    console.error(
      '[ediciones-globales] loadTalleresDisponibles: ' +
      'talleres query failed ' +
      `(edicion_global_id=${edicionGlobalId})`,
      error,
    )
    return { disponibles: [], totalActivos: 0 }
  }
  if (!talleresActivos) {
    console.error(
      '[ediciones-globales] loadTalleresDisponibles: ' +
      'talleres query returned null data without error — unexpected ' +
      `(edicion_global_id=${edicionGlobalId})`,
    )
    return { disponibles: [], totalActivos: 0 }
  }

  const disponibles = (talleresActivos as Array<Omit<TallerParticipante, 'edicion_local_id' | 'edicion_local_estado'>>)
    .filter((t) => !yaEnGlobalIds.has(t.id))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      modalidad_default: t.modalidad_default,
      estado: t.estado,
      edicion_local_id: null,
      edicion_local_estado: null,
    }))
  return { disponibles, totalActivos: talleresActivos.length }
}