import { notFound } from 'next/navigation'

import { createSupportTicketMessage, getSupportTicketDetail } from '@/lib/actions/support.actions'
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
    <ContenedorDashboard titulo={`Ticket #${ticket.ticketNumber}`} botonRegreso={{ href: '/ayuda/tickets', texto: 'Back to tickets' }}>
      <TarjetaSistema className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <TituloSistema nivel={2}>{ticket.title}</TituloSistema>
            <TextoSistema>{ticket.description}</TextoSistema>
          </div>
          <BadgeSistema variante="info">{ticket.status.replaceAll('_', ' ')}</BadgeSistema>
        </div>
        {ticket.evidence.diagnosticsConsent && (
          <TextoSistema variante="muted" tamaño="sm">Safe diagnostics: {ticket.evidence.currentRoute ?? 'route unavailable'} · {ticket.evidence.browserName ?? 'browser unavailable'} · {ticket.evidence.osName ?? 'OS unavailable'} · {ticket.evidence.viewport ?? 'viewport unavailable'}</TextoSistema>
        )}
      </TarjetaSistema>

      <TarjetaSistema className="space-y-4">
        <TituloSistema nivel={2}>Conversation</TituloSistema>
        {ticket.messages.length === 0 ? <TextoSistema variante="sutil">No replies yet.</TextoSistema> : ticket.messages.map((message) => (
          <div key={message.id} className="rounded-xl border border-border bg-card/50 p-3">
            <TextoSistema>{message.body}</TextoSistema>
          </div>
        ))}
        <form action={replyAction} className="space-y-3">
          <TextareaSistema name="body" label="Reply" filas={4} required />
          <BotonSistema type="submit">Send reply</BotonSistema>
        </form>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
