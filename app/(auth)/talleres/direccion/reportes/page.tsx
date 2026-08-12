/**
 * PR19 — DT-079 — /talleres/direccion/reportes (D).
 * Igual a coordinacion/reportes pero con BadgeSistema counter.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordReportes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Reportes (Dirección)' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function DirReportesPage() {
  const ctx = await requireOperacionalRole()
  const reportes = await loadCoordReportes(ctx)

  // Count by estado for the counter badges.
  const counts: Record<string, number> = {}
  for (const r of reportes) counts[r.estado] = (counts[r.estado] ?? 0) + 1

  return (
    <DashboardPage
      titulo="Reportes"
      subtitulo="Vista global con conteo por estado."
      botonRegreso={{ href: '/talleres/direccion', texto: 'Dirección' }}
    >
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([estado, count]) => (
          <BadgeSistema key={estado} variante="info">
            {estado}: {count}
          </BadgeSistema>
        ))}
      </div>
      {reportes.length === 0 ? (
        <EmptyState message="No hay reportes." />
      ) : (
        <ul className="grid gap-3">
          {reportes.map((r) => (
            <li key={r.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <TextoSistema className="font-medium">Reporte {r.id.slice(0, 8)}…</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  Grupo {r.grupo_id.slice(0, 8)}… · Firmado {formatDate(r.firma_lider_fecha)}
                </TextoSistema>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema>{r.estado}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
