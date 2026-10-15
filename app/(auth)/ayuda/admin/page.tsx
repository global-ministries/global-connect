import Link from 'next/link'
import { Filter, MessageSquare, TicketIcon } from 'lucide-react'

import { listStaffSupportTickets, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'

import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { BadgeSistema, BotonSistema, InputSistema, PaginaSistema, SelectSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { CLASE_ENLACE_DETALLE, CLASE_ICONO_TICKET, claseFiltro } from '../estilos'
import { SupportTicketQueueStatusForm } from './support-ticket-admin-actions'

type SupportAdminPageProps = {
  searchParams?: Promise<{
    search?: string | string[]
    status?: string | string[]
    estado?: string | string[]
    category?: string | string[]
    campusId?: string | string[]
    assigneeId?: string | string[]
  }>
}

const SUPPORT_ADMIN_STATUS_FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'abiertos', label: 'Abiertos' },
  { value: 'resueltos', label: 'Resueltos' },
  { value: 'cerrados', label: 'Cerrados' },
] as const

type SupportAdminStatusFilter = (typeof SUPPORT_ADMIN_STATUS_FILTERS)[number]['value']

const STATUS_OPTIONS = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'received', etiqueta: 'Recibido' },
  { valor: 'in_review', etiqueta: 'En revision' },
  { valor: 'in_progress', etiqueta: 'En progreso' },
  { valor: 'resolved', etiqueta: 'Resuelto' },
  { valor: 'closed', etiqueta: 'Cerrado' },
]

export default async function SupportAdminPage({ searchParams }: SupportAdminPageProps = {}) {
  const params = await searchParams
  const activeStatusFilter = normalizeSupportAdminStatusFilter(emptyToUndefined(params?.estado))
  const filters = {
    search: emptyToUndefined(params?.search),
    status: activeStatusFilter === 'todos' ? emptyToUndefined(params?.status) : undefined,
    category: emptyToUndefined(params?.category),
    campusId: emptyToUndefined(params?.campusId),
    assigneeId: emptyToUndefined(params?.assigneeId),
  }
  const result = await listStaffSupportTickets(filters)
  const tickets = result.success ? result.tickets.filter((ticket) => matchesSupportAdminStatusFilter(ticket.status, activeStatusFilter)) : []
  type StaffTicket = (typeof tickets)[number]
  const supportCapabilities = result.success ? result.supportCapabilities ?? [] : []
  const canManage = supportCapabilities.includes('support.manage')

  async function statusAction(formData: FormData) {
    'use server'
    return updateSupportTicketStatus(String(formData.get('ticketId') ?? ''), String(formData.get('status') ?? ''))
  }

  const statusOptions = STATUS_OPTIONS.filter((option) => option.valor)
  const activeFiltersCount = Object.values(filters).filter(Boolean).length
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
        <div className="flex items-center justify-end gap-3">
          {canManage && (
            <SupportTicketQueueStatusForm action={statusAction} ticketId={ticket.id} ticketNumber={ticket.ticketNumber} currentStatus={ticket.status} options={statusOptions} />
          )}
          <Link href={`/ayuda/tickets/${ticket.id}`} className={CLASE_ENLACE_DETALLE}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Responder #{ticket.ticketNumber}
          </Link>
        </div>
      ),
      className: 'min-w-[260px] whitespace-nowrap text-right text-sm',
      headerClassName: 'text-right',
    },
  ]

  return (
    <PaginaSistema titulo="Cola de soporte" descripcion="Busca y prioriza tickets autorizados sin exponer vistas exclusivas del reportante.">
      <div className="relative flex items-center justify-between gap-2">
        <SupportAdminStatusFilterPills activeFilter={activeStatusFilter} params={params} />

        <details className="group shrink-0 sm:relative">
          <summary className="flex cursor-pointer list-none items-center justify-end gap-2 rounded-xl focus-ring [&::-webkit-details-marker]:hidden">
            <span className="inline-flex h-11 items-center rounded-xl border-2 border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent">
              <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="ml-2">Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-brand-foreground">
                  {activeFiltersCount}
                </span>
              )}
            </span>
          </summary>
          {/* Mobile: the form drops below the whole toolbar at full width; from sm it floats under the button. */}
          <form className="absolute inset-x-0 top-full z-20 mt-2 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-0 sm:top-full sm:w-[min(48rem,calc(100vw-2rem))] md:grid-cols-[minmax(0,1fr)_180px_180px_auto]" action="/ayuda/admin">
            {activeStatusFilter !== 'todos' && <input type="hidden" name="estado" value={activeStatusFilter} />}
            <InputSistema label="Buscar tickets" name="search" type="search" defaultValue={filters.search ?? ''} placeholder="Numero de ticket, titulo, descripcion" />
            <SelectSistema label="Estado" name="status" defaultValue={filters.status ?? ''} opciones={STATUS_OPTIONS} disabled={activeStatusFilter !== 'todos'} />
            <InputSistema label="Categoria" name="category" defaultValue={filters.category ?? ''} placeholder="bug, access, billing" />
            <div className="flex items-end">
              <BotonSistema type="submit" className="w-full">Filtrar</BotonSistema>
            </div>
          </form>
        </details>
      </div>

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
            className="hidden md:block"
          />
          <TicketsMobileList tickets={tickets} canManage={canManage} statusAction={statusAction} statusOptions={statusOptions} />
        </>
      )}
    </PaginaSistema>
  )
}

