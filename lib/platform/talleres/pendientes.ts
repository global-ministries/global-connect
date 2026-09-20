/**
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — loaders for
 * `/talleres/pendientes`, the coordinator's cross-taller inbox: "¿qué
 * espera mi decisión?", across every taller the viewer reaches. It
 * replaces `/talleres/coordinacion/inscripciones`,
 * `/talleres/coordinacion/solicitudes`, `/talleres/direccion/solicitudes`
 * and the cross-edición half of `/admin/talleres/inscripciones` (the
 * "pendiente" slice — the admin page's full multi-estado audit filter
 * has no 1:1 replacement here; see rutas.ts).
 *
 * ─── Decision: which inscripciones loader this reuses, and why ──────────
 *
 * Two candidates existed: `loadAdminInscripciones` (admin-inscripciones.ts)
 * and `loadCoordInscripcionesPendientes` (operacional.ts). The admin
 * loader embeds `usuarios!persona_principal_id` directly in its SELECT.
 * That embed runs under the CALLER's own `usuarios` RLS — and T5's
 * staging evidence (supabase/tests/talleres-t5-lider-lectura.test.sql,
 * finding 5) proved `usuarios` visibility is denied "for ANY viewer, not
 * just a zero-capability one" unless they hold `puede_ver_usuario`
 * (a Grupos de Vida concept) or an admin/pastor/director-general system
 * role. A plain coordinador (coordinator.read/write only) has NEITHER —
 * so the admin loader's embed resolves to `null`, and its own
 * `if (!persona) continue` SILENTLY DROPS every row for that viewer.
 * (This is a live bug in `/talleres/[taller]/[edicion]`, which already
 * uses `loadAdminInscripciones` for a single-edición view scoped by
 * `cargarPermisos` — not this task's page to fix, reported separately.)
 *
 * `loadCoordInscripcionesPendientes` avoids that trap: it selects only
 * scalar FK columns (no `usuarios` embed) and resolves names via the
 * SECURITY DEFINER RPC `talleres_coord_inscripciones_personas`, which
 * re-applies the exact `taller_inscripciones_select` policy internally
 * and never drops an RLS-visible row. This module reuses that loader
 * unchanged (never re-implements its join) and adds exactly the one
 * thing it's missing for a CROSS-taller inbox: each row's owning equipo
 * (`dream_team_equipo_id`), via one extra batched `talleres` lookup keyed
 * by the distinct `taller_id`s already present in the returned rows.
 *
 * The estado='pendiente' filter and the 50-row cap are both preserved
 * from `loadCoordInscripcionesPendientes` — the cap's own rationale
 * ("a coordinator should never see hundreds of pendientes at once; if
 * there are more, the workflow needs tightening, not pagination") holds
 * even more once the inbox spans every taller a viewer reaches, not just
 * one equipo.
 *
 * ─── Solicitudes de retiro ────────────────────────────────────────────
 *
 * `loadCoordSolicitudes` returns every solicitud regardless of estado and
 * carries no taller/edición/equipo information at all. This module
 * reuses it (per this task's instruction), filters to estado='pendiente'
 * client-side, and resolves each row's equipo via the existing SECURITY
 * DEFINER RPC `talleres_equipo_de_solicitud(inscripcion_id,
 * grupo_asignacion_id)` — the SAME resolver
 * `talleres_resolver_solicitud_retiro` already calls internally, so this
 * never re-derives the participante-vs-equipo target logic by hand. A
 * `taller_solicitudes_retiro` row carries exactly one of
 * (inscripcion_id, grupo_asignacion_id) depending on `tipo` (the table's
 * own xor CHECK constraint) — the RPC takes both and figures out which
 * applies.
 */

import {
  loadCoordInscripcionesPendientes,
  loadCoordSolicitudes,
  type CoordSolicitudRow,
  type OperacionalContext,
} from './operacional'
import type { InscripcionAdminRow } from './inscripciones-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

