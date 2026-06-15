"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { diagnosticsConsentSchema, sanitizeSupportEvidence } from '@/lib/support/support-evidence'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SUPPORT_TICKET_STATUSES = ['received', 'in_review', 'in_progress', 'resolved', 'closed'] as const
const SUPPORT_TICKET_CAPABILITIES = ['support.view', 'support.reply', 'support.manage'] as const

const supportTicketSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(8000),
  category: z.string().trim().min(2).max(80),
  currentRoute: z.string().trim().max(500).optional(),
  browserName: z.string().trim().max(120).optional(),
  osName: z.string().trim().max(120).optional(),
  viewport: z.string().trim().max(40).optional(),
  appBuildVersion: z.string().trim().max(120).optional(),
  sentryEventId: z.string().trim().max(120).optional(),
  diagnosticsConsent: diagnosticsConsentSchema,
})

const messageSchema = z.object({ body: z.string().trim().min(1).max(8000) })
const supportTicketStatusSchema = z.enum(SUPPORT_TICKET_STATUSES)
const assigneeUsuarioIdSchema = z.string().uuid().nullable()

const staffQueueFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: supportTicketStatusSchema.optional(),
  category: z.string().trim().max(80).optional(),
  campusId: z.string().trim().max(120).optional(),
  assigneeId: z.string().trim().max(120).optional(),
})

const SUPPORT_TICKET_CREATE_ERROR = 'No se pudo crear el ticket de soporte'
const SUPPORT_TICKET_LIST_ERROR = 'No se pudieron cargar los tickets de soporte'
const SUPPORT_TICKET_DETAIL_ERROR = 'No se pudo cargar el ticket de soporte'
const SUPPORT_TICKET_MESSAGE_ERROR = 'No se pudo enviar la respuesta de soporte'
const SUPPORT_STAFF_QUEUE_ERROR = 'No se pudo cargar la cola de soporte'
const SUPPORT_STAFF_REPLY_ERROR = 'No se pudo enviar la respuesta de soporte del equipo'
const SUPPORT_STAFF_ASSIGNMENT_ERROR = 'No se pudo asignar el ticket de soporte'
const SUPPORT_STAFF_STATUS_ERROR = 'No se pudo actualizar el estado del ticket de soporte'
type SupportCapability = 'support.view' | 'support.reply' | 'support.manage'
type SupportActionResult<T extends Record<string, unknown> = Record<string, never>> = ({ success: true } & T) | { success: false; error: string }

type SupportTicketRow = {
  id: string
  ticket_number: number
  title: string
  description: string
  status: string
  category: string
  severity: string
  reporter_usuario_id: string
  assignee_usuario_id: string | null
  current_route: string | null
  browser_name: string | null
  os_name: string | null
  viewport: string | null
  app_build_version: string | null
  sentry_event_id: string | null
  diagnostics_consent: boolean
  created_at: string
  updated_at: string
  reporter?: UsuarioProfileRow | null
  assignee?: UsuarioProfileRow | null
}

type UsuarioProfileRow = { id: string; nombre: string | null; apellido: string | null; foto_perfil_url: string | null }
type SupportMessageRow = { id: string; body: string; is_internal: boolean; author_usuario_id: string; created_at: string; author?: UsuarioProfileRow | null }
type SupportAttachmentRow = { id: string; original_filename: string; kind: string; content_type: string; byte_size: number; status: string }
type SupportTicketEventRow = { action: string; actor_usuario_id: string | null; created_at: string; metadata: unknown }
type SupportOutboxMutationResult = { ticketId?: string; ticketNumber?: number; messageId?: string; eventId: string; actorUserId: string }

type StaffSupportTicketRow = Pick<SupportTicketRow, 'id' | 'ticket_number' | 'title' | 'status' | 'category' | 'severity' | 'created_at' | 'updated_at'> & {
  assignee_usuario_id: string | null
  campus_id: string | null
}

type SupportCapabilityRow = { capability: string }

export async function createSupportTicket(formData: FormData): Promise<SupportActionResult<{ ticketId: string; ticketNumber: number }>> {
  const parsed = supportTicketSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Ticket de soporte invalido' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const evidence = sanitizeSupportEvidence(parsed.data)
  const { data, error } = await supabase.rpc('create_support_ticket_with_outbox' as never, {
    p_subject: parsed.data.subject,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_current_route: evidence.current_route,
    p_browser_name: evidence.browser_name,
    p_os_name: evidence.os_name,
    p_viewport: evidence.viewport,
    p_app_build_version: evidence.app_build_version,
    p_sentry_event_id: evidence.sentry_event_id,
    p_diagnostics_consent: evidence.diagnostics_consent,
  } as never)

  const mutation = readSupportOutboxMutationResult(data)
  if (error || !mutation?.ticketId || typeof mutation.ticketNumber !== 'number') return { success: false, error: SUPPORT_TICKET_CREATE_ERROR }

  revalidatePath('/ayuda/tickets')
  return { success: true, ticketId: mutation.ticketId, ticketNumber: mutation.ticketNumber }
}

