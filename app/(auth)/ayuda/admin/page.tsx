import Link from 'next/link'

import { assignSupportTicket, listStaffSupportTickets, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportCategory, formatSupportSeverity, formatSupportStatus } from '@/lib/support/support-labels'
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
  const supportCapabilities = result.success ? result.supportCapabilities ?? [] : []
  const canManage = supportCapabilities.includes('support.manage')

  async function statusAction(formData: FormData) {
    'use server'
    await updateSupportTicketStatus(String(formData.get('ticketId') ?? ''), String(formData.get('status') ?? ''))
  }

  async function assignmentAction(formData: FormData) {
    'use server'
    const assigneeUsuarioId = String(formData.get('assigneeUsuarioId') ?? '').trim() || null
    await assignSupportTicket(String(formData.get('ticketId') ?? ''), assigneeUsuarioId)
  }

  return (
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
      ) : tickets.length === 0 ? (
        <TarjetaSistema><TextoSistema variante="sutil">Ningun ticket de soporte coincide con estos filtros.</TextoSistema></TarjetaSistema>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <TarjetaSistema key={ticket.id} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <Link href={`/ayuda/tickets/${ticket.id}`} className="font-semibold text-foreground hover:text-[var(--brand-primary)] focus-ring rounded-md">#{ticket.ticketNumber} {ticket.title}</Link>
                  <TextoSistema variante="sutil" tamaño="sm">{formatSupportCategory(ticket.category)} · {formatSupportSeverity(ticket.severity)}</TextoSistema>
                </div>
                <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>
              </div>
              <div className={canManage ? "grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "flex justify-end"}>
                {canManage && (
                  <>
                    <form action={statusAction} className="space-y-2">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <SelectSistema label={`Nuevo estado para #${ticket.ticketNumber}`} name="status" defaultValue={ticket.status} opciones={STATUS_OPTIONS.filter((option) => option.valor)} />
                      <BotonSistema type="submit" tamaño="sm">Actualizar estado de #{ticket.ticketNumber}</BotonSistema>
                    </form>
                    <form action={assignmentAction} className="space-y-2">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <InputSistema label={`Responsable para #${ticket.ticketNumber}`} name="assigneeUsuarioId" defaultValue={ticket.assigneeUsuarioId ?? ''} placeholder="UUID del responsable" />
                      <BotonSistema type="submit" tamaño="sm" variante="outline">Asignar #{ticket.ticketNumber}</BotonSistema>
                    </form>
                  </>
                )}
                <div className="flex items-end">
                  <Link href={`/ayuda/tickets/${ticket.id}`} className="inline-flex min-h-[44px] items-center rounded-xl px-4 py-2 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-accent)] focus-ring">Responder #{ticket.ticketNumber}</Link>
                </div>
              </div>
            </TarjetaSistema>
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
