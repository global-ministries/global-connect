/**
 * PR19 — DT-077 — /talleres/equipo/mis-grupos (L).
 * Lists grupos where the leader is assigned (rol='lider').
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Users } from 'lucide-react'

import {
  loadEquipoGrupos,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Mis Grupos' }

export default async function MisGruposPage() {
  const ctx = await requireOperacionalRole()
  const grupos = await loadEquipoGrupos(ctx)

  return (
    <DashboardPage
      titulo="Mis Grupos"
      subtitulo="Grupos donde lideras sesiones o reportes finales."
    >
      {grupos.length === 0 ? (
        <EmptyState message="No tienes grupos asignados todavía." />
      ) : (
        <ul className="grid gap-3">
          {grupos.map((g) => (
            <li key={g.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <TextoSistema className="font-medium">{g.nombre}</TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      Capacidad {g.capacidad}
                    </TextoSistema>
                    <div className="mt-2">
                      <BadgeSistema>{g.estado}</BadgeSistema>
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
