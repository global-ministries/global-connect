import Link from 'next/link'
import { FileText, History } from 'lucide-react'

import { BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

export default async function AyudaPage() {
  return (
    <ContenedorDashboard titulo="Help" descripcion="Report problems and follow support updates from one place.">
      <div className="grid gap-4 md:grid-cols-2">
        <TarjetaSistema className="space-y-4">
          <FileText className="h-8 w-8 text-[var(--brand-primary)]" />
          <div className="space-y-2">
            <TituloSistema nivel={2}>Report a problem</TituloSistema>
            <TextoSistema variante="sutil">Send the support team safe steps and diagnostics without exposing private browser data.</TextoSistema>
          </div>
          <Link href="/ayuda/reportar">
            <BotonSistema>Report a problem</BotonSistema>
          </Link>
        </TarjetaSistema>

        <TarjetaSistema className="space-y-4">
          <History className="h-8 w-8 text-[var(--brand-primary)]" />
          <div className="space-y-2">
            <TituloSistema nivel={2}>Ticket history</TituloSistema>
            <TextoSistema variante="sutil">Review the status of your reports and reply when support needs more information.</TextoSistema>
          </div>
          <Link href="/ayuda/tickets">
            <BotonSistema variante="outline">View my tickets</BotonSistema>
          </Link>
        </TarjetaSistema>
      </div>
    </ContenedorDashboard>
  )
}
