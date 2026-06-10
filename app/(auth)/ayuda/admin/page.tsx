import Link from 'next/link'

import { listStaffSupportTickets } from '@/lib/actions/support.actions'
import { BadgeSistema, BotonSistema, ContenedorDashboard, InputSistema, SelectSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

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
  { valor: '', etiqueta: 'All statuses' },
  { valor: 'received', etiqueta: 'Received' },
  { valor: 'in_review', etiqueta: 'In review' },
  { valor: 'in_progress', etiqueta: 'In progress' },
  { valor: 'resolved', etiqueta: 'Resolved' },
  { valor: 'closed', etiqueta: 'Closed' },
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

  return (
    <ContenedorDashboard titulo="Support queue" descripcion="Search and triage authorized support tickets without exposing reporter-only views.">
      <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]" action="/ayuda/admin">
        <InputSistema label="Search tickets" name="search" type="search" role="searchbox" defaultValue={filters.search ?? ''} placeholder="Ticket number, title, description" />
        <SelectSistema label="Status" name="status" value={filters.status ?? ''} opciones={STATUS_OPTIONS} />
        <InputSistema label="Category" name="category" defaultValue={filters.category ?? ''} placeholder="bug, access, billing" />
        <div className="flex items-end">
          <BotonSistema type="submit" className="w-full">Filter</BotonSistema>
        </div>
      </form>

      {!result.success ? (
        <TarjetaSistema><TextoSistema variante="sutil">{result.error}</TextoSistema></TarjetaSistema>
      ) : tickets.length === 0 ? (
        <TarjetaSistema><TextoSistema variante="sutil">No support tickets match these filters.</TextoSistema></TarjetaSistema>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
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
      )}
    </ContenedorDashboard>
  )
}

function emptyToUndefined(value: string | string[] | undefined) {
  const trimmed = (Array.isArray(value) ? value[0] : value)?.trim()
  return trimmed ? trimmed : undefined
}
