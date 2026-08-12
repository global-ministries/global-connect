/**
 * PR19 — DT-079 — /talleres/direccion (D) index/resumen.
 * 4 counter badges via BadgeSistema — sin métricas sensibles.
 */
import { DashboardPage } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadDirResumen,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Dirección' }

interface CounterRow {
  readonly label: string
  readonly value: number
  readonly href: string
}

export default async function DireccionIndexPage() {
  const ctx = await requireOperacionalRole()
  const counts = await loadDirResumen(ctx)

  const counters: readonly CounterRow[] = [
    { label: 'Talleres activos', value: counts.talleres_activos, href: '/talleres/direccion/talleres' },
    { label: 'Inscripciones pendientes', value: counts.inscripciones_pendientes, href: '/talleres/coordinacion/inscripciones' },
    { label: 'Solicitudes pendientes', value: counts.solicitudes_pendientes, href: '/talleres/direccion/solicitudes' },
    { label: 'Certificados emitidos', value: counts.certificados_emitidos, href: '/talleres/direccion/reportes' },
  ]

  return (
    <DashboardPage
      titulo="Dirección"
      subtitulo="Vista global del programa de Talleres de Crecimiento."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {counters.map((c) => (
          <li key={c.label}>
            <a href={c.href}>
              <TarjetaSistema variante="elevated" className="p-4 transition hover:shadow-md">
                <TextoSistema variante="sutil" className="text-xs">{c.label}</TextoSistema>
                <TextoSistema className="mt-1 text-3xl font-semibold">{c.value}</TextoSistema>
                <div className="mt-3">
                  <BadgeSistema variante="info">{c.href.split('/').pop()}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </a>
          </li>
        ))}
      </ul>
    </DashboardPage>
  )
}
