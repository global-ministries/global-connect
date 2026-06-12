import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketCreateForm } from './support-ticket-create-form'

export default async function ReportarPage() {
  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Reportar un problema" botonRegreso={{ href: '/ayuda', texto: 'Volver a Ayuda' }}>
        <TarjetaSistema>
          <SupportTicketCreateForm appBuildVersion={process.env.NEXT_PUBLIC_APP_VERSION ?? ''} />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
