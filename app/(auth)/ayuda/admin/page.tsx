import Link from 'next/link'
import { TicketIcon } from 'lucide-react'

import { listStaffSupportTickets, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BadgeSistema, BotonSistema, ContenedorDashboard, InputSistema, SelectSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketQueueStatusForm } from './support-ticket-admin-actions'

type SupportAdminPageProps = {
  searchParams: Promise<{
    search?: string | string[]
    status?: string | string[]
    category?: string | string[]
    campusId?: string | string[]
    assigneeId?: string | string[]
  }>
}

const STATUS_OPTIONS = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'received', etiqueta: 'Recibido' },
  { valor: 'in_review', etiqueta: 'En revision' },
  { valor: 'in_progress', etiqueta: 'En progreso' },
  { valor: 'resolved', etiqueta: 'Resuelto' },
  { valor: 'closed', etiqueta: 'Cerrado' },
]

export default async function SupportAdminPage({ searchParams }: SupportAdminPageProps) {
  const params = await searchParams
  const filters = {
    search: emptyToUndefined(params.search),
    status: emptyToUndefined(params.status),
    category: emptyToUndefined(params.category),
    campusId: emptyToUndefined(params.campusId),
    assigneeId: emptyToUndefined(params.assigneeId),
  }
  const result = await listStaffSupportTickets(filters)
  const tickets = result.success ? result.tickets : []
  type StaffTicket = (typeof tickets)[number]
  const supportCapabilities = result.success ? result.supportCapabilities ?? [] : []
  const canManage = supportCapabilities.includes('support.manage')

  async function statusAction(formData: FormData) {
    'use server'
    return updateSupportTicketStatus(String(formData.get('ticketId') ?? ''), String(formData.get('status') ?? ''))
  }

  const statusOptions = STATUS_OPTIONS.filter((option) => option.valor)
  const columns: DataTableColumn<StaffTicket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      cell: (ticket) => <TicketIdentity ticket={ticket} />,
      className: 'min-w-[320px] whitespace-nowrap',
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
      key: 'actions',
      header: 'Acciones',
      cell: (ticket) => (
        <div className="flex items-end justify-end gap-3">
          {canManage && (
            <SupportTicketQueueStatusForm action={statusAction} ticketId={ticket.id} ticketNumber={ticket.ticketNumber} currentStatus={ticket.status} options={statusOptions} />
          )}
          <Link href={`/ayuda/tickets/${ticket.id}`} className="inline-flex min-h-[44px] items-center rounded-xl px-4 py-2 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-accent)] focus-ring">
            Responder #{ticket.ticketNumber}
          </Link>
        </div>
      ),
      className: 'min-w-[220px] text-right',
      headerClassName: 'text-right',
    },
  ]

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Cola de soporte" descripcion="Busca y prioriza tickets autorizados sin exponer vistas exclusivas del reportante.">
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]" action="/ayuda/admin">
          <InputSistema label="Buscar tickets" name="search" type="search" role="searchbox" defaultValue={filters.search ?? ''} placeholder="Numero de ticket, titulo, descripcion" />
          <SelectSistema label="Estado" name="status" defaultValue={filters.status ?? ''} opciones={STATUS_OPTIONS} />
          <InputSistema label="Categoria" name="category" defaultValue={filters.category ?? ''} placeholder="bug, access, billing" />
          <div className="flex items-end">
            <BotonSistema type="submit" className="w-full">Filtrar</BotonSistema>
          </div>
        </form>

        {!result.success ? (
          <TarjetaSistema><TextoSistema variante="sutil">{result.error}</TextoSistema></TarjetaSistema>
        ) : (
          <>
            <DataTable
              rows={tickets}
              columns={columns}
              getRowKey={(ticket) => ticket.id}
              caption="Cola de tickets de soporte autorizados para el equipo."
              getRowHref={(ticket) => `/ayuda/tickets/${ticket.id}`}
              getRowLabel={(ticket) => `#${ticket.ticketNumber} ${ticket.title}`}
              emptyState={<TextoSistema variante="sutil">Ningun ticket de soporte coincide con estos filtros.</TextoSistema>}
              className="hidden overflow-hidden md:block"
              tableClassName="w-full divide-y divide-border"
              bodyClassName="divide-y divide-border"
            />
            <TicketsMobileList tickets={tickets} canManage={canManage} statusAction={statusAction} statusOptions={statusOptions} />
          </>
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function TicketIdentity({ ticket }: { ticket: StaffTicketRow }) {
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

function TicketsMobileList({ tickets, canManage, statusAction, statusOptions }: { tickets: StaffTicketRow[]; canManage: boolean; statusAction: (formData: FormData) => Promise<{ success: boolean; error?: string }>; statusOptions: { valor: string; etiqueta: string }[] }) {
  if (tickets.length === 0) {
    return (
      <TarjetaSistema className="p-8 text-center md:hidden">
        <TicketIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <TextoSistema variante="sutil">Ningun ticket de soporte coincide con estos filtros.</TextoSistema>
      </TarjetaSistema>
    )
  }

  return (
    <div className="space-y-4 md:hidden">
      {tickets.map((ticket) => (
        <TarjetaSistema key={ticket.id} className="space-y-4 p-4">
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
          <div className={canManage ? 'grid gap-3' : 'flex justify-end'}>
            {canManage && (
              <SupportTicketQueueStatusForm action={statusAction} ticketId={ticket.id} ticketNumber={ticket.ticketNumber} currentStatus={ticket.status} options={statusOptions} />
            )}
            <div className="flex justify-end">
              <Link href={`/ayuda/tickets/${ticket.id}`} className="inline-flex min-h-[44px] items-center rounded-xl px-4 py-2 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-accent)] focus-ring">
                Responder #{ticket.ticketNumber}
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

function emptyToUndefined(value: string | string[] | undefined) {
  const trimmed = (Array.isArray(value) ? value[0] : value)?.trim()
  return trimmed ? trimmed : undefined
}

type StaffTicketRow = Awaited<ReturnType<typeof listStaffSupportTickets>> extends { tickets: infer Tickets }
  ? Tickets extends Array<infer Ticket>
    ? Ticket
    : never
  : never
