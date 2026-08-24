/**
 * PR19 — DT-078 — /talleres/coordinacion/solicitudes (C).
 * Solicitudes de retiro pendientes + resolución inline (aprobar/rechazar).
 *
 * The coordinator resolves requests scoped to their assigned equipo:
 * `loadCoordSolicitudes` already filters to the rows the RLS lets them
 * see, and the resolve RPC (`talleres_resolver_solicitud_retiro`,
 * wired via the server actions below) re-checks the scope server-side —
 * a coordinator can only resolve solicitudes of their own talleres.
 *
 * Resolve controls only render for a `pendiente` solicitud; terminal
 * states (aprobada / rechazada) show a read-only badge.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import {
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'
import { ResolverSolicitudRetiroControls } from '@/components/talleres/resolver-solicitud-retiro-controls'

import {
  loadCoordSolicitudes,
  requireOperacionalRole,
  type CoordSolicitudRow,
} from '@/lib/platform/talleres/operacional'
import {
  aprobarSolicitudRetiroAction,
  rechazarSolicitudRetiroAction,
} from '@/lib/platform/talleres/solicitudes-retiro-actions'

export const metadata = { title: 'Solicitudes de Retiro' }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function tipoLabel(tipo: CoordSolicitudRow['tipo']): string {
  return tipo === 'participante_retiro'
    ? 'Retiro de participante'
    : 'Retiro definitivo del equipo'
}

function estadoVariante(
  estado: CoordSolicitudRow['estado'],
): 'success' | 'warning' | 'error' | 'default' {
  switch (estado) {
    case 'aprobada':
      return 'success'
    case 'pendiente':
      return 'warning'
    case 'rechazada':
      return 'error'
    default:
      return 'default'
  }
}

function estadoLabel(estado: CoordSolicitudRow['estado']): string {
  switch (estado) {
    case 'aprobada':
      return 'Aprobada'
    case 'pendiente':
      return 'Pendiente'
    case 'rechazada':
      return 'Rechazada'
    default:
      return estado
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TextoSistema className="font-medium">
                      Solicitud {r.id.slice(0, 8)}…
                    </TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-xs">
                      {tipoLabel(r.tipo)} · {formatDate(r.created_at)}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante={estadoVariante(r.estado)} tamaño="sm">
                    {estadoLabel(r.estado)}
                  </BadgeSistema>
                </div>
                <TextoSistema className="mt-2 block text-sm">{r.motivo}</TextoSistema>
                {r.estado === 'pendiente' && (
                  <div className="mt-3 flex justify-end">
                    <ResolverSolicitudRetiroControls
                      solicitudId={r.id}
                      onAprobar={aprobarSolicitudRetiroAction}
                      onRechazar={rechazarSolicitudRetiroAction}
                    />
                  </div>
                )}
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
