import {
  assignSupportTicket,
  createSupportTicket,
  createSupportTicketMessage,
  createStaffSupportTicketReply,
  getSupportTicketDetail,
  listStaffSupportTickets,
  listSupportTickets,
  updateSupportTicketStatus,
} from '@/lib/actions/support.actions'
import { sanitizeSupportEvidence } from '@/lib/support/support-evidence'
import { dispatchSupportInngestEvent } from '@/lib/support/inngest'

const createSupabaseServerClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
jest.mock('@/lib/support/inngest', () => ({
  createSupportTicketCreatedEvent: (payload: { eventId: string; ticketId: string; actorUserId?: string }) => ({
    name: 'support/ticket.created',
    id: `support:${payload.eventId}`,
    data: payload,
  }),
  dispatchSupportInngestEvent: jest.fn(),
}))

const dispatchSupportInngestEventMock = jest.mocked(dispatchSupportInngestEvent)

describe('support reporter actions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    dispatchSupportInngestEventMock.mockReset()
    revalidatePath.mockReset()
  })

  it('sanitizes evidence to the reporter-safe allowlist', () => {
    expect(sanitizeSupportEvidence({
      currentRoute: '/dashboard?token=secret#section',
      browserName: 'Chrome',
      osName: 'macOS',
      viewport: '1440x900',
      appBuildVersion: 'build-123',
      sentryEventId: 'event-1',
      diagnosticsConsent: true,
      cookies: 'private',
      localStorage: 'private',
      rawSentryPayload: { secret: true },
    })).toEqual({
      current_route: '/dashboard',
      browser_name: 'Chrome',
      os_name: 'macOS',
      viewport: '1440x900',
      app_build_version: 'build-123',
      sentry_event_id: 'event-1',
      diagnostics_consent: true,
    })
  })

  it('does not persist diagnostic fields without reporter consent', () => {
    expect(sanitizeSupportEvidence({
      currentRoute: '/dashboard#token-secret',
      browserName: 'Chrome',
      osName: 'macOS',
      viewport: '1440x900',
      appBuildVersion: 'build-123',
      sentryEventId: 'event-1',
      diagnosticsConsent: 'false',
    })).toEqual({
      current_route: '/dashboard',
      browser_name: null,
      os_name: null,
      viewport: null,
      app_build_version: null,
      sentry_event_id: null,
      diagnostics_consent: false,
    })
  })

  it('captures safe diagnostics by default', () => {
    expect(sanitizeSupportEvidence({
      currentRoute: '/dashboard?token=secret#section',
      browserName: 'Chrome',
      osName: 'macOS',
      viewport: '1440x900',
      appBuildVersion: 'build-123',
      sentryEventId: 'event-1',
    })).toEqual({
      current_route: '/dashboard',
      browser_name: 'Chrome',
      os_name: 'macOS',
      viewport: '1440x900',
      app_build_version: 'build-123',
      sentry_event_id: 'event-1',
      diagnostics_consent: true,
    })
  })

  it('rejects anonymous ticket creation before inserting', async () => {
    const insert = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: jest.fn().mockReturnValue({ insert }),
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: false, error: 'No autenticado' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates a received ticket for the authenticated reporter', async () => {
    const insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42 }, error: null }) }) })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert }),
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: true, ticketId: 'ticket-1', ticketNumber: 42 })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      reporter_usuario_id: 'usuario-1',
      status: 'received',
      title: 'Cannot open group map',
      severity: 'normal',
      diagnostics_consent: true,
    }))
    expect(insert.mock.calls[0][0]).not.toHaveProperty('cookies')
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets')
  })

  it('audits reporter ticket creation and dispatches an ID-only ticket-created event after commit', async () => {
    dispatchSupportInngestEventMock.mockResolvedValue({ success: true, skipped: true, reason: 'Provider not configured' })
    const ticketInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42 }, error: null }) }) })
    const eventInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null }) }) })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createReporterMutationFromMock({ usuarioId: 'usuario-1', ticketInsert, eventInsert }),
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: true, ticketId: 'ticket-1', ticketNumber: 42 })
    expect(eventInsert).toHaveBeenCalledWith({
      ticket_id: 'ticket-1',
      actor_usuario_id: 'usuario-1',
      action: 'support.ticket.created',
      target_type: 'support_ticket',
      target_id: 'ticket-1',
      metadata: { source: 'reporter' },
    })
    expect(dispatchSupportInngestEventMock).toHaveBeenCalledWith({
      name: 'support/ticket.created',
      id: 'support:event-1',
      data: { eventId: 'event-1', ticketId: 'ticket-1', actorUserId: 'usuario-1' },
    })
  })

  it('lists only public reporter fields from RLS-filtered tickets', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [{ id: 'ticket-1', ticket_number: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z', description: 'private detail' }], error: null }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] })
  })

  it('returns ticket detail with public messages, safe attachments, and no internal evidence', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42, title: 'Map bug', description: 'Steps', status: 'received', category: 'bug', severity: 'normal', assignee_usuario_id: null, current_route: '/dashboard', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: 'build-123', sentry_event_id: 'event-1', diagnostics_consent: true, created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'message-1', body: 'Public reply', is_internal: false, created_at: '2026-06-09T00:01:00Z' }], error: null }) }
    messagesFilter.eq.mockReturnValue(messagesFilter)
    const messagesQuery = { select: jest.fn().mockReturnValue(messagesFilter) }
    const attachmentsFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'attachment-1', original_filename: 'map-error.webp', kind: 'screenshot', content_type: 'image/webp', byte_size: 2048, status: 'uploaded', object_key: 'support/ticket-1/attachment-1/map-error.webp' }], error: null }) }
    attachmentsFilter.eq.mockReturnValue(attachmentsFilter)
    const attachmentsQuery = { select: jest.fn().mockReturnValue(attachmentsFilter) }
    const capabilitiesFilter = { eq: jest.fn(), is: jest.fn().mockResolvedValue({ data: [], error: null }) }
    capabilitiesFilter.eq.mockReturnValue(capabilitiesFilter)
    const capabilitiesQuery = { select: jest.fn().mockReturnValue(capabilitiesFilter) }
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn((table) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'usuario-1' }, error: null }) }) }) }
        if (table === 'support_tickets') return ticketQuery
        if (table === 'support_ticket_messages') return messagesQuery
        if (table === 'support_user_capabilities') return capabilitiesQuery
        return attachmentsQuery
      }),
    })

    const result = await getSupportTicketDetail('ticket-1')

    expect(result.success).toBe(true)
    expect(result.ticket?.messages).toEqual([{ id: 'message-1', body: 'Public reply', createdAt: '2026-06-09T00:01:00Z' }])
    expect(result.ticket?.attachments).toEqual([{ id: 'attachment-1', filename: 'map-error.webp', kind: 'screenshot', contentType: 'image/webp', byteSize: 2048, status: 'uploaded' }])
    expect(result.ticket?.assigneeUsuarioId).toBeNull()
    expect(result.ticket?.supportCapabilities).toEqual([])
    expect(result.ticket?.attachments[0]).not.toHaveProperty('objectKey')
    expect(result.ticket?.attachments[0]).not.toHaveProperty('downloadUrl')
    expect(result.ticket).not.toHaveProperty('rawSentryPayload')
    expect(messagesFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1')
    expect(messagesFilter.eq).toHaveBeenCalledWith('is_internal', false)
    expect(attachmentsQuery.select).toHaveBeenCalledWith('id,original_filename,kind,content_type,byte_size,status')
    expect(attachmentsFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1')
  })

  it('maps Supabase list errors to a stable user-safe message', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: { message: 'relation support_tickets does not exist' } }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: false, error: 'No se pudieron cargar los tickets de soporte', tickets: [] })
  })

  it('adds reporter public replies only', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert }),
    })

    const result = await createSupportTicketMessage('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith({ ticket_id: 'ticket-1', author_usuario_id: 'usuario-1', body: 'I can reproduce it on mobile.', is_internal: false })
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets/ticket-1')
  })

  it('audits reporter public replies after the message commit', async () => {
    const messageInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'message-1' }, error: null }) }) })
    const eventInsert = jest.fn().mockResolvedValue({ error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createReporterMutationFromMock({ usuarioId: 'usuario-1', messageInsert, eventInsert }),
    })

    const result = await createSupportTicketMessage('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(eventInsert).toHaveBeenCalledWith({
      ticket_id: 'ticket-1',
      actor_usuario_id: 'usuario-1',
      action: 'support.reporter_message.created',
      target_type: 'support_ticket_message',
      target_id: 'message-1',
      metadata: { source: 'reporter' },
    })
  })

  it('denies staff queue access without support.view-equivalent capability', async () => {
    const supportTicketsQuery = createStaffTicketQuery([])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', supportCapabilities: [], supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({})

    expect(result).toEqual({ success: false, error: 'No autorizado', tickets: [] })
    expect(supportTicketsQuery.select).not.toHaveBeenCalled()
  })

  it('builds a staff queue query with FTS and filters', async () => {
    const supportTicketsQuery = createStaffTicketQuery([{ id: 'ticket-2', ticket_number: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assignee_usuario_id: 'assignee-1', campus_id: 'campus-1', created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:05:00Z' }])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', supportCapabilities: ['support.view'], supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({ search: 'attendance', status: 'in_progress', category: 'bug', campusId: 'campus-1', assigneeId: 'assignee-1' })

    expect(result).toEqual({ success: true, supportCapabilities: ['support.view'], tickets: [{ id: 'ticket-2', ticketNumber: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assigneeUsuarioId: 'assignee-1', campusId: 'campus-1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:05:00Z' }] })
    expect(supportTicketsQuery.textSearch).toHaveBeenCalledWith('search_vector', 'attendance', { type: 'plain', config: 'simple' })
    expect(supportTicketsQuery.eq).toHaveBeenCalledWith('status', 'in_progress')
    expect(supportTicketsQuery.eq).toHaveBeenCalledWith('category', 'bug')
    expect(supportTicketsQuery.eq).toHaveBeenCalledWith('campus_id', 'campus-1')
    expect(supportTicketsQuery.eq).toHaveBeenCalledWith('assignee_usuario_id', 'assignee-1')
    expect(supportTicketsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(supportTicketsQuery.limit).toHaveBeenCalledWith(50)
  })

  it('maps Supabase staff queue errors to a stable user-safe message', async () => {
    const supportTicketsQuery = createStaffTicketQuery([], { message: 'permission denied for table support_tickets' })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', supportCapabilities: ['support.view'], supportTicketsQuery }),
    })

    await expect(listStaffSupportTickets({})).resolves.toEqual({ success: false, error: 'No se pudo cargar la cola de soporte', tickets: [] })
  })

  it('allows pure support.reply staff to load the staff queue', async () => {
    const supportTicketsQuery = createStaffTicketQuery([{ id: 'ticket-2', ticket_number: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assignee_usuario_id: null, campus_id: null, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:05:00Z' }])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', supportCapabilities: ['support.reply'], supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({})

    expect(result).toEqual({ success: true, supportCapabilities: ['support.reply'], tickets: [{ id: 'ticket-2', ticketNumber: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assigneeUsuarioId: null, campusId: null, createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:05:00Z' }] })
    expect(supportTicketsQuery.select).toHaveBeenCalled()
  })

  it('allows pure support.manage staff to load and manage the staff queue', async () => {
    const supportTicketsQuery = createStaffTicketQuery([{ id: 'ticket-3', ticket_number: 44, title: 'Cannot access admin queue', status: 'received', category: 'access', severity: 'normal', assignee_usuario_id: null, campus_id: null, created_at: '2026-06-10T01:00:00Z', updated_at: '2026-06-10T01:05:00Z' }])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', supportCapabilities: ['support.manage'], supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({})

    expect(result).toEqual({ success: true, supportCapabilities: ['support.manage'], tickets: [{ id: 'ticket-3', ticketNumber: 44, title: 'Cannot access admin queue', status: 'received', category: 'access', severity: 'normal', assigneeUsuarioId: null, campusId: null, createdAt: '2026-06-10T01:00:00Z', updatedAt: '2026-06-10T01:05:00Z' }] })
    expect(supportTicketsQuery.select).toHaveBeenCalled()
  })

  it('denies direct staff replies without support.reply before invoking the atomic RPC', async () => {
    const rpc = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: false }),
      rpc,
    })

    const result = await createStaffSupportTicketReply('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('adds a staff reply through the atomic audit RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.reply' }),
      rpc,
    })

    const result = await createStaffSupportTicketReply('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_staff_support_ticket_reply', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets/ticket-1')
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/admin')
  })

  it('assigns a support ticket through the atomic audit RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await assignSupportTicket('ticket-1', '11111111-1111-4111-8111-111111111111')

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('assign_support_ticket', { p_ticket_id: 'ticket-1', p_assignee_usuario_id: '11111111-1111-4111-8111-111111111111' })
  })

  it('validates staff status transitions before updating', async () => {
    const rpc = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await updateSupportTicketStatus('ticket-1', 'invalid')

    expect(result).toEqual({ success: false, error: 'Estado de ticket de soporte invalido' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('updates a support ticket status through the atomic audit RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await updateSupportTicketStatus('ticket-1', 'resolved')

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('update_support_ticket_status', { p_ticket_id: 'ticket-1', p_status: 'resolved' })
  })

  it('maps denied staff status saves to a stable user-safe message', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { message: 'not authorized' } })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await updateSupportTicketStatus('ticket-1', 'closed')

    expect(result).toEqual({ success: false, error: 'No se pudo actualizar el estado del ticket de soporte' })
  })
})

function createTicketFormData() {
  const formData = new FormData()
  formData.set('subject', 'Cannot open group map')
  formData.set('description', 'The map stays blank after I open the dashboard.')
  formData.set('category', 'bug')
  formData.set('currentRoute', '/dashboard')
  formData.set('browserName', 'Chrome')
  formData.set('osName', 'macOS')
  formData.set('viewport', '1440x900')
  formData.set('appBuildVersion', 'build-123')
  formData.set('sentryEventId', 'event-1')
  formData.set('diagnosticsConsent', 'true')
  formData.set('cookies', 'private')
  return formData
}

function createMessageFormData() {
  const formData = new FormData()
  formData.set('body', 'I can reproduce it on mobile.')
  formData.set('isInternal', 'true')
  return formData
}

function createFromMock(input: { usuarioId: string; insert: jest.Mock }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    return { insert: input.insert }
  })
}

