/**
 * PR19 — DT-078 — /talleres/coordinacion/solicitudes (C).
 * Solicitudes de retiro pendientes.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordSolicitudes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Solicitudes de Retiro' }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function SolicitudesPage() {
  const ctx = await requireOperacionalRole()
  const rows = await loadCoordSolicitudes(ctx)

  return (
    <DashboardPage
      titulo="Solicitudes de Retiro"
      botonRegreso={{ href: '/talleres/coordinacion', texto: 'Coordinación' }}
    >
      {rows.length === 0 ? (
        <EmptyState message="No hay solicitudes registradas." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <TextoSistema className="font-medium">Solicitud {r.id.slice(0, 8)}…</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  {formatDate(r.created_at)}
                </TextoSistema>
                <TextoSistema className="mt-2 block text-sm">{r.motivo}</TextoSistema>
                <div className="mt-2">
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
