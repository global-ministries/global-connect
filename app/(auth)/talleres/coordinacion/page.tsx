/**
 * PR19 — DT-078 — /talleres/coordinacion (C) index/resumen.
 * Tarjeta resumen con counters (inscripciones pendientes, etc.).
 */
import { DashboardPage } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import {
  loadCoordInscripcionesPendientes,
  loadCoordTalleresAgrupados,
  loadCoordReportes,
  loadCoordSolicitudes,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Coordinación' }

export default async function CoordinacionIndexPage() {
  const ctx = await requireOperacionalRole()
  const [inscripciones, talleres, reportes, solicitudes] = await Promise.all([
    loadCoordInscripcionesPendientes(ctx),
    loadCoordTalleresAgrupados(ctx),
    loadCoordReportes(ctx),
    loadCoordSolicitudes(ctx),
  ])

  const counters: ReadonlyArray<{ readonly label: string; readonly value: number; readonly href: string }> = [
    { label: 'Inscripciones pendientes', value: inscripciones.length, href: '/talleres/coordinacion/inscripciones' },
    { label: 'Talleres', value: talleres.length, href: '/talleres/coordinacion/talleres' },
    { label: 'Reportes', value: reportes.length, href: '/talleres/coordinacion/reportes' },
    { label: 'Solicitudes de retiro', value: solicitudes.length, href: '/talleres/coordinacion/solicitudes' },
  ]

  return (
    <DashboardPage
      titulo="Coordinación"
      subtitulo="Resumen operacional de tu alcance como coordinador/a."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {counters.map((c) => (
          <li key={c.label}>
            <a href={c.href}>
              <TarjetaSistema variante="elevated" className="p-4 transition hover:shadow-md">
                <TextoSistema variante="sutil" className="text-xs">{c.label}</TextoSistema>
                <TextoSistema className="mt-1 text-3xl font-semibold">{c.value}</TextoSistema>
              </TarjetaSistema>
            </a>
          </li>
        ))}
      </ul>
    </DashboardPage>
  )
}
