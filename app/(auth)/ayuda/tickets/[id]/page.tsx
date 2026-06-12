import { notFound } from 'next/navigation'

import { createStaffSupportTicketReply, createSupportTicketMessage, getSupportTicketDetail, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportStatus } from '@/lib/support/support-labels'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BadgeSistema, ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { SupportTicketReplyComposer, SupportTicketStatusForm } from './support-ticket-detail-actions'

const STATUS_OPTIONS = [
  { valor: 'received', etiqueta: 'Recibido' },
  { valor: 'in_review', etiqueta: 'En revisión' },
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
  const reporter = createParticipant(ticket.reporter, 'Solicitante')
  const assignee = createParticipant(ticket.assignee, 'Sin asignar')

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo={`Ticket #${ticket.ticketNumber}`} botonRegreso={{ href: '/ayuda/tickets', texto: 'Volver a tickets' }}>
        <TarjetaSistema className="overflow-hidden border-border/70 p-0">
          <div className="border-b border-border bg-muted/20 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <span>Ticket #{ticket.ticketNumber}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatCategory(ticket.category)}</span>
                </div>
                <TituloSistema nivel={2} className="text-balance">{ticket.title}</TituloSistema>
                <TextoSistema className="max-w-3xl">{ticket.description}</TextoSistema>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>
                <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Prioridad {formatSeverity(ticket.severity)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:p-5">
            <TicketStat label="Creado" value={formatMessageTimestamp(ticket.createdAt)} />
            <TicketStat label="Actualizado" value={formatMessageTimestamp(ticket.updatedAt)} />
            <TicketStat label="Responsable" value={assignee.fullName} />
          </div>
        </TarjetaSistema>

        <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="order-2 space-y-5 xl:order-1">
            <TarjetaSistema className="space-y-4">
              <SectionHeader eyebrow="Contexto" title="Solicitante" />
              <ParticipantSummary participant={reporter} role="Solicitante" />
              <div className="grid gap-3 border-t border-border pt-4 text-sm">
                <MetadataRow label="Categoría" value={formatCategory(ticket.category)} />
                <MetadataRow label="Prioridad" value={formatSeverity(ticket.severity)} />
                <MetadataRow label="Estado" value={formatSupportStatus(ticket.status)} />
              </div>
            </TarjetaSistema>

            <TarjetaSistema className="space-y-4">
              <SectionHeader eyebrow="Asignación" title="Equipo de soporte" />
              <ParticipantSummary participant={assignee} role={ticket.assigneeUsuarioId ? 'Responsable' : 'Pendiente'} muted={!ticket.assigneeUsuarioId} />
              <TextoSistema variante="muted" tamaño="sm">Los controles de ciclo de vida se mantienen separados de la respuesta para evitar cambios accidentales.</TextoSistema>
            </TarjetaSistema>
          </aside>

          <section className="order-1 space-y-5 xl:order-2">
            <TarjetaSistema className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeader eyebrow="Actividad" title="Conversación" />
                <TextoSistema variante="muted" tamaño="sm">{ticket.messages.length} {ticket.messages.length === 1 ? 'respuesta pública' : 'respuestas públicas'}</TextoSistema>
              </div>

              {ticket.messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
                  <TextoSistema variante="sutil">Aún no hay respuestas públicas.</TextoSistema>
                </div>
              ) : (
                <div className="space-y-4">
                  {ticket.messages.map((message) => {
                    const roleLabel = getMessageRoleLabel(message.authorUsuarioId, ticket.reporterUsuarioId)
                    const participant = createParticipant(message.author, roleLabel)

                    return (
                      <article key={message.id} className="rounded-3xl border border-border bg-card/75 p-4 shadow-sm sm:p-5">
                        <div className="flex gap-3 sm:gap-4">
                          <UserAvatar photoUrl={participant.photoUrl} nombre={participant.nombre} apellido={participant.apellido} size="md" className="ring-2 ring-background" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{participant.fullName}</p>
                                <p className="text-xs font-medium text-muted-foreground">{roleLabel}</p>
                              </div>
                              <time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>
                            </div>
                            <TextoSistema className="whitespace-pre-wrap leading-relaxed">{message.body}</TextoSistema>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              <div className="border-t border-border pt-5">
                <SupportTicketReplyComposer action={canStaffReply ? staffReplyAction : replyAction} isStaffReply={canStaffReply} />
              </div>
            </TarjetaSistema>
          </section>

          <aside className="order-3 space-y-5">
            {canManage && (
              <TarjetaSistema className="space-y-4">
                <SectionHeader eyebrow="Gestión" title="Estado del ticket" />
                <SupportTicketStatusForm action={statusAction} currentStatus={ticket.status} options={STATUS_OPTIONS} />
              </TarjetaSistema>
            )}

            <TarjetaSistema className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <SectionHeader eyebrow="Evidencia" title="Adjuntos" />
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{ticket.attachments.length}</span>
              </div>
              {ticket.attachments.length === 0 ? (
                <TextoSistema variante="sutil">No hay adjuntos finalizados.</TextoSistema>
              ) : ticket.attachments.map((attachment) => (
                <div key={attachment.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{attachment.filename}</p>
                    <TextoSistema variante="muted" tamaño="sm">{formatAttachmentKind(attachment.kind)} · {formatBytes(attachment.byteSize)}</TextoSistema>
                    <TextoSistema variante="muted" tamaño="sm">{attachment.contentType} · {formatAttachmentStatus(attachment.status)}</TextoSistema>
                  </div>
                  {attachment.status === 'uploaded' && (
                    <a href={`/api/support/attachments/${attachment.id}/download`} aria-label={`Descargar ${attachment.filename}`} className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-card">
                      Descargar archivo
                    </a>
                  )}
                </div>
              ))}
            </TarjetaSistema>

            {ticket.evidence.diagnosticsConsent && (
              <TarjetaSistema className="space-y-4">
                <SectionHeader eyebrow="Diagnóstico" title="Datos seguros" />
                <div className="grid gap-3 text-sm">
                  <MetadataRow label="Ruta" value={ticket.evidence.currentRoute ?? 'Ruta no disponible'} />
                  <MetadataRow label="Navegador" value={ticket.evidence.browserName ?? 'Navegador no disponible'} />
                  <MetadataRow label="Sistema" value={ticket.evidence.osName ?? 'Sistema operativo no disponible'} />
                  <MetadataRow label="Viewport" value={ticket.evidence.viewport ?? 'Viewport no disponible'} />
                </div>
              </TarjetaSistema>
            )}
          </aside>
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <TituloSistema nivel={3}>{title}</TituloSistema>
    </div>
  )
}

function TicketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ParticipantSummary({ participant, role, muted = false }: { participant: Participant; role: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 p-3">
      <UserAvatar photoUrl={participant.photoUrl} nombre={participant.nombre} apellido={participant.apellido} size="md" />
      <div className="min-w-0">
        <p className={`truncate text-sm font-semibold ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{participant.fullName}</p>
        <p className="text-xs font-medium text-muted-foreground">{role}</p>
      </div>
    </div>
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-words text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

type Participant = {
  nombre: string
  apellido: string
  fullName: string
  photoUrl: string | null
}

function createParticipant(profile: { nombre: string | null; apellido: string | null; photoUrl: string | null } | null | undefined, fallbackName: string): Participant {
  const nombre = profile?.nombre?.trim() || fallbackName
  const apellido = profile?.apellido?.trim() || ''
  const fullName = `${nombre} ${apellido}`.trim()

  return { nombre, apellido, fullName, photoUrl: profile?.photoUrl ?? null }
}

function getMessageRoleLabel(authorUsuarioId: string | undefined, reporterUsuarioId: string | undefined) {
  if (!authorUsuarioId || !reporterUsuarioId) return 'Actualización'
  return authorUsuarioId === reporterUsuarioId ? 'Solicitante' : 'Equipo de soporte'
}

function formatCategory(category: string) {
  const labels: Record<string, string> = { bug: 'Error', access: 'Acceso', billing: 'Facturación', other: 'Otro' }
  return labels[category] ?? (category || 'Sin categoría')
}

function formatSeverity(severity: string) {
  const labels: Record<string, string> = { low: 'baja', normal: 'normal', high: 'alta', urgent: 'urgente' }
  return labels[severity] ?? severity
}

function formatAttachmentStatus(status: string) {
  const labels: Record<string, string> = { uploaded: 'Finalizado', pending_upload: 'Pendiente', rejected: 'Rechazado', deleted: 'Eliminado' }
  return labels[status] ?? status
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
