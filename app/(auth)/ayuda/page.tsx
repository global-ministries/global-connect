import Link from 'next/link'
import { FileText, History } from 'lucide-react'

import { BotonSistema, PaginaSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

export default async function AyudaPage() {
  return (
    <PaginaSistema titulo="Ayuda" descripcion="Reporta problemas y da seguimiento a tus solicitudes desde un solo lugar.">
      <div className="grid gap-4 md:grid-cols-2">
        <TarjetaSistema className="flex flex-col gap-4">
          <FileText className="h-8 w-8 text-brand" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <TituloSistema nivel={2}>Reportar un problema</TituloSistema>
            <TextoSistema variante="sutil">Envia al equipo de soporte los pasos y diagnosticos seguros sin exponer datos privados del navegador.</TextoSistema>
          </div>
          <BotonSistema asChild className="w-full sm:w-auto sm:self-start">
            <Link href="/ayuda/reportar">Reportar un problema</Link>
          </BotonSistema>
        </TarjetaSistema>

        <TarjetaSistema className="flex flex-col gap-4">
          <History className="h-8 w-8 text-brand" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <TituloSistema nivel={2}>Historial de tickets</TituloSistema>
            <TextoSistema variante="sutil">Revisa el estado de tus reportes y responde cuando soporte necesite mas informacion.</TextoSistema>
          </div>
          <BotonSistema asChild variante="outline" className="w-full sm:w-auto sm:self-start">
            <Link href="/ayuda/tickets">Ver mis tickets</Link>
          </BotonSistema>
        </TarjetaSistema>
      </div>
    </PaginaSistema>
  )
}
