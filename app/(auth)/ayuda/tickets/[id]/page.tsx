import { notFound } from 'next/navigation'

import { createStaffSupportTicketReply, createSupportTicketMessage, getSupportTicketDetail, updateSupportTicketStatus } from '@/lib/actions/support.actions'
import { formatSupportStatus } from '@/lib/support/support-labels'

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
  const canManage = ticket.supportCapabilities.includes('support.manage')
  const canStaffReply = canManage || ticket.supportCapabilities.includes('support.reply')
  const canViewInternalMessages = canManage || ticket.supportCapabilities.includes('support.view') || ticket.supportCapabilities.includes('support.reply')
  const safeEvents = ticket.events ?? []

  async function replyAction(formData: FormData) {
    'use server'
    return createSupportTicketMessage(ticket.id, formData)
  }

  async function staffReplyAction(formData: FormData) {
    'use server'
    return createStaffSupportTicketReply(ticket.id, formData, { autoAssignIfUnassigned: canManage && ticket.assigneeUsuarioId === null })
  }

  async function statusAction(formData: FormData) {
    'use server'
    return updateSupportTicketStatus(ticket.id, String(formData.get('status') ?? ''))
  }

  const reporter = createParticipant(ticket.reporter, 'Solicitante')
  const assignee = createParticipant(ticket.assignee, 'Sin asignar')

  return (
<ContenedorDashboard titulo={`Ticket #${ticket.ticketNumber}`} botonRegreso={{ href: '/ayuda/tickets', texto: 'Volver a tickets' }}>
        <div className="space-y-6">
          <TarjetaSistema className="overflow-hidden border-border/70 p-0">
            <div className="border-b border-border bg-muted/20 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <span>Ticket #{ticket.ticketNumber}</span>
                    <span aria-hidden="true">/</span>
                    <span>{formatCategory(ticket.category)}</span>
                  </div>
                  <TituloSistema nivel={2} className="text-balance leading-tight">{ticket.title}</TituloSistema>
                  <TextoSistema tamaño="sm" className="max-w-3xl">{ticket.description}</TextoSistema>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <BadgeSistema variante="info">{formatSupportStatus(ticket.status)}</BadgeSistema>
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Prioridad {formatSeverity(ticket.severity)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
              <TicketStat label="Creado" value={formatMessageTimestamp(ticket.createdAt)} />
              <TicketStat label="Actualizado" value={formatMessageTimestamp(ticket.updatedAt)} />
              <TicketStat label="Responsable" value={assignee.fullName} />
            </div>
          </TarjetaSistema>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside className="order-2 space-y-4 lg:order-1 lg:flex lg:flex-col lg:space-y-4">
              <TarjetaSistema className="space-y-3 lg:flex-none">
                <SectionHeader eyebrow="Contexto" title="Solicitante" />
                <ParticipantSummary participant={reporter} role="Solicitante" />
                <div className="grid gap-2 border-t border-border pt-3 text-sm">
                  <MetadataRow label="Categoría" value={formatCategory(ticket.category)} />
                  <MetadataRow label="Prioridad" value={formatSeverity(ticket.severity)} />
                  <MetadataRow label="Estado" value={formatSupportStatus(ticket.status)} />
                  <MetadataRow label="Responsable" value={assignee.fullName} />
                </div>
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

            <section className="order-1 lg:order-2">
              <TarjetaSistema className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between lg:flex-none">
                  <SectionHeader eyebrow="Actividad" title="Conversación" />
                  <TextoSistema variante="muted" tamaño="sm">
                    {ticket.messages.length} {ticket.messages.length === 1 ? 'interacción' : 'interacciones'}
                    {canViewInternalMessages ? '' : ' públicas'}
                  </TextoSistema>
                </div>

                <div>
                  {ticket.messages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center lg:min-h-full lg:content-center">
                      <TextoSistema variante="sutil">Aún no hay respuestas públicas.</TextoSistema>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ticket.messages.map((message) => {
                        const isReporter = isReporterMessage(message.authorUsuarioId, ticket.reporterUsuarioId)
                        const roleLabel = isReporter ? 'Solicitante' : 'Soporte'
                        const participant = createParticipant(message.author, roleLabel)

                        return <MessageBubble key={message.id} message={message} participant={participant} roleLabel={roleLabel} isReporter={isReporter} isInternal={message.isInternal ?? false} />
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 lg:flex-none">
                  <SupportTicketReplyComposer action={canStaffReply ? staffReplyAction : replyAction} isStaffReply={canStaffReply} />
                </div>
              </TarjetaSistema>
            </section>

            <aside className="order-3 space-y-5 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 2xl:col-span-1 2xl:flex 2xl:flex-col 2xl:space-y-0">
              {canManage && (
                <TarjetaSistema className="space-y-4 lg:flex-none">
                  <SectionHeader eyebrow="Gestión" title="Estado del ticket" />
                  <SupportTicketStatusForm action={statusAction} currentStatus={ticket.status} options={STATUS_OPTIONS} />
                </TarjetaSistema>
              )}

              <TarjetaSistema className="space-y-4">
                <div className="flex items-start justify-between gap-3 lg:flex-none">
                  <SectionHeader eyebrow="Evidencia" title="Adjuntos" />
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{ticket.attachments.length}</span>
                </div>
                <div className="space-y-4">
                  {ticket.attachments.length === 0 ? (
                    <TextoSistema variante="sutil">No hay adjuntos finalizados.</TextoSistema>
                  ) : ticket.attachments.map((attachment) => (
                    <div key={attachment.id} className="rounded-2xl border border-border bg-muted/20 p-3">
                      <AttachmentPreview attachment={attachment} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{attachment.filename}</p>
                        <TextoSistema variante="muted" tamaño="sm">{formatAttachmentKind(attachment.kind)} · {formatBytes(attachment.byteSize)}</TextoSistema>
                        <TextoSistema variante="muted" tamaño="sm">{attachment.contentType} · {formatAttachmentStatus(attachment.status)}</TextoSistema>
                      </div>
                      {attachment.status === 'uploaded' && (
                        <a href={getAttachmentRoute(attachment.id)} aria-label={`Abrir ${attachment.filename}`} className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-card">
                          Abrir archivo
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </TarjetaSistema>

              {canViewInternalMessages && safeEvents.length > 0 && (
                <TarjetaSistema className="space-y-4 lg:flex-none">
                  <SectionHeader eyebrow="Staff" title="Actividad" />
                  <ol className="space-y-3">
                    {safeEvents.map((event, index) => (
                      <li key={`${event.type}-${event.createdAt}-${index}`} className="rounded-2xl border border-border bg-muted/20 p-3">
                        <p className="text-sm font-semibold text-foreground">{formatEventType(event.type)}</p>
                        <TextoSistema variante="muted" tamaño="sm">{formatMessageTimestamp(event.createdAt)}</TextoSistema>
                        <SupportEventMetadata event={event} />
                      </li>
                    ))}
                  </ol>
                </TarjetaSistema>
              )}
            </aside>
          </div>
        </div>
      </ContenedorDashboard>
)
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <TituloSistema nivel={3}>{title}</TituloSistema>
    </div>
  )
}

function TicketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ParticipantSummary({ participant, role, muted = false }: { participant: Participant; role: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-2.5">
      <UserAvatar photoUrl={participant.photoUrl} nombre={participant.nombre} apellido={participant.apellido} size="sm" />
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

type TicketMessage = {
  id: string
  body: string
  authorUsuarioId?: string
  createdAt: string
  isInternal?: boolean
  author: {
    id: string
    nombre: string | null
    apellido: string | null
    photoUrl: string | null
  } | null
}

type TicketAttachment = {
  id: string
  filename: string
  kind: string
  contentType: string
  byteSize: number
  status: string
}

type SupportTicketEvent = {
  type: string
  createdAt: string
  actorUsuarioId: string | null
  metadata: {
    source?: string
    status?: string
    category?: string
    actor?: string
  }
}

function SupportEventMetadata({ event }: { event: SupportTicketEvent }) {
  const items = [
    event.actorUsuarioId ? `Actor ${event.actorUsuarioId}` : null,
    event.metadata.source ? `Origen ${event.metadata.source}` : null,
    event.metadata.status ? `Estado ${formatSupportStatus(event.metadata.status)}` : null,
    event.metadata.category ? `Categoría ${formatCategory(event.metadata.category)}` : null,
    event.metadata.actor ? `Actor ${event.metadata.actor}` : null,
  ].filter(Boolean)

  if (items.length === 0) return null
  return <TextoSistema variante="sutil" tamaño="sm">{items.join(' · ')}</TextoSistema>
}

function AttachmentPreview({ attachment }: { attachment: TicketAttachment }) {
  if (attachment.status !== 'uploaded') return null

  const route = getAttachmentRoute(attachment.id)
  if (isPreviewableImage(attachment.contentType)) {
    return <img src={route} alt={`Vista previa de ${attachment.filename}`} className="mb-3 aspect-video w-full rounded-xl border border-border bg-card object-contain" loading="lazy" />
  }

  if (isPreviewableVideo(attachment.contentType)) {
    return <video src={route} aria-label={`Vista previa de ${attachment.filename}`} className="mb-3 aspect-video w-full rounded-xl border border-border bg-black" controls preload="metadata" />
  }

  return null
}

function getAttachmentRoute(attachmentId: string) {
  return `/api/support/attachments/${attachmentId}/download`
}

function MessageBubble({ message, participant, roleLabel, isReporter, isInternal = false }: { message: TicketMessage; participant: Participant; roleLabel: string; isReporter: boolean; isInternal?: boolean }) {
  return (
    <article className={`flex gap-2.5 ${isReporter ? 'justify-start' : 'justify-end'}`}>
      {isReporter && <UserAvatar photoUrl={participant.photoUrl} nombre={participant.nombre} apellido={participant.apellido} size="sm" className="mt-1 ring-2 ring-background" />}
      <div className={`max-w-[min(92%,42rem)] rounded-2xl border px-3 py-2.5 shadow-sm ${isReporter ? 'rounded-tl-md border-border bg-card/85' : 'rounded-tr-md border-border bg-muted/40'} ${isInternal ? 'border-l-4 border-l-amber-500/90 bg-amber-50/35 dark:bg-amber-900/20' : 'border-l-4 border-l-[var(--brand-primary)]'}`}>
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">{participant.fullName}</p>
          <span className="text-xs font-medium text-muted-foreground">{roleLabel}</span>
          {isInternal ? <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-100">Nota interna</span> : null}
          <time className="text-xs text-muted-foreground" dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>
        </div>
        <TextoSistema tamaño="sm" className="whitespace-pre-wrap leading-relaxed">{message.body}</TextoSistema>
      </div>
      {!isReporter && <UserAvatar photoUrl={participant.photoUrl} nombre={participant.nombre} apellido={participant.apellido} size="sm" className="mt-1 ring-2 ring-background" />}
    </article>
  )
}

function createParticipant(profile: { nombre: string | null; apellido: string | null; photoUrl: string | null } | null | undefined, fallbackName: string): Participant {
  const nombre = profile?.nombre?.trim() || fallbackName
  const apellido = profile?.apellido?.trim() || ''
  const fullName = `${nombre} ${apellido}`.trim()

  return { nombre, apellido, fullName, photoUrl: profile?.photoUrl ?? null }
}

function isReporterMessage(authorUsuarioId: string | undefined, reporterUsuarioId: string | undefined) {
  return Boolean(authorUsuarioId && reporterUsuarioId && authorUsuarioId === reporterUsuarioId)
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

function formatEventType(type: string) {
  const labels: Record<string, string> = {
    'support.ticket.created': 'Ticket creado',
    'support.reporter_message.created': 'Respuesta del solicitante',
    'support.staff_reply.created': 'Respuesta de soporte',
    'support.ticket.status_changed': 'Estado actualizado',
    'support.ticket.assigned': 'Ticket asignado',
    'support.ticket.auto_assigned': 'Ticket autoasignado',
  }
  return labels[type] ?? type
}

function isPreviewableImage(contentType: string) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(contentType)
}

function isPreviewableVideo(contentType: string) {
  return ['video/mp4', 'video/webm', 'video/quicktime'].includes(contentType)
}

function formatBytes(byteSize: number) {
  if (byteSize >= 1024 * 1024) return `${Math.round(byteSize / 1024 / 1024)} MB`
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`
}

function formatMessageTimestamp(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
