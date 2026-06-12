import Link from 'next/link'

import { listSupportTickets } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function TicketsPage() {
  const result = await listSupportTickets()
  const tickets = result.success ? result.tickets : []
  type Ticket = (typeof tickets)[number]

  const columns: DataTableColumn<Ticket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      cell: (ticket) => `#${ticket.ticketNumber} ${ticket.title}`,
      className: 'min-w-[260px]',
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (ticket) => formatSupportCategory(ticket.category),
    },
    {
      key: 'severity',
      header: 'Severidad',
      cell: (ticket) => formatSupportSeverity(ticket.severity),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (ticket) => <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>,
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      cell: (ticket) => formatTicketDate(ticket.createdAt),
      className: 'text-muted-foreground',
    },
  ]

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Mis tickets de soporte" accionPrincipal={<Link href="/ayuda/reportar"><BotonSistema tamaño="sm">Nuevo ticket</BotonSistema></Link>}>
        <DataTable
          rows={tickets}
          columns={columns}
          getRowKey={(ticket) => ticket.id}
          caption="Historial de tickets de soporte enviados por ti."
          getRowHref={(ticket) => `/ayuda/tickets/${ticket.id}`}
          getRowLabel={(ticket) => `#${ticket.ticketNumber} ${ticket.title}`}
          emptyState={<TextoSistema variante="sutil">Todavia no has enviado tickets de soporte.</TextoSistema>}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function formatTicketDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value))
}
