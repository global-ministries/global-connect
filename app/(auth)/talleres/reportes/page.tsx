/**
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/reportes,
 * replacing the role-prefixed pair app/(auth)/talleres/coordinacion/reportes
 * and app/(auth)/talleres/direccion/reportes (both kept alive, unmodified,
 * until T10 deletes them — see lib/platform/talleres/rutas.ts).
 *
 * The parent's diff of the two old pages (2026-09-20) found they call the
 * SAME loader (loadCoordReportes) and differ in exactly three things:
 *   1. the director variant adds an estado-count BadgeSistema row,
 *      computed in the page with a plain `for` loop;
 *   2. different metadata.title / botonRegreso;
 *   3. a REGRESSION — the director variant silently lost the
 *      coordinador variant's `{r.reabierto_motivo && <BadgeSistema
 *      variante="error">Reabierto</BadgeSistema>}` badge. Fixed here:
 *      every viewer always sees the Reabierto badge — exactly the drift
 *      this consolidation exists to kill.
 *
 * GATE, same shape as /talleres/pendientes (T6): flag -> user -> session,
 * each an informational card. No role required — RLS on taller_reportes
 * decides which rows come back (docs/talleres-de-punta-a-punta.md §9,
 * "el rol deja de vivir en la URL").
 *
 * COUNTER ROW: the estado-count summary is NOT a director-only feature —
 * it is gated on BREADTH, not role. It shows only when the viewer holds
 * `verReportes` (talleres_mis_permisos, T1) for MORE THAN ONE distinct
 * equipo among the reportes actually visible to them: the same signal a
 * coordinador of several talleres or a real director both produce, and a
 * coordinador of exactly one taller never does (a one-taller summary adds
 * nothing the list below doesn't already show). Resolved via
 * cargarPermisosPorEquipos (T1/T6), never a role check — RLS already
 * decided which rows exist; this only decides whether to show the
 * summary widget, per the "se esconde el control, no se deshabilita" rule.
 * A viewer whose verReportes is false for a given equipo never counts
 * that equipo toward breadth, even if a row for it is (for some other
 * reason) visible — the safe default stays "hide the summary".
 *
 * IDENTITY: this screen touches no `usuarios` data (the old pages never
 * did either) — nothing to degrade. The only extra data it resolves is
 * each reporte's owning taller (via talleres_equipo_de_grupo, the SAME
 * resolver taller_reportes' own RLS policies use — see reportes.ts), so a
 * viewer scoped to several talleres can tell which is which instead of a
 * bare grupo_id slice. A reporte whose equipo cannot be resolved is never
 * dropped (T6b's rule) — it still renders, with an em-dash where the
 * taller name would go.
 */

import { FileText } from 'lucide-react'

import {
  ContenedorDashboard,
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { reporteEstadoLabel, reporteEstadoBadgeVariante } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadReportes } from '@/lib/platform/talleres/reportes'
import { cargarPermisosPorEquipos } from '@/lib/platform/talleres/permisos'

export const metadata = { title: 'Reportes' }

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function ReportesPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Reportes">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Reportes">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <ContenedorDashboard titulo="Reportes">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const rows = await loadReportes(client)

  const equipoIds = Array.from(new Set(rows.map((r) => r.equipoId)))
  const permisosPorEquipo = await cargarPermisosPorEquipos(client, equipoIds)
  const equiposConVerReportes = equipoIds.filter(
    (id) => permisosPorEquipo.get(id)?.verReportes === true,
  )
  const mostrarContadores = equiposConVerReportes.length > 1

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.estado, (counts.get(r.estado) ?? 0) + 1)

  return (
    <ContenedorDashboard
      titulo="Reportes"
      subtitulo="Reportes finales de cada grupo, en todos tus talleres."
    >
      {mostrarContadores && (
        <div className="flex flex-wrap gap-2">
          {Array.from(counts.entries()).map(([estado, count]) => (
            <BadgeSistema key={estado} variante="info">
              {reporteEstadoLabel(estado)}: {count}
            </BadgeSistema>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EstadoVacio icono={FileText} titulo="No hay reportes todavía" />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="hidden md:block overflow-hidden">
            <TarjetaSistema className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Taller
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Firmado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {r.tallerNombre ?? <span className="text-muted-foreground/50">—</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Grupo {r.grupo_id.slice(0, 8)}…
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <BadgeSistema variante={reporteEstadoBadgeVariante(r.estado)} tamaño="sm">
                            {reporteEstadoLabel(r.estado)}
                          </BadgeSistema>
                          {r.reabierto_motivo && (
                            <BadgeSistema variante="error" tamaño="sm">
                              Reabierto
                            </BadgeSistema>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatFecha(r.firma_lider_fecha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TarjetaSistema>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <TarjetaSistema key={r.id} variante="outlined" className="p-4">
                <TextoSistema className="text-sm font-medium">{r.tallerNombre ?? '—'}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-xs">
                  Grupo {r.grupo_id.slice(0, 8)}… · Firmado {formatFecha(r.firma_lider_fecha)}
                </TextoSistema>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema variante={reporteEstadoBadgeVariante(r.estado)} tamaño="sm">
                    {reporteEstadoLabel(r.estado)}
                  </BadgeSistema>
                  {r.reabierto_motivo && (
                    <BadgeSistema variante="error" tamaño="sm">
                      Reabierto
                    </BadgeSistema>
                  )}
                </div>
              </TarjetaSistema>
            ))}
          </div>
        </>
      )}
    </ContenedorDashboard>
  )
}
