import { notFound } from 'next/navigation'

import { createStaffSupportTicketReply, createSupportTicketMessage, getSupportTicketDetail, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BadgeSistema, ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketReplyComposer, SupportTicketStatusForm } from './support-ticket-detail-actions'

const STATUS_OPTIONS = [
  { valor: 'received', etiqueta: 'Recibido' },
  { valor: 'in_review', etiqueta: 'En revision' },
  { valor: 'in_progress', etiqueta: 'En progreso' },
  { valor: 'resolved', etiqueta: 'Resuelto' },
  { valor: 'closed', etiqueta: 'Cerrado' },
]

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getSupportTicketDetail(id)
  if (!result.success || !result.ticket) notFound()
  const ticket = result.ticket

  async function replyAction(formData: FormData) {
    'use server'
    return createSupportTicketMessage(ticket.id, formData)
  }

  async function staffReplyAction(formData: FormData) {
    'use server'
    return createStaffSupportTicketReply(ticket.id, formData)
  }

  async function statusAction(formData: FormData) {
    'use server'
    return updateSupportTicketStatus(ticket.id, String(formData.get('status') ?? ''))
  }

  const canManage = ticket.supportCapabilities.includes('support.manage')
  const canStaffReply = canManage || ticket.supportCapabilities.includes('support.reply')

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo={`Ticket #${ticket.ticketNumber}`} botonRegreso={{ href: '/ayuda/tickets', texto: 'Volver a tickets' }}>
      <TarjetaSistema className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <TituloSistema nivel={2}>{ticket.title}</TituloSistema>
            <TextoSistema>{ticket.description}</TextoSistema>
          </div>
          <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>
        </div>
        {ticket.evidence.diagnosticsConsent && (
          <TextoSistema variante="muted" tamaño="sm">Diagnosticos seguros: {ticket.evidence.currentRoute ?? 'ruta no disponible'} · {ticket.evidence.browserName ?? 'navegador no disponible'} · {ticket.evidence.osName ?? 'sistema operativo no disponible'} · {ticket.evidence.viewport ?? 'viewport no disponible'}</TextoSistema>
        )}
      </TarjetaSistema>

      <TarjetaSistema className="space-y-4">
        <TituloSistema nivel={2}>Adjuntos</TituloSistema>
        {ticket.attachments.length === 0 ? <TextoSistema variante="sutil">No hay adjuntos finalizados.</TextoSistema> : ticket.attachments.map((attachment) => (
          <div key={attachment.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <TextoSistema>{attachment.filename}</TextoSistema>
              <TextoSistema variante="muted" tamaño="sm">{formatAttachmentKind(attachment.kind)} · {formatBytes(attachment.byteSize)} · {attachment.status === 'uploaded' ? 'Finalizado' : 'Pendiente'}</TextoSistema>
            </div>
            {attachment.status === 'uploaded' && <a href={`/api/support/attachments/${attachment.id}/download`} className="text-sm font-medium text-[var(--brand-primary)]">Descargar {attachment.filename}</a>}
          </div>
        ))}
      </TarjetaSistema>

      <TarjetaSistema className="space-y-4">
        <TituloSistema nivel={2}>Conversacion</TituloSistema>
        {ticket.messages.length === 0 ? <TextoSistema variante="sutil">Aun no hay respuestas.</TextoSistema> : (
          <div className="space-y-4 border-l border-border pl-4">
            {ticket.messages.map((message) => (
              <article key={message.id} className="relative rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
                <span className="absolute -left-[23px] top-5 h-3 w-3 rounded-full border-2 border-card bg-[var(--brand-primary)]" aria-hidden="true" />
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-foreground">Actualizacion</p>
                  <time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>
                </div>
                <TextoSistema>{message.body}</TextoSistema>
              </article>
            ))}
          </div>
        )}
        <SupportTicketReplyComposer action={canStaffReply ? staffReplyAction : replyAction} isStaffReply={canStaffReply} />
      </TarjetaSistema>

      {canManage && (
        <TarjetaSistema className="space-y-4">
          <TituloSistema nivel={2}>Estado del ticket</TituloSistema>
          <SupportTicketStatusForm action={statusAction} currentStatus={ticket.status} options={STATUS_OPTIONS} />
        </TarjetaSistema>
      )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function formatAttachmentKind(kind: string) {
  return kind === 'video' ? 'Video' : 'Captura'
}

function formatBytes(byteSize: number) {
  if (byteSize >= 1024 * 1024) return `${Math.round(byteSize / 1024 / 1024)} MB`
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`
}

function formatMessageTimestamp(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
