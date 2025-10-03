import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import DashboardClient from '@/components/dashboard/DashboardClient'
import { obtenerBaselineStats } from '@/lib/dashboard/baselineStats'

export const dynamic = 'force-dynamic'

export default async function PaginaTablero() {
  const stats = await obtenerBaselineStats()
  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Dashboard"
        subtitulo="Resumen interactivo de tu comunidad"
      >
        <DashboardClient stats={stats} />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}