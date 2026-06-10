import { notFound } from 'next/navigation'

import { createSupportTicketMessage, getSupportTicketDetail } from '@/lib/actions/support.actions'
import { formatSupportStatus } from '@/lib/support/support-labels'
import { BadgeSistema, BotonSistema, ContenedorDashboard, TarjetaSistema, TextareaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getSupportTicketDetail(id)
  if (!result.success || !result.ticket) notFound()
  const ticket = result.ticket

  async function replyAction(formData: FormData) {
    'use server'
    await createSupportTicketMessage(ticket.id, formData)
  }

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
    </ContenedorDashboard>
  )
}
