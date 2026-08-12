/**
 * PR19 — DT-077 — /talleres/equipo/mis-grupos/[id]/reporte (L).
 * Reporte final del grupo que lidera. Solo lectura para L.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadEquipoGrupos,
  loadEquipoReporte,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Reporte Final' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function ReportePage(ctx: RouteContext) {
  const participant = await requireOperacionalRole()
  const { id: grupoId } = await ctx.params

  // Verify the leader owns this grupo.
  const grupos = await loadEquipoGrupos(participant)
  const ownsGrupo = grupos.some((g) => g.id === grupoId)
  if (!ownsGrupo) {
    return (
      <DashboardPage titulo="Reporte Final">
        <EmptyState message="No lideras este grupo." />
      </DashboardPage>
    )
  }

  const reporte = await loadEquipoReporte(participant, grupoId)
  return (
    <DashboardPage titulo="Reporte Final" subtitulo={`Grupo ${grupoId}`}>
      {!reporte ? (
        <EmptyState message="Aún no hay reporte para este grupo." />
      ) : (
        <TarjetaSistema variante="elevated" className="p-4">
          <TextoSistema className="font-medium">Reporte {reporte.id}</TextoSistema>
          <TextoSistema variante="sutil" className="mt-1 block text-sm">
            {reporte.observaciones_generales || '(sin observaciones)'}
          </TextoSistema>
          <div className="mt-3 flex flex-wrap gap-2">
            <BadgeSistema>{reporte.estado}</BadgeSistema>
            {reporte.firma_lider_fecha && (
              <BadgeSistema variante="success">Firmado {formatDate(reporte.firma_lider_fecha)}</BadgeSistema>
            )}
            {reporte.reabierto_motivo && (
              <BadgeSistema variante="error">Reabierto</BadgeSistema>
            )}
          </div>
        </TarjetaSistema>
      )}
    </DashboardPage>
  )
}
