
import { PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketCreateForm } from './support-ticket-create-form'

export default async function ReportarPage() {
  return (
    <PaginaSistema titulo="Reportar un problema" ancho="form" regreso={{ href: '/ayuda', texto: 'Volver a Ayuda' }}>
      <TarjetaSistema className="p-4 sm:p-6">
        <SupportTicketCreateForm appBuildVersion={process.env.NEXT_PUBLIC_APP_VERSION ?? ''} />
      </TarjetaSistema>
    </PaginaSistema>
  )
}
