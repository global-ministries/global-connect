/**
 * PR19 — DT-078 — /talleres/coordinacion/talleres (C).
 *
 * Lists the DISTINCT abstract talleres, with their ediciones (occurrences)
 * grouped underneath — not one card per edición.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordTalleresAgrupados,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Talleres' }

export default async function TalleresPage() {
  const ctx = await requireOperacionalRole()
  const talleres = await loadCoordTalleresAgrupados(ctx)

  return (
    <DashboardPage
      titulo="Talleres"
      botonRegreso={{ href: '/talleres/coordinacion', texto: 'Coordinación' }}
    >
      {talleres.length === 0 ? (
        <EmptyState message="No hay talleres registrados." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {talleres.map((t) => (
            <li key={t.taller_id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <TextoSistema className="font-medium">{t.taller_nombre}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-xs">
                  {t.ediciones.length}{' '}
                  {t.ediciones.length === 1 ? 'edición' : 'ediciones'}
                </TextoSistema>
                <ul className="mt-3 space-y-2">
                  {t.ediciones.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 border-t border-black/5 pt-2"
                    >
                      <TextoSistema variante="sutil" className="text-sm">
                        {e.nombre_snapshot} · {e.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                      </TextoSistema>
                      <BadgeSistema>{e.estado}</BadgeSistema>
                    </li>
                  ))}
                </ul>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
