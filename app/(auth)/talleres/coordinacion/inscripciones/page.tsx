/**
 * PR19 — DT-078 — /talleres/coordinacion/inscripciones (C).
 * Inscripciones pendientes (no_aprobado motivo visible).
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordInscripcionesPendientes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Inscripciones Pendientes' }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function InscripcionesPage() {
  const ctx = await requireOperacionalRole()
  const rows = await loadCoordInscripcionesPendientes(ctx)

  return (
    <DashboardPage
      titulo="Inscripciones Pendientes"
      botonRegreso={{ href: '/talleres/coordinacion', texto: 'Coordinación' }}
    >
      {rows.length === 0 ? (
        <EmptyState message="No hay inscripciones pendientes." />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <TextoSistema className="font-medium">Inscripción {r.id.slice(0, 8)}…</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  Taller {r.taller_id.slice(0, 8)}… · {formatDate(r.created_at)}
                </TextoSistema>
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
