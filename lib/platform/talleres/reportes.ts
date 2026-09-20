/**
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — loader for
 * /talleres/reportes, the consolidated read-only reportes list. Replaces
 * app/(auth)/talleres/coordinacion/reportes and app/(auth)/talleres/
 * direccion/reportes (both kept alive, unmodified, until T10 deletes
 * them — see rutas.ts) — a diff of the two showed they are copy-paste
 * siblings calling the SAME loadCoordReportes, differing only in:
 *   1. the director variant's estado-count BadgeSistema row;
 *   2. metadata.title / botonRegreso;
 *   3. a REGRESSION — the director variant silently dropped the
 *      coordinador variant's `reabierto_motivo` badge.
 * All three are resolved in the consolidated page (page.tsx), not here.
 *
 * `loadCoordReportes` (operacional.ts) selects `taller_reportes` with no
 * taller/equipo context at all — RLS decides which rows return, but the
 * page still needs each row's owning equipo to resolve
 * `talleres_mis_permisos` per node (T1) and to show WHICH taller a
 * report belongs to (the old screens showed nothing but a raw grupo_id
 * slice). This module adds exactly that: each row's equipo id via the
 * existing SECURITY DEFINER RPC `talleres_equipo_de_grupo(grupo_id)` —
 * the SAME resolver the `taller_reportes_select`/`_insert`/`_update` RLS
 * policies use internally (supabase/migrations/20260821000004_
 * cimiento3a_talleres_coordinador_scope_rls.sql) — and the owning
 * taller's nombre via one batched `talleres` lookup keyed by the
 * distinct equipo ids, mirroring loadPendientesSolicitudes's exact
 * pattern (pendientes.ts, T6).
 */

import { loadCoordReportes, type CoordReporte, type OperacionalContext } from './operacional'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
type AnyClient = any

/**
 * `loadCoordReportes` only ever reads `ctx.supabase` (verified by reading
 * its body) — this page resolves session without a role (per docs/
 * talleres-de-punta-a-punta.md's "el rol deja de vivir en la URL"), same
 * reasoning as pendientes.ts's own `toLegacyCtx`.
 */
function toLegacyCtx(client: AnyClient): OperacionalContext {
  return { supabase: client, personaId: '', role: 'C', capabilities: [] }
}

export interface ReporteRow extends CoordReporte {
  readonly equipoId: string | null
  readonly tallerNombre: string | null
}

export async function loadReportes(client: AnyClient): Promise<readonly ReporteRow[]> {
  const reportes = await loadCoordReportes(toLegacyCtx(client))
  if (reportes.length === 0) return []

  const equipoIdByGrupoId = new Map<string, string | null>()
  await Promise.all(
    reportes.map(async (r) => {
      const { data } = await client.rpc('talleres_equipo_de_grupo', { p_grupo_id: r.grupo_id })
      equipoIdByGrupoId.set(r.grupo_id, (data as string | null) ?? null)
    }),
  )

  const distinctEquipoIds = Array.from(
    new Set(Array.from(equipoIdByGrupoId.values()).filter((id): id is string => id !== null)),
  )
  const tallerNombreByEquipoId = new Map<string, string>()
  if (distinctEquipoIds.length > 0) {
    const { data } = await client
      .from('talleres')
      .select('nombre, dream_team_equipo_id')
      .in('dream_team_equipo_id', distinctEquipoIds)
    for (const t of (data ?? []) as Array<{ nombre: string; dream_team_equipo_id: string | null }>) {
      if (t.dream_team_equipo_id) tallerNombreByEquipoId.set(t.dream_team_equipo_id, t.nombre)
    }
  }

  return reportes.map((r) => {
    const equipoId = equipoIdByGrupoId.get(r.grupo_id) ?? null
    return {
      ...r,
      equipoId,
      tallerNombre: equipoId ? tallerNombreByEquipoId.get(equipoId) ?? null : null,
    }
  })
}
