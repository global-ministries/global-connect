"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { diagnosticsConsentSchema, sanitizeSupportEvidence } from '@/lib/support/support-evidence'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supportTicketSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(8000),
  category: z.string().trim().min(2).max(80),
  severity: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  currentRoute: z.string().trim().max(500).optional(),
  browserName: z.string().trim().max(120).optional(),
  osName: z.string().trim().max(120).optional(),
  viewport: z.string().trim().max(40).optional(),
  appBuildVersion: z.string().trim().max(120).optional(),
  sentryEventId: z.string().trim().max(120).optional(),
  diagnosticsConsent: diagnosticsConsentSchema,
})

const messageSchema = z.object({ body: z.string().trim().min(1).max(8000) })

const staffQueueFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['received', 'in_review', 'in_progress', 'resolved', 'closed']).optional(),
  category: z.string().trim().max(80).optional(),
  campusId: z.string().trim().max(120).optional(),
  assigneeId: z.string().trim().max(120).optional(),
})

const SUPPORT_TICKET_CREATE_ERROR = 'Unable to create support ticket'
const SUPPORT_TICKET_LIST_ERROR = 'Unable to load support tickets'
const SUPPORT_TICKET_DETAIL_ERROR = 'Unable to load support ticket'
const SUPPORT_TICKET_MESSAGE_ERROR = 'Unable to send support reply'
const SUPPORT_STAFF_QUEUE_ERROR = 'Unable to load support queue'

type SupportTicketRow = {
  id: string
  ticket_number: number
  title: string
  description: string
  status: string
  category: string
  severity: string
  current_route: string | null
  browser_name: string | null
  os_name: string | null
  viewport: string | null
  app_build_version: string | null
  sentry_event_id: string | null
  diagnostics_consent: boolean
  created_at: string
  updated_at: string
}

type SupportMessageRow = { id: string; body: string; created_at: string }

type StaffSupportTicketRow = Pick<SupportTicketRow, 'id' | 'ticket_number' | 'title' | 'status' | 'category' | 'severity' | 'created_at' | 'updated_at'> & {
  assignee_usuario_id: string | null
  campus_id: string | null
}

export async function createSupportTicket(formData: FormData) {
  const parsed = supportTicketSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid support ticket' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const { data, error } = await supabase.from('support_tickets').insert({
    reporter_usuario_id: actor.usuarioId,
    status: 'received',
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    severity: parsed.data.severity,
    ...sanitizeSupportEvidence(parsed.data),
  }).select('id,ticket_number').single()

  if (error || !data) return { success: false, error: SUPPORT_TICKET_CREATE_ERROR }
  revalidatePath('/ayuda/tickets')
  return { success: true, ticketId: data.id, ticketNumber: data.ticket_number }
}

export async function listSupportTickets() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated', tickets: [] }

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id,ticket_number,title,status,category,severity,created_at,updated_at')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: SUPPORT_TICKET_LIST_ERROR, tickets: [] }
  return { success: true, tickets: (data ?? []).map(toTicketSummary) }
}

export async function listStaffSupportTickets(filters: unknown) {
  const parsed = staffQueueFilterSchema.safeParse(filters)
  if (!parsed.success) return { success: false, error: 'Invalid support queue filters', tickets: [] }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return { ...actor, tickets: [] }

  // This is only a fast app-level precheck; RLS remains the authoritative global-admin/support.view gate.
  const capability = await supabase
    .from('support_user_capabilities')
    .select('capability')
    .eq('usuario_id', actor.usuarioId)
    .eq('capability', 'support.view')
    .is('revoked_at', null)
    .maybeSingle()

  if (capability.error || !capability.data) return { success: false, error: 'Not authorized', tickets: [] }

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
  return { success: true, tickets: (data ?? []).map(toStaffTicketSummary) }
}

export async function getSupportTicketDetail(ticketId: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select('id,ticket_number,title,description,status,category,severity,current_route,browser_name,os_name,viewport,app_build_version,sentry_event_id,diagnostics_consent,created_at,updated_at')
    .eq('id', ticketId)
    .maybeSingle()

  if (error) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }
  if (!ticket) return { success: false, error: 'Ticket not found' }

  const { data: messages, error: messagesError } = await supabase
    .from('support_ticket_messages')
    .select('id,body,created_at')
    .eq('ticket_id', ticketId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })

  if (messagesError) return { success: false, error: SUPPORT_TICKET_DETAIL_ERROR }
  return { success: true, ticket: toTicketDetail(ticket as SupportTicketRow, messages ?? []) }
}

export async function createSupportTicketMessage(ticketId: string, formData: FormData) {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid reply' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const { error } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    author_usuario_id: actor.usuarioId,
    body: parsed.data.body,
    is_internal: false,
  })

  if (error) return { success: false, error: SUPPORT_TICKET_MESSAGE_ERROR }
  revalidatePath(`/ayuda/tickets/${ticketId}`)
  return { success: true }
}

async function getActorUsuarioId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'Not authenticated' }
  const { data, error } = await supabase.from('usuarios').select('id').eq('auth_id', user.id).maybeSingle()
  if (error || !data?.id) return { success: false as const, error: 'User profile not found' }
  return { success: true as const, usuarioId: data.id }
}

function toTicketSummary(ticket: Omit<SupportTicketRow, 'description' | 'current_route' | 'browser_name' | 'os_name' | 'viewport' | 'app_build_version' | 'sentry_event_id' | 'diagnostics_consent'>) {
  return { id: ticket.id, ticketNumber: ticket.ticket_number, title: ticket.title, status: ticket.status, category: ticket.category, severity: ticket.severity, createdAt: ticket.created_at, updatedAt: ticket.updated_at }
}

function toTicketDetail(ticket: SupportTicketRow, messages: SupportMessageRow[]) {
  return {
    ...toTicketSummary(ticket),
    description: ticket.description,
    evidence: { currentRoute: ticket.current_route, browserName: ticket.browser_name, osName: ticket.os_name, viewport: ticket.viewport, appBuildVersion: ticket.app_build_version, sentryEventId: ticket.sentry_event_id, diagnosticsConsent: ticket.diagnostics_consent },
    messages: messages.map((message) => ({ id: message.id, body: message.body, createdAt: message.created_at })),
  }
}

function toStaffTicketSummary(ticket: StaffSupportTicketRow) {
  return { ...toTicketSummary(ticket), assigneeUsuarioId: ticket.assignee_usuario_id, campusId: ticket.campus_id }
}