function SupportAdminStatusFilterPills({ activeFilter, params }: { activeFilter: SupportAdminStatusFilter; params?: Awaited<SupportAdminPageProps['searchParams']> }) {
  return (
    <nav aria-label="Filtrar tickets por estado" className="min-w-0 overflow-x-auto">
      <div className="inline-flex items-center gap-1 rounded-2xl border border-border/30 bg-card/60 p-1 shadow-sm backdrop-blur">
        {SUPPORT_ADMIN_STATUS_FILTERS.map((filter) => {
          const isActive = filter.value === activeFilter

          return (
            <Link
              key={filter.value}
              href={buildSupportAdminStatusFilterHref(filter.value, params)}
              aria-current={isActive ? 'page' : undefined}
              className={claseFiltro(isActive)}
            >
              {filter.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function TicketIdentity({ ticket }: { ticket: StaffTicketRow }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-16 ${CLASE_ICONO_TICKET}`}>
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
            <div className={`mt-0.5 h-8 w-12 ${CLASE_ICONO_TICKET}`}>
              <TicketIcon className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link href={`/ayuda/tickets/${ticket.id}`} className="min-w-0 flex-1 truncate rounded-md font-semibold text-foreground hover:text-brand-text focus-ring" aria-label={`#${ticket.ticketNumber} ${ticket.title}`}>
                  #{ticket.ticketNumber} {ticket.title}
                </Link>
                <BadgeSistema variante="info" tamaño="sm" className="shrink-0">
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
          <div className={canManage ? 'flex flex-wrap items-center justify-end gap-3' : 'flex justify-end'}>
            {canManage && (
              <SupportTicketQueueStatusForm action={statusAction} ticketId={ticket.id} ticketNumber={ticket.ticketNumber} currentStatus={ticket.status} options={statusOptions} />
            )}
            <div className="flex justify-end">
              <Link href={`/ayuda/tickets/${ticket.id}`} className={CLASE_ENLACE_DETALLE}>
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
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

function normalizeSupportAdminStatusFilter(value: string | undefined): SupportAdminStatusFilter {
  return SUPPORT_ADMIN_STATUS_FILTERS.some((filter) => filter.value === value) ? (value as SupportAdminStatusFilter) : 'todos'
}

function matchesSupportAdminStatusFilter(status: string, filter: SupportAdminStatusFilter) {
  if (filter === 'todos') return true
  if (filter === 'abiertos') return ['received', 'in_review', 'in_progress'].includes(status)
  if (filter === 'resueltos') return status === 'resolved'
  return status === 'closed'
}

function buildSupportAdminStatusFilterHref(filter: SupportAdminStatusFilter, params?: Awaited<SupportAdminPageProps['searchParams']>) {
  const query = new URLSearchParams()
  appendQueryValue(query, 'search', params?.search)
  appendQueryValue(query, 'category', params?.category)
  appendQueryValue(query, 'campusId', params?.campusId)
  appendQueryValue(query, 'assigneeId', params?.assigneeId)
  if (filter !== 'todos') query.set('estado', filter)

  const queryString = query.toString()
  return queryString ? `/ayuda/admin?${queryString}` : '/ayuda/admin'
}

function appendQueryValue(query: URLSearchParams, key: string, value: string | string[] | undefined) {
  const normalizedValue = emptyToUndefined(value)
  if (normalizedValue) query.set(key, normalizedValue)
}

type StaffTicketRow = Awaited<ReturnType<typeof listStaffSupportTickets>> extends { tickets: infer Tickets }
  ? Tickets extends Array<infer Ticket>
    ? Ticket
    : never
  : never
