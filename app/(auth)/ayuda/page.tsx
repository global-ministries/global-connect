import Link from 'next/link'
import { FileText, History } from 'lucide-react'

import { BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

export default async function AyudaPage() {
  return (
<ContenedorDashboard titulo="Ayuda" descripcion="Reporta problemas y da seguimiento a tus solicitudes desde un solo lugar.">
        <div className="grid gap-4 md:grid-cols-2">
          <TarjetaSistema className="space-y-4">
            <FileText className="h-8 w-8 text-[var(--brand-primary)]" />
            <div className="space-y-2">
              <TituloSistema nivel={2}>Reportar un problema</TituloSistema>
              <TextoSistema variante="sutil">Envia al equipo de soporte los pasos y diagnosticos seguros sin exponer datos privados del navegador.</TextoSistema>
            </div>
            <Link href="/ayuda/reportar">
              <BotonSistema>Reportar un problema</BotonSistema>
            </Link>
          </TarjetaSistema>

          <TarjetaSistema className="space-y-4">
            <History className="h-8 w-8 text-[var(--brand-primary)]" />
            <div className="space-y-2">
              <TituloSistema nivel={2}>Historial de tickets</TituloSistema>
              <TextoSistema variante="sutil">Revisa el estado de tus reportes y responde cuando soporte necesite mas informacion.</TextoSistema>
            </div>
            <Link href="/ayuda/tickets">
              <BotonSistema variante="outline">Ver mis tickets</BotonSistema>
            </Link>
          </TarjetaSistema>
        </div>
      </ContenedorDashboard>
)
}
