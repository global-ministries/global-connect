/**
 * PR19 — DT-077 — /talleres/equipo/recursos (L).
 * Lista de recursos del taller — projection desde taller_grupos.recursos_snapshot.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { BookMarked } from 'lucide-react'

import {
  loadEquipoGrupos,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Recursos' }

export default async function RecursosPage() {
  const ctx = await requireOperacionalRole()
  const grupos = await loadEquipoGrupos(ctx)

  return (
    <DashboardPage
      titulo="Recursos"
      subtitulo="Recursos asignados a tus grupos (snapshot)."
    >
      {grupos.length === 0 ? (
        <EmptyState message="No tenés recursos asignados." />
      ) : (
        <ul className="grid gap-3">
          {grupos.map((g) => (
            <li key={g.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <div className="flex items-start gap-3">
                  <BookMarked className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <TextoSistema className="font-medium">{g.nombre}</TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      Recursos snapshot cargados desde la configuración del taller.
                    </TextoSistema>
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
