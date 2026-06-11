import { notFound } from 'next/navigation'

import { assignSupportTicket, createStaffSupportTicketReply, createSupportTicketMessage, getSupportTicketDetail, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportStatus } from '@/lib/support/support-labels'
import { BadgeSistema, BotonSistema, ContenedorDashboard, InputSistema, SelectSistema, TarjetaSistema, TextareaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

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
    await createSupportTicketMessage(ticket.id, formData)
  }

  async function staffReplyAction(formData: FormData) {
    'use server'
    await createStaffSupportTicketReply(ticket.id, formData)
  }

  async function statusAction(formData: FormData) {
    'use server'
    await updateSupportTicketStatus(ticket.id, String(formData.get('status') ?? ''))
  }

  async function assignmentAction(formData: FormData) {
    'use server'
    const assigneeUsuarioId = String(formData.get('assigneeUsuarioId') ?? '').trim() || null
    await assignSupportTicket(ticket.id, assigneeUsuarioId)
  }

  const canManage = ticket.supportCapabilities.includes('support.manage')
  const canStaffReply = canManage || ticket.supportCapabilities.includes('support.reply')

  return (
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
        {ticket.messages.length === 0 ? <TextoSistema variante="sutil">Aun no hay respuestas.</TextoSistema> : ticket.messages.map((message) => (
          <div key={message.id} className="rounded-xl border border-border bg-card/50 p-3">
            <TextoSistema>{message.body}</TextoSistema>
          </div>
        ))}
        <form action={replyAction} className="space-y-3">
          <TextareaSistema name="body" label="Respuesta" filas={4} required />
          <BotonSistema type="submit">Enviar respuesta</BotonSistema>
        </form>
      </TarjetaSistema>

      {(canStaffReply || canManage) && (
        <TarjetaSistema className="space-y-4">
          <TituloSistema nivel={2}>Operacion del equipo</TituloSistema>
          {canStaffReply && (
            <form action={staffReplyAction} className="space-y-3">
              <TextareaSistema name="body" label="Respuesta del equipo" filas={4} required />
              <BotonSistema type="submit">Enviar respuesta del equipo</BotonSistema>
            </form>
          )}
          {canManage && (
            <div className="grid gap-4 md:grid-cols-2">
              <form action={statusAction} className="space-y-3">
                <SelectSistema label="Nuevo estado" name="status" defaultValue={ticket.status} opciones={STATUS_OPTIONS} />
                <BotonSistema type="submit">Actualizar estado</BotonSistema>
              </form>
              <form action={assignmentAction} className="space-y-3">
                <InputSistema label="Responsable" name="assigneeUsuarioId" defaultValue={ticket.assigneeUsuarioId ?? ''} placeholder="UUID del usuario responsable" />
                <BotonSistema type="submit">Actualizar responsable</BotonSistema>
              </form>
            </div>
          )}
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}

function formatAttachmentKind(kind: string) {
  return kind === 'video' ? 'Video' : 'Captura'
}

function formatBytes(byteSize: number) {
  if (byteSize >= 1024 * 1024) return `${Math.round(byteSize / 1024 / 1024)} MB`
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`
}
