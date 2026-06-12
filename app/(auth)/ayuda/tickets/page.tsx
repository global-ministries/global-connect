import Link from 'next/link'
import { TicketIcon } from 'lucide-react'

import { listSupportTickets } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function TicketsPage() {
  const result = await listSupportTickets()
  const tickets = result.success ? result.tickets : []
  type TicketSummary = (typeof tickets)[number]

  const columns: DataTableColumn<TicketSummary>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      cell: (ticket) => <TicketIdentity ticket={ticket} />,
      className: 'min-w-[300px] whitespace-nowrap',
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (ticket) => formatSupportCategory(ticket.category),
      className: 'text-sm text-muted-foreground',
    },
    {
      key: 'severity',
      header: 'Severidad',
      cell: (ticket) => formatSupportSeverity(ticket.severity),
      className: 'text-sm text-muted-foreground',
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
      className: 'hidden text-sm text-muted-foreground lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
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
          className="hidden overflow-hidden md:block"
          tableClassName="w-full divide-y divide-border"
          bodyClassName="divide-y divide-border"
        />
        <TicketsMobileList tickets={tickets} />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function TicketIdentity({ ticket }: { ticket: TicketRow }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-orange-400 to-orange-500">
        <TicketIcon className="h-4 w-4 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span>#{ticket.ticketNumber}</span>
          <span className="truncate">{ticket.title}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">Creado {formatTicketDate(ticket.createdAt)}</div>
      </div>
    </div>
  )
}

function TicketsMobileList({ tickets }: { tickets: TicketRow[] }) {
  if (tickets.length === 0) {
    return (
      <TarjetaSistema className="p-8 text-center md:hidden">
        <TicketIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <TextoSistema variante="sutil">Todavia no has enviado tickets de soporte.</TextoSistema>
      </TarjetaSistema>
    )
  }

  return (
    <div className="space-y-4 md:hidden">
      {tickets.map((ticket) => (
        <TarjetaSistema key={ticket.id} className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-orange-400 to-orange-500">
              <TicketIcon className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link href={`/ayuda/tickets/${ticket.id}`} className="min-w-0 flex-1 truncate rounded-md font-semibold text-foreground hover:text-[var(--brand-primary)] focus-ring" aria-label={`#${ticket.ticketNumber} ${ticket.title}`}>
                  #{ticket.ticketNumber} {ticket.title}
                </Link>
                <BadgeSistema variante="info" tamaño="sm" className="flex-shrink-0">
                  {formatSupportStatus(ticket.status)}
                </BadgeSistema>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Categoria:</span> {formatSupportCategory(ticket.category)}
                </div>
                <div>
                  <span className="font-medium">Severidad:</span> {formatSupportSeverity(ticket.severity)}
                </div>
                <div className="text-xs text-muted-foreground/70">{formatTicketDate(ticket.createdAt)}</div>
              </div>
            </div>
          </div>
        </TarjetaSistema>
      ))}
    </div>
  )
}

function formatTicketDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value))
}

type TicketRow = Awaited<ReturnType<typeof listSupportTickets>> extends { tickets: infer Tickets }
  ? Tickets extends Array<infer Ticket>
    ? Ticket
    : never
  : never
