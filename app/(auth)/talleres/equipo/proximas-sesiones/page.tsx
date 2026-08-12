/**
 * PR19 — DT-077 — /talleres/equipo/proximas-sesiones (L).
 * Lista de sesiones próximas para los grupos donde lidera.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Calendar } from 'lucide-react'

import {
  loadEquipoProximasSesiones,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Próximas Sesiones' }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function ProximasSesionesPage() {
  const ctx = await requireOperacionalRole()
  const sesiones = await loadEquipoProximasSesiones(ctx)

  return (
    <DashboardPage
      titulo="Próximas Sesiones"
      subtitulo="Sesiones programadas/en curso para tus grupos."
    >
      {sesiones.length === 0 ? (
        <EmptyState message="No hay sesiones próximas." />
      ) : (
        <ul className="grid gap-3">
          {sesiones.map((s) => (
            <li key={s.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <TextoSistema className="font-medium">Sesión #{s.numero}</TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      Programada para {formatDate(s.fecha_programada)}
                    </TextoSistema>
                    <div className="mt-2">
                      <BadgeSistema>{s.estado}</BadgeSistema>
                    </div>
                  </div>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
