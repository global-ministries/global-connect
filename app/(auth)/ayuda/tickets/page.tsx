import Link from 'next/link'

import { listSupportTickets } from '@/lib/actions/support.actions'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function TicketsPage() {
  const result = await listSupportTickets()
  const tickets = result.success ? result.tickets : []

  return (
    <ContenedorDashboard titulo="My support tickets" accionPrincipal={<Link href="/ayuda/reportar"><BotonSistema tamaño="sm">New ticket</BotonSistema></Link>}>
      <div className="space-y-3">
        {tickets.length === 0 ? (
          <TarjetaSistema><TextoSistema variante="sutil">You have not submitted support tickets yet.</TextoSistema></TarjetaSistema>
        ) : tickets.map((ticket) => (
          <Link key={ticket.id} href={`/ayuda/tickets/${ticket.id}`} className="block focus-ring rounded-2xl">
            <TarjetaSistema className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-foreground">#{ticket.ticketNumber} {ticket.title}</p>
                <TextoSistema variante="sutil" tamaño="sm">{ticket.category} · {ticket.severity}</TextoSistema>
              </div>
              <BadgeSistema variante="info">{ticket.status.replaceAll('_', ' ')}</BadgeSistema>
            </TarjetaSistema>
          </Link>
        ))}
      </div>
    </ContenedorDashboard>
  )
}
