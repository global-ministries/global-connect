import Link from 'next/link'

import { listSupportTickets } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function TicketsPage() {
  const result = await listSupportTickets()
  const tickets = result.success ? result.tickets : []

  return (
    <ContenedorDashboard titulo="Mis tickets de soporte" accionPrincipal={<Link href="/ayuda/reportar"><BotonSistema tamaño="sm">Nuevo ticket</BotonSistema></Link>}>
      <div className="space-y-3">
        {tickets.length === 0 ? (
          <TarjetaSistema><TextoSistema variante="sutil">Todavia no has enviado tickets de soporte.</TextoSistema></TarjetaSistema>
        ) : tickets.map((ticket) => (
          <Link key={ticket.id} href={`/ayuda/tickets/${ticket.id}`} className="block focus-ring rounded-2xl">
            <TarjetaSistema className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-foreground">#{ticket.ticketNumber} {ticket.title}</p>
                <TextoSistema variante="sutil" tamaño="sm">{formatSupportCategory(ticket.category)} · {formatSupportSeverity(ticket.severity)}</TextoSistema>
              </div>
              <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>
            </TarjetaSistema>
          </Link>
        ))}
      </div>
    </ContenedorDashboard>
  )
}
