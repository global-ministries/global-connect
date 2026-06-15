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
const createSupabaseAdminClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
jest.mock('@/lib/support/inngest', () => ({
  createSupportTicketCreatedEvent: (payload: { eventId: string; ticketId: string; actorUserId?: string }) => ({
    name: 'support/ticket.created',
    id: `support:${payload.eventId}`,
    data: payload,
  }),
  createSupportTicketMessageCreatedEvent: (payload: { eventId: string; ticketId: string; messageId: string; actorUserId?: string }) => ({
    name: 'support/ticket.message.created',
    id: `support:${payload.eventId}`,
    data: payload,
  }),
  createSupportTicketStatusChangedEvent: (payload: { eventId: string; ticketId: string; actorUserId?: string }) => ({
    name: 'support/ticket.status.changed',
    id: `support:${payload.eventId}`,
    data: payload,
  }),
  dispatchSupportInngestEvent: jest.fn(),
}))

const dispatchSupportInngestEventMock = jest.mocked(dispatchSupportInngestEvent)

describe('support reporter actions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    createSupabaseAdminClient.mockReturnValue({ from: jest.fn() })
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
    const rpc = jest.fn().mockResolvedValue({ data: { ticketId: 'ticket-1', ticketNumber: 42, eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert: jest.fn() }),
      rpc,
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: true, ticketId: 'ticket-1', ticketNumber: 42 })
    expect(rpc).toHaveBeenCalledWith('create_support_ticket_with_outbox', expect.objectContaining({
      p_subject: 'Cannot open group map',
      p_description: 'The map stays blank after I open the dashboard.',
      p_category: 'bug',
      p_diagnostics_consent: true,
    }))
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('cookies')
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets')
  })

  it('creates reporter tickets through the atomic outbox RPC without immediate provider dispatch', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ticketId: 'ticket-1', ticketNumber: 42, eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert: jest.fn() }),
      rpc,
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: true, ticketId: 'ticket-1', ticketNumber: 42 })
    expect(rpc).toHaveBeenCalledWith('create_support_ticket_with_outbox', expect.any(Object))
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
  })

  it('does not dispatch when the atomic ticket creation RPC fails', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'outbox insert failed' } })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert: jest.fn() }),
      rpc,
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: false, error: 'No se pudo crear el ticket de soporte' })
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('lists only public reporter fields from RLS-filtered tickets', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [{ id: 'ticket-1', ticket_number: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z', description: 'private detail' }], error: null }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] })
  })

  it('returns ticket detail with public messages, safe attachments, and no internal evidence', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42, title: 'Map bug', description: 'Steps', status: 'received', category: 'bug', severity: 'normal', reporter_usuario_id: 'usuario-1', assignee_usuario_id: null, reporter: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, assignee: null, current_route: '/dashboard', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: 'build-123', sentry_event_id: 'event-1', diagnostics_consent: true, created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'message-1', body: 'Public reply', author_usuario_id: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, is_internal: false, created_at: '2026-06-09T00:01:00Z' }], error: null }) }
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
        if (table === 'support_ticket_events') throw new Error('Reporter detail must not fetch support events')
        return attachmentsQuery
      }),
    })

    const result = await getSupportTicketDetail('ticket-1')

    expect(result.success).toBe(true)
    expect(result.ticket?.messages).toEqual([{ id: 'message-1', body: 'Public reply', isInternal: false, authorUsuarioId: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null }, createdAt: '2026-06-09T00:01:00Z' }])
    expect(result.ticket?.attachments).toEqual([{ id: 'attachment-1', filename: 'map-error.webp', kind: 'screenshot', contentType: 'image/webp', byteSize: 2048, status: 'uploaded' }])
    expect(result.ticket?.reporter).toEqual({ id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null })
    expect(result.ticket?.assigneeUsuarioId).toBeNull()
    expect(result.ticket?.supportCapabilities).toEqual([])
    expect(result.ticket?.attachments[0]).not.toHaveProperty('objectKey')
    expect(result.ticket?.attachments[0]).not.toHaveProperty('downloadUrl')
    expect(result.ticket).not.toHaveProperty('rawSentryPayload')
    expect(result.ticket?.events).toEqual([])
    expect(messagesFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1')
    expect(messagesFilter.eq).toHaveBeenCalledWith('is_internal', false)
    expect(attachmentsQuery.select).toHaveBeenCalledWith('id,original_filename,kind,content_type,byte_size,status')
    expect(attachmentsFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1')
    expect(attachmentsFilter.eq).toHaveBeenCalledWith('status', 'uploaded')
  })

  it('hydrates assigned staff and staff message profiles when reporter RLS omits embedded usuarios', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42, title: 'Map bug', description: 'Steps', status: 'in_progress', category: 'bug', severity: 'normal', reporter_usuario_id: 'usuario-1', assignee_usuario_id: 'staff-1', reporter: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, assignee: null, current_route: '/dashboard', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: 'build-123', sentry_event_id: 'event-1', diagnostics_consent: true, created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'message-1', body: 'Support reply', author_usuario_id: 'staff-1', author: null, is_internal: false, created_at: '2026-06-09T00:01:00Z' }], error: null }) }
    messagesFilter.eq.mockReturnValue(messagesFilter)
    const attachmentsFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [], error: null }) }
    attachmentsFilter.eq.mockReturnValue(attachmentsFilter)
    const capabilitiesFilter = { eq: jest.fn(), is: jest.fn().mockResolvedValue({ data: [], error: null }) }
    capabilitiesFilter.eq.mockReturnValue(capabilitiesFilter)
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn((table) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'usuario-1' }, error: null }) }) }) }
        if (table === 'support_tickets') return ticketQuery
        if (table === 'support_ticket_messages') return { select: jest.fn().mockReturnValue(messagesFilter) }
        if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnValue(capabilitiesFilter) }
        return { select: jest.fn().mockReturnValue(attachmentsFilter) }
      }),
    })
    const adminIn = jest.fn().mockResolvedValue({ data: [{ id: 'staff-1', nombre: 'Sofia', apellido: 'Soporte', foto_perfil_url: 'https://cdn.example/staff.webp' }], error: null })
    createSupabaseAdminClient.mockReturnValue({ from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ in: adminIn }) }) })

    const result = await getSupportTicketDetail('ticket-1')

    expect(result.success).toBe(true)
    expect(result.ticket?.assignee).toEqual({ id: 'staff-1', nombre: 'Sofia', apellido: 'Soporte', photoUrl: 'https://cdn.example/staff.webp' })
    expect(result.ticket?.messages[0].author).toEqual({ id: 'staff-1', nombre: 'Sofia', apellido: 'Soporte', photoUrl: 'https://cdn.example/staff.webp' })
    expect(adminIn).toHaveBeenCalledWith('id', ['staff-1'])
  })

  it('filters internal messages for reporters without support.view-equivalent capability', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-2', ticket_number: 43, title: 'Billing issue', description: 'No invoice', status: 'received', category: 'billing', severity: 'normal', reporter_usuario_id: 'usuario-1', assignee_usuario_id: 'staff-1', reporter: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, assignee: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', foto_perfil_url: 'https://cdn.example/staff.webp' }, current_route: '/billing', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: null, sentry_event_id: null, diagnostics_consent: true, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:05:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'message-1', body: 'Public reply', author_usuario_id: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, is_internal: false, created_at: '2026-06-10T00:01:00Z' }], error: null }) }
    messagesFilter.eq.mockReturnValue(messagesFilter)
    const messagesQuery = { select: jest.fn().mockReturnValue(messagesFilter) }
    const attachmentsFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [], error: null }) }
    attachmentsFilter.eq.mockReturnValue(attachmentsFilter)
    const attachmentsQuery = { select: jest.fn().mockReturnValue(attachmentsFilter) }
    const capabilitiesFilter = { eq: jest.fn(), is: jest.fn().mockResolvedValue({ data: [], error: null }) }
    capabilitiesFilter.eq.mockReturnValue(capabilitiesFilter)

    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'reporter-1' } } }) },
      from: jest.fn((table) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'usuario-1' }, error: null }) }) }) }
        if (table === 'support_tickets') return ticketQuery
        if (table === 'support_ticket_messages') return messagesQuery
        if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnValue(capabilitiesFilter) }
        return attachmentsQuery
      }),
    })

    const result = await getSupportTicketDetail('ticket-2')

    expect(result.success).toBe(true)
    expect(result.ticket?.messages).toEqual([{ id: 'message-1', body: 'Public reply', isInternal: false, authorUsuarioId: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null }, createdAt: '2026-06-10T00:01:00Z' }])
    expect(messagesFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-2')
    expect(messagesFilter.eq).toHaveBeenCalledWith('is_internal', false)
  })

  it('returns internal messages for staff with support.view-equivalent capability', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-3', ticket_number: 44, title: 'Access issue', description: 'Need internal context', status: 'received', category: 'access', severity: 'high', reporter_usuario_id: 'usuario-1', assignee_usuario_id: 'staff-1', reporter: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, assignee: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', foto_perfil_url: 'https://cdn.example/staff.webp' }, current_route: '/access', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: null, sentry_event_id: null, diagnostics_consent: true, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:05:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [
      { id: 'message-1', body: 'Public reply', author_usuario_id: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null }, is_internal: false, created_at: '2026-06-10T00:01:00Z' },
      { id: 'message-2', body: 'Internal note', author_usuario_id: 'staff-1', author: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', foto_perfil_url: 'https://cdn.example/staff.webp' }, is_internal: true, created_at: '2026-06-10T00:02:00Z' },
    ], error: null }) }
    messagesFilter.eq.mockReturnValue(messagesFilter)
    const messagesQuery = { select: jest.fn().mockReturnValue(messagesFilter) }
    const attachmentsFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [], error: null }) }
    attachmentsFilter.eq.mockReturnValue(attachmentsFilter)
    const attachmentsQuery = { select: jest.fn().mockReturnValue(attachmentsFilter) }
    const eventsFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [
      { action: 'support.ticket.status_changed', actor_usuario_id: 'staff-1', created_at: '2026-06-10T00:03:00Z', metadata: { status: 'in_progress', source: 'staff', diagnostics: { cookies: 'secret' }, body: 'Private body', r2Key: 'support/ticket-3/private' } },
    ], error: null }) }
    eventsFilter.eq.mockReturnValue(eventsFilter)
    const eventsQuery = { select: jest.fn().mockReturnValue(eventsFilter) }
    const capabilitiesFilter = { eq: jest.fn(), is: jest.fn().mockResolvedValue({ data: [{ capability: 'support.view' }], error: null }) }
    capabilitiesFilter.eq.mockReturnValue(capabilitiesFilter)

    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'staff-1' } } }) },
      from: jest.fn((table) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'staff-1' }, error: null }) }) }) }
        if (table === 'support_tickets') return ticketQuery
        if (table === 'support_ticket_messages') return messagesQuery
        if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnValue(capabilitiesFilter) }
        if (table === 'support_ticket_events') return eventsQuery
        return attachmentsQuery
      }),
    })

    const result = await getSupportTicketDetail('ticket-3')

    expect(result.success).toBe(true)
    expect(result.ticket?.messages).toEqual([
      { id: 'message-1', body: 'Public reply', isInternal: false, authorUsuarioId: 'usuario-1', author: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null }, createdAt: '2026-06-10T00:01:00Z' },
      { id: 'message-2', body: 'Internal note', isInternal: true, authorUsuarioId: 'staff-1', author: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', photoUrl: 'https://cdn.example/staff.webp' }, createdAt: '2026-06-10T00:02:00Z' },
    ])
    expect(result.ticket?.events).toEqual([{ type: 'support.ticket.status_changed', actorUsuarioId: 'staff-1', createdAt: '2026-06-10T00:03:00Z', metadata: { source: 'staff', status: 'in_progress' } }])
    expect(result.ticket?.events[0].metadata).not.toHaveProperty('diagnostics')
    expect(result.ticket?.events[0].metadata).not.toHaveProperty('body')
    expect(result.ticket?.events[0].metadata).not.toHaveProperty('r2Key')
    expect(eventsQuery.select).toHaveBeenCalledWith('action,actor_usuario_id,created_at,metadata')
    expect(eventsFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-3')
    expect(messagesFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-3')
    expect(messagesFilter.eq).not.toHaveBeenCalledWith('is_internal', false)
  })

  it('maps Supabase list errors to a stable user-safe message', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: { message: 'relation support_tickets does not exist' } }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: false, error: 'No se pudieron cargar los tickets de soporte', tickets: [] })
  })

  it('adds reporter public replies only', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { messageId: 'message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert: jest.fn() }),
      rpc,
    })

    const result = await createSupportTicketMessage('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_support_ticket_message_with_outbox', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets/ticket-1')
  })

  it('creates reporter public replies through the atomic outbox RPC without immediate provider dispatch', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { messageId: 'message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createFromMock({ usuarioId: 'usuario-1', insert: jest.fn() }),
      rpc,
    })

    const result = await createSupportTicketMessage('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_support_ticket_message_with_outbox', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
  })

  it('creates staff replies through the atomic outbox RPC without immediate provider dispatch', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { messageId: 'reply-message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.reply' }),
      rpc,
    })

    const result = await createStaffSupportTicketReply('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_staff_support_ticket_reply_with_outbox', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
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
    const rpc = jest.fn().mockResolvedValue({ data: { messageId: 'reply-message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.reply' }),
      rpc,
    })

    const result = await createStaffSupportTicketReply('ticket-1', createMessageFormData())

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_staff_support_ticket_reply_with_outbox', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets/ticket-1')
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/admin')
  })

  it('assigns an unassigned ticket to the managing staff responder after replying', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { messageId: 'reply-message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await createStaffSupportTicketReply('ticket-1', createMessageFormData(), { autoAssignIfUnassigned: true })

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('create_staff_support_ticket_reply_with_outbox', { p_ticket_id: 'ticket-1', p_body: 'I can reproduce it on mobile.' })
    expect(rpc).toHaveBeenCalledWith('auto_assign_support_ticket_if_unassigned', { p_ticket_id: 'ticket-1' })
  })

  it('keeps staff replies successful when best-effort auto-assignment fails', async () => {
    const rpc = jest.fn((functionName: string) => Promise.resolve(functionName === 'auto_assign_support_ticket_if_unassigned'
      ? { error: { message: 'assignment failed' } }
      : { data: { messageId: 'reply-message-1', eventId: 'event-1', actorUserId: 'usuario-1' }, error: null }))
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    await expect(createStaffSupportTicketReply('ticket-1', createMessageFormData(), { autoAssignIfUnassigned: true })).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('auto_assign_support_ticket_if_unassigned', { p_ticket_id: 'ticket-1' })
  })

  it('assigns a support ticket through the atomic audit RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
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

  it('updates a support ticket status through the atomic outbox RPC without immediate provider dispatch', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { eventId: 'event-1', actorUserId: 'usuario-1' }, error: null })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    const result = await updateSupportTicketStatus('ticket-1', 'resolved')

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('update_support_ticket_status_with_outbox', { p_ticket_id: 'ticket-1', p_status: 'resolved' })
    expect(rpc).toHaveBeenCalledWith('auto_assign_support_ticket_if_unassigned', { p_ticket_id: 'ticket-1' })
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
  })

  it('keeps repeated same-status saves drain-only even with distinct returned audit event ids', async () => {
    let statusMutationCount = 0
    const rpc = jest.fn((functionName: string) => {
      if (functionName === 'update_support_ticket_status_with_outbox') {
        statusMutationCount += 1
        return Promise.resolve({ data: { eventId: `event-${statusMutationCount}`, actorUserId: 'usuario-1' }, error: null })
      }
      return Promise.resolve({ error: null })
    })
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true, capability: 'support.manage' }),
      rpc,
    })

    await updateSupportTicketStatus('ticket-1', 'resolved')
    await updateSupportTicketStatus('ticket-1', 'resolved')

    expect(rpc).toHaveBeenCalledWith('update_support_ticket_status_with_outbox', { p_ticket_id: 'ticket-1', p_status: 'resolved' })
    expect(dispatchSupportInngestEventMock).not.toHaveBeenCalled()
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
