import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { obtenerDatosDashboard } from '@/lib/dashboard/obtenerDatosDashboard'
import DashboardAdmin from '@/components/dashboard/roles/DashboardAdmin'
import DashboardDirector from '@/components/dashboard/roles/DashboardDirector'
import DashboardLider from '@/components/dashboard/roles/DashboardLider'
import DashboardMiembro from '@/components/dashboard/roles/DashboardMiembro'

export const dynamic = 'force-dynamic'

export default async function PaginaTablero() {
  const data = await obtenerDatosDashboard()

  const titulo = 'Dashboard'
  const descripcion =
    data.rol === 'admin' || data.rol === 'pastor' || data.rol === 'director-general'
      ? 'Visión estratégica global de la organización'
      : data.rol === 'director-etapa'
      ? 'Supervisión y gestión de tu etapa'
      : data.rol === 'lider'
      ? 'Gestión operativa de tu(s) grupo(s)'
      : 'Conexión e información personal'

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo={titulo} descripcion={descripcion}>
        {data.rol === 'admin' || data.rol === 'pastor' || data.rol === 'director-general' ? (
          <DashboardAdmin data={data.widgets} />
        ) : data.rol === 'director-etapa' ? (
          <DashboardDirector data={data.widgets} />
        ) : data.rol === 'lider' ? (
          <DashboardLider data={data.widgets} />
        ) : (
          <DashboardMiembro data={data.widgets} />
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}