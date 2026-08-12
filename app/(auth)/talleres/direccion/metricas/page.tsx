/**
 * PR19 — DT-079 — /talleres/direccion/metricas (D).
 * Lista de talleres con un input para consultar metricas via API.
 * (Server action call deferred to PR20+/Post-MVP — page shows form).
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadDirTalleres,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Métricas' }

export default async function MetricasPage() {
  const ctx = await requireOperacionalRole()
  const talleres = await loadDirTalleres(ctx)

  return (
    <DashboardPage
      titulo="Métricas"
      subtitulo="Seleccioná un taller para ver sus métricas via API."
      botonRegreso={{ href: '/talleres/direccion', texto: 'Dirección' }}
    >
      {talleres.length === 0 ? (
        <EmptyState message="No hay talleres para consultar." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {talleres.map((t) => (
            <li key={t.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <TextoSistema className="font-medium">{t.nombre_snapshot}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  {t.total_inscripciones} inscripciones
                </TextoSistema>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema>{t.estado}</BadgeSistema>
                  <BadgeSistema variante="info">{t.edicion}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