export async function createSupportTicketFromForm(_previousState: SupportActionResult<{ ticketId: string; ticketNumber: number }> | null, formData: FormData): Promise<SupportActionResult<{ ticketId: string; ticketNumber: number }>> {
  return createSupportTicket(formData)
}

export async function listSupportTickets() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado', tickets: [] }

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id,ticket_number,title,status,category,severity,created_at,updated_at')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: SUPPORT_TICKET_LIST_ERROR, tickets: [] }
  return { success: true, tickets: (data ?? []).map(toTicketSummary) }
}

export async function listStaffSupportTickets(filters: unknown) {
  const parsed = staffQueueFilterSchema.safeParse(filters)
  if (!parsed.success) return { success: false, error: 'Filtros de cola de soporte invalidos', tickets: [] }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return { ...actor, tickets: [] }

  const supportCapabilities = await listActorSupportCapabilities(supabase, actor.usuarioId)
  if (!hasSupportCapability(supportCapabilities, 'support.view')) return { success: false, error: 'No autorizado', tickets: [] }

  const { search, status, category, campusId, assigneeId } = parsed.data
  let query = supabase
    .from('support_tickets')
    .select('id,ticket_number,title,status,category,severity,assignee_usuario_id,campus_id,created_at,updated_at')

  if (search) query = query.textSearch('search_vector', search, { type: 'plain', config: 'simple' })
  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (campusId) query = query.eq('campus_id', campusId)
  if (assigneeId) query = query.eq('assignee_usuario_id', assigneeId)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50)

  if (error) return { success: false, error: SUPPORT_STAFF_QUEUE_ERROR, tickets: [] }
  return { success: true, supportCapabilities, tickets: (data ?? []).map(toStaffTicketSummary) }
}

export async function createStaffSupportTicketReply(ticketId: string, formData: FormData, options: { autoAssignIfUnassigned?: boolean } = {}) {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Respuesta invalida' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor
  const capability = await requireSupportCapability(supabase, actor.usuarioId, 'support.reply')
  if (!capability.success) return capability

  const { data, error } = await supabase.rpc('create_staff_support_ticket_reply_with_outbox' as never, { p_ticket_id: ticketId, p_body: parsed.data.body } as never)
  const mutation = readSupportOutboxMutationResult(data)
  if (error || !mutation?.messageId) return { success: false, error: SUPPORT_STAFF_REPLY_ERROR }

  if (options.autoAssignIfUnassigned) {
    const manageCapability = await requireSupportCapability(supabase, actor.usuarioId, 'support.manage')
    if (manageCapability.success) {
      await supabase.rpc('auto_assign_support_ticket_if_unassigned' as never, { p_ticket_id: ticketId } as never)
    }
  }

  revalidatePath(`/ayuda/tickets/${ticketId}`)
  revalidatePath('/ayuda/admin')
  return { success: true }
}

