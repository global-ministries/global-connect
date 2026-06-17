import Link from 'next/link'
import { Eye, TicketIcon } from 'lucide-react'

import { listSupportTickets } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

const TICKET_FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'abiertos', label: 'Abiertos' },
  { value: 'resueltos', label: 'Resueltos' },
  { value: 'cerrados', label: 'Cerrados' },
] as const

type TicketFilter = (typeof TICKET_FILTERS)[number]['value']

export default async function TicketsPage({ searchParams }: { searchParams?: Promise<{ estado?: string }> } = {}) {
  const params = await searchParams
  const activeFilter = normalizeTicketFilter(params?.estado)
  const result = await listSupportTickets()
  const tickets = result.success ? result.tickets : []
  const filteredTickets = tickets.filter((ticket) => matchesTicketFilter(ticket.status, activeFilter))
  const filterCounts = getTicketFilterCounts(tickets)
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
    {
      key: 'actions',
      header: 'Acciones',
      cell: (ticket) => (
        <Link href={`/ayuda/tickets/${ticket.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 focus-ring">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Ver detalle
        </Link>
      ),
      className: 'whitespace-nowrap text-sm',
    },
  ]

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Mis tickets de soporte" accionPrincipal={<Link href="/ayuda/reportar"><BotonSistema tamaño="sm">Nuevo ticket</BotonSistema></Link>}>
        <TicketFilterPills activeFilter={activeFilter} counts={filterCounts} />
        <DataTable
          rows={filteredTickets}
          columns={columns}
          getRowKey={(ticket) => ticket.id}
          caption="Historial de tickets de soporte enviados por ti."
          getRowHref={(ticket) => `/ayuda/tickets/${ticket.id}`}
          getRowLabel={(ticket) => `#${ticket.ticketNumber} ${ticket.title}`}
          emptyState={<TextoSistema variante="sutil">{getEmptyStateMessage(activeFilter)}</TextoSistema>}
          className="hidden md:block"
        />
        <TicketsMobileList tickets={filteredTickets} emptyMessage={getEmptyStateMessage(activeFilter)} />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function TicketFilterPills({ activeFilter, counts }: { activeFilter: TicketFilter; counts: Record<TicketFilter, number> }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card/40 p-1 shadow-sm sm:w-auto">
        {TICKET_FILTERS.map((filter) => {
          const isActive = filter.value === activeFilter
          const href = filter.value === 'todos' ? '/ayuda/tickets' : `/ayuda/tickets?estado=${filter.value}`

          return (
            <Link
              key={filter.value}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors focus-ring ${
                isActive
                  ? 'bg-[var(--brand-primary)] text-white shadow-sm hover:bg-[var(--brand-primary)]/90'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>{counts[filter.value]}</span>
            </Link>
          )
        })}
      </div>
    </div>
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

function TicketsMobileList({ tickets, emptyMessage }: { tickets: TicketRow[]; emptyMessage: string }) {
  if (tickets.length === 0) {
    return (
      <TarjetaSistema className="p-8 text-center md:hidden">
        <TicketIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <TextoSistema variante="sutil">{emptyMessage}</TextoSistema>
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
              <Link href={`/ayuda/tickets/${ticket.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 focus-ring">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Ver detalle
              </Link>
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

function normalizeTicketFilter(value: string | undefined): TicketFilter {
  return TICKET_FILTERS.some((filter) => filter.value === value) ? (value as TicketFilter) : 'todos'
}

function matchesTicketFilter(status: string, filter: TicketFilter) {
  if (filter === 'todos') return true
  if (filter === 'abiertos') return ['received', 'in_review', 'in_progress'].includes(status)
  if (filter === 'resueltos') return status === 'resolved'
  return status === 'closed'
}

function getTicketFilterCounts(tickets: TicketRow[]): Record<TicketFilter, number> {
  return TICKET_FILTERS.reduce(
    (counts, filter) => ({
      ...counts,
      [filter.value]: tickets.filter((ticket) => matchesTicketFilter(ticket.status, filter.value)).length,
    }),
    {} as Record<TicketFilter, number>
  )
}

function getEmptyStateMessage(filter: TicketFilter) {
  if (filter === 'todos') return 'Todavia no has enviado tickets de soporte.'
  return 'No hay tickets para este filtro.'
}

type TicketRow = Awaited<ReturnType<typeof listSupportTickets>> extends { tickets: infer Tickets }
  ? Tickets extends Array<infer Ticket>
    ? Ticket
    : never
  : never
