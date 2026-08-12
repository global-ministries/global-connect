/**
 * PR19 — DT-079 — /talleres/direccion/talleres (D).
 * Lista completa con total_inscripciones.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadDirTalleres,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Talleres (Dirección)' }

export default async function DirTalleresPage() {
  const ctx = await requireOperacionalRole()
  const talleres = await loadDirTalleres(ctx)

  return (
    <DashboardPage
      titulo="Talleres"
      botonRegreso={{ href: '/talleres/direccion', texto: 'Dirección' }}
    >
      {talleres.length === 0 ? (
        <EmptyState message="No hay talleres registrados." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {talleres.map((t) => (
            <li key={t.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <TextoSistema className="font-medium">{t.nombre_snapshot}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  Edición {t.edicion} · {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                </TextoSistema>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema>{t.estado}</BadgeSistema>
                  <BadgeSistema variante="info">{t.total_inscripciones} inscripciones</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