function createReporterMutationFromMock(input: { usuarioId: string; ticketInsert?: jest.Mock; messageInsert?: jest.Mock; eventInsert: jest.Mock }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    if (table === 'support_tickets') return { insert: input.ticketInsert }
    if (table === 'support_ticket_messages') return { insert: input.messageInsert }
    if (table === 'support_ticket_events') return { insert: input.eventInsert }
    throw new Error(`Unexpected table ${table}`)
  })
}

function createStaffFromMock(input: { usuarioId: string; supportCapabilities: string[]; supportTicketsQuery: ReturnType<typeof createStaffTicketQuery> }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    if (table === 'support_user_capabilities') return createSupportCapabilityQuery(input.supportCapabilities)
    return input.supportTicketsQuery
  })
}

function createSupportCapabilityQuery(supportCapabilities: string[]) {
  let requestedCapability: string | null = null
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockImplementation((column: string, value: string) => {
      if (column === 'capability') requestedCapability = value
      return query
    }),
    is: jest.fn().mockImplementation(() => {
      if (requestedCapability) {
        return { maybeSingle: jest.fn().mockResolvedValue({ data: supportCapabilities.includes(requestedCapability) ? { capability: requestedCapability } : null, error: null }) }
      }

      return Promise.resolve({ data: supportCapabilities.map((capability) => ({ capability })), error: null })
    }),
  }

  return query
}

function createStaffTicketQuery(rows: Array<Record<string, string | number | null>>, error: { message: string } | null = null) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    textSearch: jest.fn(),
    order: jest.fn(),
    limit: jest.fn().mockResolvedValue({ data: error ? null : rows, error }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.textSearch.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

function createStaffActionFromMock(input: { usuarioId: string; hasCapability: boolean; capability?: string }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    if (table === 'support_user_capabilities') return createSupportCapabilityQuery(input.hasCapability ? [input.capability ?? 'support.view'] : [])
    throw new Error(`Unexpected table ${table}`)
  })
}
