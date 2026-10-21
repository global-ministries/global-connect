
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketCreateForm } from './support-ticket-create-form'

export default async function ReportarPage() {
  return (
    <PaginaSistema titulo="Reportar un problema" regreso={{ href: '/ayuda', texto: 'Volver a Ayuda' }}>
      <SupportTicketCreateForm appBuildVersion={process.env.NEXT_PUBLIC_APP_VERSION ?? ''} />
    </PaginaSistema>
  )
}