export async function assignSupportTicket(ticketId: string, assigneeUsuarioId: string | null) {
  const parsed = assigneeUsuarioIdSchema.safeParse(assigneeUsuarioId)
  if (!parsed.success) return { success: false, error: 'Responsable de ticket de soporte invalido' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor
  const capability = await requireSupportCapability(supabase, actor.usuarioId, 'support.manage')
  if (!capability.success) return capability

  const { error } = await supabase.rpc('assign_support_ticket' as never, { p_ticket_id: ticketId, p_assignee_usuario_id: parsed.data } as never)
  if (error) return { success: false, error: SUPPORT_STAFF_ASSIGNMENT_ERROR }

  revalidatePath(`/ayuda/tickets/${ticketId}`)
  revalidatePath('/ayuda/admin')
  return { success: true }
}

export async function updateSupportTicketStatus(ticketId: string, status: string) {
  const parsed = supportTicketStatusSchema.safeParse(status)
  if (!parsed.success) return { success: false, error: 'Estado de ticket de soporte invalido' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor
  const capability = await requireSupportCapability(supabase, actor.usuarioId, 'support.manage')
  if (!capability.success) return capability

  const { data, error } = await supabase.rpc('update_support_ticket_status_with_outbox' as never, { p_ticket_id: ticketId, p_status: parsed.data } as never)
  const mutation = readSupportOutboxMutationResult(data)
  if (error || !mutation) return { success: false, error: SUPPORT_STAFF_STATUS_ERROR }
  await supabase.rpc('auto_assign_support_ticket_if_unassigned' as never, { p_ticket_id: ticketId } as never)

  revalidatePath(`/ayuda/tickets/${ticketId}`)
  revalidatePath('/ayuda/admin')
  return { success: true }
}

export async function getSupportTicketDetail(ticketId: string) {
  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select('id,ticket_number,title,description,status,category,severity,reporter_usuario_id,assignee_usuario_id,current_route,browser_name,os_name,viewport,app_build_version,sentry_event_id,diagnostics_consent,created_at,updated_at,reporter:usuarios!support_tickets_reporter_usuario_id_fkey(id,nombre,apellido,foto_perfil_url),assignee:usuarios!support_tickets_assignee_usuario_id_fkey(id,nombre,apellido,foto_perfil_url)')
    .eq('id', ticketId)
    .maybeSingle()

  if (error) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }
  if (!ticket) return { success: false, error: 'Ticket no encontrado' }
  const supportCapabilities = await listActorSupportCapabilities(supabase, actor.usuarioId)

  const hasInternalCapability = hasSupportCapability(supportCapabilities, 'support.view')
  const messageQuery = supabase
    .from('support_ticket_messages')
    .select('id,body,author_usuario_id,created_at,is_internal,author:usuarios!support_ticket_messages_author_usuario_id_fkey(id,nombre,apellido,foto_perfil_url)')
    .eq('ticket_id', ticketId)

  if (!hasInternalCapability) {
    messageQuery.eq('is_internal', false)
  }

  const { data: messages, error: messagesError } = await messageQuery.order('created_at', { ascending: true })

  if (messagesError) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }

  const { data: attachments, error: attachmentsError } = await supabase
    .from('support_ticket_attachments')
    .select('id,original_filename,kind,content_type,byte_size,status')
    .eq('ticket_id', ticketId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true })

  if (attachmentsError) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }
  const events = hasInternalCapability ? await fetchSafeSupportTicketEvents(supabase, ticketId) : []
  if (events === null) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }
  const profiles = await fetchVisibleSupportProfiles(ticket as SupportTicketRow, messages ?? [])
  return { success: true, ticket: toTicketDetail(ticket as SupportTicketRow, messages ?? [], attachments ?? [], supportCapabilities, profiles, events) }
}

export async function createSupportTicketMessage(ticketId: string, formData: FormData) {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Respuesta invalida' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const { data, error } = await supabase.rpc('create_support_ticket_message_with_outbox' as never, { p_ticket_id: ticketId, p_body: parsed.data.body } as never)
  const mutation = readSupportOutboxMutationResult(data)
  if (error || !mutation?.messageId) return { success: false, error: SUPPORT_TICKET_MESSAGE_ERROR }

  revalidatePath(`/ayuda/tickets/${ticketId}`)
  return { success: true }
}

function readSupportOutboxMutationResult(value: unknown): SupportOutboxMutationResult | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const eventId = readString(row.eventId)
  const actorUserId = readString(row.actorUserId)
  if (!eventId || !actorUserId) return null
  return {
    eventId,
    actorUserId,
    ticketId: readString(row.ticketId),
    ticketNumber: readNumber(row.ticketNumber),
    messageId: readString(row.messageId),
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

async function getActorUsuarioId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }
  const { data, error } = await supabase.from('usuarios').select('id').eq('auth_id', user.id).maybeSingle()
  if (error || !data?.id) return { success: false as const, error: 'Perfil de usuario no encontrado' }
  return { success: true as const, usuarioId: data.id }
}

async function requireSupportCapability(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, usuarioId: string, capability: SupportCapability) {
  const supportCapabilities = await listActorSupportCapabilities(supabase, usuarioId)
  if (!hasSupportCapability(supportCapabilities, capability)) return { success: false as const, error: 'No autorizado' }
  return { success: true as const }
}

async function listActorSupportCapabilities(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, usuarioId: string): Promise<SupportCapability[]> {
  const { data, error } = await supabase
    .from('support_user_capabilities')
    .select('capability')
    .eq('usuario_id', usuarioId)
    .is('revoked_at', null)

  if (error) return []
  return (data ?? [])
    .map((row: SupportCapabilityRow) => row.capability)
    .filter((capability): capability is SupportCapability => SUPPORT_TICKET_CAPABILITIES.includes(capability as SupportCapability))
}

function hasSupportCapability(supportCapabilities: SupportCapability[], requiredCapability: SupportCapability) {
  return supportCapabilities.some((capability) => {
    if (capability === requiredCapability) return true
    if (capability === 'support.manage') return true
    return capability === 'support.reply' && requiredCapability === 'support.view'
  })
}

