import {
  createSupportTicket,
  createSupportTicketMessage,
  getSupportTicketDetail,
  listStaffSupportTickets,
  listSupportTickets,
} from '@/lib/actions/support.actions'
import { sanitizeSupportEvidence } from '@/lib/support/support-evidence'

const createSupabaseServerClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

describe('support reporter actions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
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

  it('rejects anonymous ticket creation before inserting', async () => {
    const insert = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: jest.fn().mockReturnValue({ insert }),
    })

    const result = await createSupportTicket(createTicketFormData())

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
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
      diagnostics_consent: true,
    }))
    expect(insert.mock.calls[0][0]).not.toHaveProperty('cookies')
    expect(revalidatePath).toHaveBeenCalledWith('/ayuda/tickets')
  })

  it('lists only public reporter fields from RLS-filtered tickets', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [{ id: 'ticket-1', ticket_number: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z', description: 'private detail' }], error: null }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] })
  })

  it('returns ticket detail with public messages and no internal evidence', async () => {
    const ticketQuery = { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ticket-1', ticket_number: 42, title: 'Map bug', description: 'Steps', status: 'received', category: 'bug', severity: 'normal', current_route: '/dashboard', browser_name: 'Chrome', os_name: 'macOS', viewport: '1440x900', app_build_version: 'build-123', sentry_event_id: 'event-1', diagnostics_consent: true, created_at: '2026-06-09T00:00:00Z', updated_at: '2026-06-09T00:00:00Z' }, error: null }) }) }) }
    const messagesFilter = { eq: jest.fn(), order: jest.fn().mockResolvedValue({ data: [{ id: 'message-1', body: 'Public reply', is_internal: false, created_at: '2026-06-09T00:01:00Z' }], error: null }) }
    messagesFilter.eq.mockReturnValue(messagesFilter)
    const messagesQuery = { select: jest.fn().mockReturnValue(messagesFilter) }
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn((table) => table === 'support_tickets' ? ticketQuery : messagesQuery),
    })

    const result = await getSupportTicketDetail('ticket-1')

    expect(result.success).toBe(true)
    expect(result.ticket?.messages).toEqual([{ id: 'message-1', body: 'Public reply', createdAt: '2026-06-09T00:01:00Z' }])
    expect(result.ticket).not.toHaveProperty('rawSentryPayload')
    expect(messagesFilter.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1')
    expect(messagesFilter.eq).toHaveBeenCalledWith('is_internal', false)
  })

  it('maps Supabase list errors to a stable user-safe message', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: null, error: { message: 'relation support_tickets does not exist' } }) }) }),
    })

    await expect(listSupportTickets()).resolves.toEqual({ success: false, error: 'Unable to load support tickets', tickets: [] })
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

  it('denies staff queue access without support.view', async () => {
    const supportTicketsQuery = createStaffTicketQuery([])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', hasCapability: false, supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({})

    expect(result).toEqual({ success: false, error: 'Not authorized', tickets: [] })
    expect(supportTicketsQuery.select).not.toHaveBeenCalled()
  })

  it('builds a staff queue query with FTS and filters', async () => {
    const supportTicketsQuery = createStaffTicketQuery([{ id: 'ticket-2', ticket_number: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assignee_usuario_id: 'assignee-1', campus_id: 'campus-1', created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:05:00Z' }])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffFromMock({ usuarioId: 'usuario-1', hasCapability: true, supportTicketsQuery }),
    })

    const result = await listStaffSupportTickets({ search: 'attendance', status: 'in_progress', category: 'bug', campusId: 'campus-1', assigneeId: 'assignee-1' })

    expect(result).toEqual({ success: true, tickets: [{ id: 'ticket-2', ticketNumber: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assigneeUsuarioId: 'assignee-1', campusId: 'campus-1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:05:00Z' }] })
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
      from: createStaffFromMock({ usuarioId: 'usuario-1', hasCapability: true, supportTicketsQuery }),
    })

    await expect(listStaffSupportTickets({})).resolves.toEqual({ success: false, error: 'Unable to load support queue', tickets: [] })
  })
})

function createTicketFormData() {
  const formData = new FormData()
  formData.set('title', 'Cannot open group map')
  formData.set('description', 'The map stays blank after I open the dashboard.')
  formData.set('category', 'bug')
  formData.set('severity', 'normal')
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

function createStaffFromMock(input: { usuarioId: string; hasCapability: boolean; supportTicketsQuery: ReturnType<typeof createStaffTicketQuery> }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ is: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: input.hasCapability ? { capability: 'support.view' } : null, error: null }) }) }) }) }) }
    return input.supportTicketsQuery
  })
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