/**
 * `loadCoordInscripcionesPendientes` / `loadCoordSolicitudes` only ever
 * read `ctx.supabase` — neither touches `personaId`, `role` or
 * `capabilities` (verified by reading both function bodies). This page
 * resolves session without a role (per docs/talleres-de-punta-a-
 * punta.md's "el rol deja de vivir en la URL" — the gate is flag then
 * session, not flag then role), so this adapter exists solely to satisfy
 * the two functions' existing `OperacionalContext` parameter without
 * resurrecting role resolution here.
 */
function toLegacyCtx(client: AnyClient): OperacionalContext {
  return { supabase: client, personaId: '', role: 'C', capabilities: [] }
}

// ─── Inscripciones ──────────────────────────────────────────────────────

export interface PendientesInscripcionesResult {
  readonly rows: readonly InscripcionAdminRow[]
  /** `taller.id` (the abstract taller, same value as `row.taller_id`) -> `taller.dream_team_equipo_id`. */
  readonly equipoIdByTallerId: ReadonlyMap<string, string | null>
}

export async function loadPendientesInscripciones(
  client: AnyClient,
): Promise<PendientesInscripcionesResult> {
  const rows = await loadCoordInscripcionesPendientes(toLegacyCtx(client))

  const tallerIds = Array.from(new Set(rows.map((r) => r.taller_id)))
  const equipoIdByTallerId = new Map<string, string | null>()
  if (tallerIds.length > 0) {
    const { data } = await client.from('talleres').select('id, dream_team_equipo_id').in('id', tallerIds)
    for (const t of (data ?? []) as Array<{ id: string; dream_team_equipo_id: string | null }>) {
      equipoIdByTallerId.set(t.id, t.dream_team_equipo_id ?? null)
    }
  }

  return { rows, equipoIdByTallerId }
}

// ─── Solicitudes de retiro ──────────────────────────────────────────────

export interface PendienteSolicitudRow extends CoordSolicitudRow {
  readonly equipoId: string | null
  readonly tallerNombre: string | null
  readonly tallerSlug: string | null
}

export async function loadPendientesSolicitudes(
  client: AnyClient,
): Promise<readonly PendienteSolicitudRow[]> {
  const all = await loadCoordSolicitudes(toLegacyCtx(client))
  const pendientes = all.filter((s) => s.estado === 'pendiente')
  if (pendientes.length === 0) return []

  const equipoIdBySolicitud = new Map<string, string | null>()
  await Promise.all(
    pendientes.map(async (s) => {
      const { data } = await client.rpc('talleres_equipo_de_solicitud', {
        p_inscripcion_id: s.inscripcion_id,
        p_grupo_asignacion_id: s.grupo_asignacion_id,
      })
      equipoIdBySolicitud.set(s.id, (data as string | null) ?? null)
    }),
  )

  const distinctEquipoIds = Array.from(
    new Set(Array.from(equipoIdBySolicitud.values()).filter((id): id is string => id !== null)),
  )
  const tallerByEquipoId = new Map<string, { nombre: string; slug: string }>()
  if (distinctEquipoIds.length > 0) {
    const { data } = await client
      .from('talleres')
      .select('nombre, slug, dream_team_equipo_id')
      .in('dream_team_equipo_id', distinctEquipoIds)
    for (const t of (data ?? []) as Array<{
      nombre: string
      slug: string
      dream_team_equipo_id: string | null
    }>) {
      if (t.dream_team_equipo_id) {
        tallerByEquipoId.set(t.dream_team_equipo_id, { nombre: t.nombre, slug: t.slug })
      }
    }
  }

  return pendientes.map((s) => {
    const equipoId = equipoIdBySolicitud.get(s.id) ?? null
    const taller = equipoId ? tallerByEquipoId.get(equipoId) : undefined
    return {
      ...s,
      equipoId,
      tallerNombre: taller?.nombre ?? null,
      tallerSlug: taller?.slug ?? null,
    }
  })
}
