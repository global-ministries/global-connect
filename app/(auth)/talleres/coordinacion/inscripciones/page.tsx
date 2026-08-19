/**
 * PR19 + redesign — DT-078 — /talleres/coordinacion/inscripciones (C).
 *
 * Coordinator view of pendiente inscripciones. Restricted via
 * `requireOperacionalRole()` (PR19). The page renders the same
 * `<TablaInscripciones>` shared with the global admin surface and
 * passes the shared approve/reject server actions as props.
 *
 * The loader (`loadCoordInscripcionesPendientes`) now returns the
 * same `InscripcionAdminRow` shape as the admin loader so the
 * shared table can render both feeds without code duplication.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'

import {
  loadCoordInscripcionesPendientes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'
import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from '@/lib/platform/talleres/inscripciones-actions'

export const metadata = { title: 'Inscripciones Pendientes' }

export default async function InscripcionesPage() {
  const ctx = await requireOperacionalRole()
  const rows = await loadCoordInscripcionesPendientes(ctx)

  // The coordinator role holds `coordinator.write` (or `director.write`
  // / `admin.manage`) — same multi-cap gate as the global page.
  const hasWrite =
    ctx.capabilities.includes('talleres_crecimiento.coordinator.write') ||
    ctx.capabilities.includes('talleres_crecimiento.director.write') ||
    ctx.capabilities.includes('talleres_crecimiento.admin.manage')

  return (
    <DashboardPage
      titulo="Inscripciones Pendientes"
      subtitulo="Aprobá o rechazá las inscripciones que esperan revisión."
      botonRegreso={{ href: '/talleres/coordinacion', texto: 'Coordinación' }}
    >
      {rows.length === 0 ? (
        <EmptyState message="No hay inscripciones pendientes." />
      ) : (
        <TablaInscripciones
          rows={rows}
          canWrite={hasWrite}
          onApprove={approveInscripcionAction}
          onReject={rejectInscripcionAction}
        />
      )}
    </DashboardPage>
  )
}