function toTicketSummary(ticket: Omit<SupportTicketRow, 'description' | 'reporter_usuario_id' | 'assignee_usuario_id' | 'current_route' | 'browser_name' | 'os_name' | 'viewport' | 'app_build_version' | 'sentry_event_id' | 'diagnostics_consent' | 'reporter' | 'assignee'>) {
  return { id: ticket.id, ticketNumber: ticket.ticket_number, title: ticket.title, status: ticket.status, category: ticket.category, severity: ticket.severity, createdAt: ticket.created_at, updatedAt: ticket.updated_at }
}

function toTicketDetail(ticket: SupportTicketRow, messages: SupportMessageRow[], attachments: SupportAttachmentRow[], supportCapabilities: SupportCapability[], profiles: Map<string, UsuarioProfileRow> = new Map(), events: SafeSupportTicketEvent[] = []) {
  return {
    ...toTicketSummary(ticket),
    description: ticket.description,
    reporterUsuarioId: ticket.reporter_usuario_id,
    assigneeUsuarioId: ticket.assignee_usuario_id,
    reporter: toSafeUsuarioProfile(ticket.reporter ?? profiles.get(ticket.reporter_usuario_id)),
    assignee: toSafeUsuarioProfile(ticket.assignee ?? (ticket.assignee_usuario_id ? profiles.get(ticket.assignee_usuario_id) : null)),
    evidence: { currentRoute: ticket.current_route, browserName: ticket.browser_name, osName: ticket.os_name, viewport: ticket.viewport, appBuildVersion: ticket.app_build_version, sentryEventId: ticket.sentry_event_id, diagnosticsConsent: ticket.diagnostics_consent },
    messages: messages.map((message) => ({ id: message.id, body: message.body, isInternal: message.is_internal, authorUsuarioId: message.author_usuario_id, author: toSafeUsuarioProfile(message.author ?? profiles.get(message.author_usuario_id)), createdAt: message.created_at })),
    attachments: attachments.map((attachment) => ({ id: attachment.id, filename: attachment.original_filename, kind: attachment.kind, contentType: attachment.content_type, byteSize: attachment.byte_size, status: attachment.status })),
    events,
    supportCapabilities,
  }
}

type SafeSupportTicketEvent = {
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

async function fetchSafeSupportTicketEvents(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, ticketId: string): Promise<SafeSupportTicketEvent[] | null> {
  const { data, error } = await supabase
    .from('support_ticket_events')
    .select('action,actor_usuario_id,created_at,metadata')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  if (error) return null
  return (data ?? []).map((event) => toSafeSupportTicketEvent(event as SupportTicketEventRow))
}

function toSafeSupportTicketEvent(event: SupportTicketEventRow): SafeSupportTicketEvent {
  return {
    type: event.action,
    createdAt: event.created_at,
    actorUsuarioId: event.actor_usuario_id,
    metadata: pickSafeSupportEventMetadata(event.metadata),
  }
}

function pickSafeSupportEventMetadata(metadata: unknown): SafeSupportTicketEvent['metadata'] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const source = readSafeMetadataString((metadata as Record<string, unknown>).source)
  const status = readSafeMetadataString((metadata as Record<string, unknown>).status)
  const category = readSafeMetadataString((metadata as Record<string, unknown>).category)
  const actor = readSafeMetadataString((metadata as Record<string, unknown>).actor)
  return {
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(actor ? { actor } : {}),
  }
}

function readSafeMetadataString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 120) return undefined
  return trimmed
}

async function fetchVisibleSupportProfiles(ticket: SupportTicketRow, messages: SupportMessageRow[]) {
  const profileIds = new Set<string>([ticket.reporter_usuario_id])
  const profiles = new Map<string, UsuarioProfileRow>()
  if (ticket.reporter) profiles.set(ticket.reporter.id, ticket.reporter)
  if (ticket.assignee) profiles.set(ticket.assignee.id, ticket.assignee)

  if (ticket.assignee_usuario_id) profileIds.add(ticket.assignee_usuario_id)
  for (const message of messages) {
    profileIds.add(message.author_usuario_id)
    if (message.author) profiles.set(message.author.id, message.author)
  }

  const missingProfileIds = [...profileIds].filter((id) => !profiles.has(id))

  if (missingProfileIds.length === 0) return profiles

  try {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('usuarios')
      .select('id,nombre,apellido,foto_perfil_url')
      .in('id', missingProfileIds)

    if (error) return profiles
    for (const profile of data ?? []) profiles.set(profile.id, profile as UsuarioProfileRow)
    return profiles
  } catch {
    return profiles
  }
}

function toSafeUsuarioProfile(profile: UsuarioProfileRow | null | undefined) {
  if (!profile) return null
  return { id: profile.id, nombre: profile.nombre, apellido: profile.apellido, photoUrl: profile.foto_perfil_url }
}

function toStaffTicketSummary(ticket: StaffSupportTicketRow) {
  return { ...toTicketSummary(ticket), assigneeUsuarioId: ticket.assignee_usuario_id, campusId: ticket.campus_id }
}
