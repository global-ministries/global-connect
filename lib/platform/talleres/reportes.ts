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

import { finalizationRateByTaller } from './metrics'
import { loadGrupoDetalle } from './grupo-detalle'
import {
  loadCoordReportes,
  loadCoordTalleresAgrupados,
  loadEdicionLocalDetalle,
  type CoordReporte,
  type OperacionalContext,
} from './operacional'
import { cargarPermisosPorEquipos } from './permisos'
import type { EdicionReporte, EstadoEdicionReporte } from './reportes-vista'

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
  /**
   * R3g (odd/tasks/talleres-rediseno.md) — the grupo's nombre and edición,
   * via the existing loadGrupoDetalle; null when the grupo cannot be read
   * (the row still renders, T6b's rule).
   */
  readonly grupoNombre: string | null
  readonly edicionId: string | null
}

export async function loadReportes(client: AnyClient): Promise<readonly ReporteRow[]> {
  const reportes = await loadCoordReportes(toLegacyCtx(client))
  if (reportes.length === 0) return []

  const equipoIdByGrupoId = new Map<string, string | null>()
  const grupoById = new Map<string, Awaited<ReturnType<typeof loadGrupoDetalle>>>()
  await Promise.all(
    Array.from(new Set(reportes.map((r) => r.grupo_id))).map(async (grupoId) => {
      const [{ data }, grupo] = await Promise.all([
        client.rpc('talleres_equipo_de_grupo', { p_grupo_id: grupoId }),
        loadGrupoDetalle(client, grupoId).catch(() => null),
      ])
      equipoIdByGrupoId.set(grupoId, (data as string | null) ?? null)
      grupoById.set(grupoId, grupo)
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
    const grupo = grupoById.get(r.grupo_id) ?? null
    return {
      ...r,
      equipoId,
      tallerNombre: equipoId ? tallerNombreByEquipoId.get(equipoId) ?? null : null,
      grupoNombre: grupo?.nombre ?? null,
      edicionId: grupo?.edicionId ?? null,
    }
  })
}

/**
 * R3g (odd/tasks/talleres-rediseno.md, S4) — the ediciones behind the «Por
 * taller» and «Por edición» tabs. Composes loaders that already exist, no new
 * query: loadCoordTalleresAgrupados (every edición RLS lets the viewer read,
 * grouped by taller), loadEdicionLocalDetalle per edición (inscripciones,
 * certificados, dates, the cohorte's equipo) and finalizationRateByTaller
 * (completados; its `taller_id` filter is the edición id, see PR42).
 *
 * Authority: an edición counts only where the viewer holds `verReportes`
 * (talleres_mis_permisos, T1) on its equipo — the cohorte's
 * dream_team_equipo_id, the same node talleres_equipo_de_edicion resolves.
 * An edición whose equipo is unknown never counts (safe default). Borrador
 * and cancelada ediciones are skipped before loading anything.
 *
 * Cost: one detail (5 reads) and one finalization read per edición, in
 * parallel. Fine for a church's yearly ediciones; a single aggregate RPC
 * would replace it if that grows.
 */
export async function loadEdicionesReporte(client: AnyClient): Promise<readonly EdicionReporte[]> {
  const talleres = await loadCoordTalleresAgrupados(toLegacyCtx(client))
  const ids = talleres.flatMap((t) =>
    t.ediciones.filter((e) => e.estado !== 'borrador' && e.estado !== 'cancelado').map((e) => e.id),
  )
  if (ids.length === 0) return []

  const leidas = await Promise.all(
    ids.map(async (id) => {
      const [detalle, fin] = await Promise.all([
        loadEdicionLocalDetalle(client, id).catch(() => null),
        finalizationRateByTaller(client, id).catch(() => null),
      ])
      return detalle ? { detalle, fin } : null
    }),
  )
  const ediciones = leidas.filter((l): l is NonNullable<typeof l> => l !== null)

  const equipos = ediciones.map((e) => e.detalle.cohorte?.dream_team_equipo_id ?? null).filter((id): id is string => id !== null)
  const permisos = await cargarPermisosPorEquipos(client, equipos)

  return ediciones
    .filter(({ detalle }) => {
      const equipo = detalle.cohorte?.dream_team_equipo_id ?? null
      return equipo !== null && permisos.get(equipo)?.verReportes === true
    })
    .map(({ detalle, fin }) => {
      const conResultado = fin?.totalConEstadoFinal ?? 0
      return {
        id: detalle.id,
        tallerId: detalle.taller_id,
        tallerNombre: detalle.taller_nombre,
        tallerSlug: detalle.taller_slug || null,
        nombre: detalle.nombre_snapshot,
        estado: detalle.estado as EstadoEdicionReporte,
        fechaInicio: (detalle.fecha_inicio ?? detalle.cohorte?.started_at ?? null)?.slice(0, 10) ?? null,
        fechaFin: detalle.fecha_fin?.slice(0, 10) ?? null,
        cerradaEn: detalle.cerrada_en,
        inscripciones: detalle.inscripciones_count,
        certificados: detalle.certificados_count,
        completaron: fin && conResultado > 0 ? fin.completados : null,
        conResultado,
      }
    })
}
