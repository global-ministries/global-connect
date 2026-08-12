/**
 * PR19 — DT-079 — /talleres/direccion/periodos (D).
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadDirPeriodos,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Periodos' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function PeriodosPage() {
  const ctx = await requireOperacionalRole()
  const periodos = await loadDirPeriodos(ctx)

  return (
    <DashboardPage
      titulo="Periodos"
      botonRegreso={{ href: '/talleres/direccion', texto: 'Dirección' }}
    >
      {periodos.length === 0 ? (
        <EmptyState message="No hay periodos registrados." />
      ) : (
        <ul className="grid gap-3">
          {periodos.map((p) => (
            <li key={p.id}>
              <TarjetaSistema variante="outlined" className="p-4">
                <TextoSistema className="font-medium">{p.edicion_label}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-sm">
                  Cierre real: {formatDate(p.fecha_cierre_real)}
                </TextoSistema>
                <div className="mt-2">
                  <BadgeSistema>{p.fecha_cierre_real ? 'cerrado' : 'abierto'}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
