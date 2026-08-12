/**
 * PR19 — DT-078 — /talleres/coordinacion/reportes (C).
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordReportes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Reportes' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function ReportesPage() {
  const ctx = await requireOperacionalRole()
  const reportes = await loadCoordReportes(ctx)

  return (
    <DashboardPage
      titulo="Reportes"
      botonRegreso={{ href: '/talleres/coordinacion', texto: 'Coordinación' }}
    >
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
                  {r.reabierto_motivo && <BadgeSistema variante="error">Reabierto</BadgeSistema>}
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
