import { act, render, screen } from '@testing-library/react'
import type { PlatformSession } from '@/lib/platform/session/types'

import AyudaPage from '@/app/(auth)/ayuda/page'
import SupportAdminPage from '@/app/(auth)/ayuda/admin/page'
import ReportarPage from '@/app/(auth)/ayuda/reportar/page'
import TicketsPage from '@/app/(auth)/ayuda/tickets/page'
import TicketDetailPage from '@/app/(auth)/ayuda/tickets/[id]/page'
import { buildAttachmentIntentRequestBody, createAttachmentUploadItems, shouldCreateFreshAttachmentIntent } from '@/app/(auth)/ayuda/reportar/support-ticket-create-form'
import SupportCapabilitiesPage from '@/app/(auth)/configuracion/soporte/page'

const staffQueueResult = { success: true, supportCapabilities: ['support.view'], tickets: [{ id: 'ticket-2', ticketNumber: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assigneeUsuarioId: 'assignee-1', campusId: 'campus-1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:05:00Z' }] }
const listStaffSupportTickets = jest.fn().mockResolvedValue(staffQueueResult)
const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})

jest.mock('@/lib/actions/support.actions', () => ({
  createSupportTicket: jest.fn(),
  createSupportTicketMessage: jest.fn(),
  createStaffSupportTicketReply: jest.fn(),
  getSupportTicketDetail: jest.fn().mockResolvedValue({
    success: true,
    ticket: {
      id: 'ticket-1',
      ticketNumber: 42,
      title: 'Map bug',
      description: 'The group map does not load.',
      status: 'received',
      category: 'bug',
      severity: 'normal',
      reporterUsuarioId: 'reporter-1',
      assigneeUsuarioId: 'staff-1',
      reporter: { id: 'reporter-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null },
      assignee: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', photoUrl: 'https://cdn.example/staff.webp' },
      createdAt: '2026-06-09T00:00:00Z',
      updatedAt: '2026-06-09T00:00:00Z',
      evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
      attachments: [
        { id: 'attachment-1', filename: 'map-error.webp', kind: 'screenshot', contentType: 'image/webp', byteSize: 2048, status: 'uploaded' },
        { id: 'attachment-2', filename: 'screen-recording.mp4', kind: 'video', contentType: 'video/mp4', byteSize: 4096, status: 'uploaded' },
      ],
      messages: [
        { id: 'message-1', body: 'Public reply', authorUsuarioId: 'reporter-1', author: { id: 'reporter-1', nombre: 'Ana', apellido: 'Pérez', photoUrl: null }, createdAt: '2026-06-09T00:01:00Z' },
        { id: 'message-2', body: 'Support reply', authorUsuarioId: 'staff-1', author: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', photoUrl: 'https://cdn.example/staff.webp' }, createdAt: '2026-06-09T00:02:00Z' },
      ],
      events: [
        { type: 'support.ticket.status_changed', actorUsuarioId: 'staff-1', createdAt: '2026-06-09T00:03:00Z', metadata: { status: 'in_progress', source: 'staff' } },
      ],
      supportCapabilities: [],
    },
  }),
  assignSupportTicket: jest.fn(),
  listStaffSupportTickets: (filters: Record<string, string | undefined>) => listStaffSupportTickets(filters),
  listSupportTickets: jest.fn().mockResolvedValue({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] }),
  updateSupportTicketStatus: jest.fn(),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ usuario: null, roles: ['miembro'], loading: false }) }))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ error: jest.fn(), info: jest.fn(), success: jest.fn() }) }))
jest.mock('@/lib/actions/support-capabilities.actions', () => ({ grantSupportCapability: jest.fn(), revokeSupportCapability: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path), usePathname: () => '/ayuda', useRouter: () => ({ push: jest.fn() }) }))

describe('reporter support pages', () => {
  beforeEach(() => {
    listStaffSupportTickets.mockClear()
    listStaffSupportTickets.mockResolvedValue(staffQueueResult)
    createSupabaseServerClient.mockReset()
    getUserWithRoles.mockReset()
    redirect.mockClear()
  })

  it('renders the /ayuda home with report and history links', async () => {
    await act(async () => {
      render(await AyudaPage())
    })

    expect(screen.getByRole('link', { name: /Reportar un problema/i })).toHaveAttribute('href', '/ayuda/reportar')
    expect(screen.getByRole('link', { name: /Ver mis tickets/i })).toHaveAttribute('href', '/ayuda/tickets')
  })

  it('renders the report form with only reporter-facing fields', async () => {
    await act(async () => {
      render(await ReportarPage())
    })

    expect(screen.getByLabelText(/Asunto/i)).toHaveAttribute('name', 'subject')
    expect(screen.getByLabelText(/Descripcion/i)).toHaveAttribute('name', 'description')
    expect(screen.getByLabelText(/Categoria/i)).toHaveAttribute('name', 'category')
    expect(screen.getByLabelText(/Adjuntos/i)).not.toHaveAttribute('name')

    expect(screen.queryByLabelText(/Severidad/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Ruta/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Viewport/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Navegador/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Sistema operativo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/ID de evento de Sentry/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Permitir diagnosticos seguros/i)).not.toBeInTheDocument()

    expect(document.querySelector('[name="currentRoute"]')).toHaveAttribute('type', 'hidden')
    expect(document.querySelector('[name="diagnosticsConsent"]')).toHaveAttribute('value', 'true')
    expect(document.querySelector('[name="cookies"]')).not.toBeInTheDocument()
    expect(screen.getByText(/Sube hasta 5 capturas/i)).toBeInTheDocument()
    expect(screen.getByTestId('support-attachment-status')).toHaveTextContent(/Esperando envio del ticket/i)
    expect(screen.queryByText(/se habilitara en el siguiente corte de R2/i)).not.toBeInTheDocument()
  })

  it('keys attachment upload state by client id instead of filename', () => {
    const firstFile = new File(['first'], 'evidence.png', { type: 'image/png' })
    const secondFile = new File(['second'], 'evidence.png', { type: 'image/png' })

    const uploads = createAttachmentUploadItems([firstFile, secondFile])

    expect(uploads).toEqual([
      { clientId: 'evidence.png:5:image/png:0', name: 'evidence.png', status: 'idle', progress: 0 },
      { clientId: 'evidence.png:6:image/png:1', name: 'evidence.png', status: 'idle', progress: 0 },
    ])
  })

  it('creates a fresh attachment intent when retrying a failed upload', () => {
    expect(shouldCreateFreshAttachmentIntent({ clientId: 'upload-1', name: 'evidence.png', status: 'failed', progress: 40, attachmentId: 'attachment-1', uploadUrl: 'https://r2.example/upload?X-Amz-Expires=300' })).toBe(true)
  })

  it('includes the prior attachment id only when retrying an upload intent', () => {
    const file = new File(['video'], 'retry.mp4', { type: 'video/mp4' })

    expect(buildAttachmentIntentRequestBody('ticket-1', file, 'attachment-1')).toEqual({
      ticketId: 'ticket-1',
      replaceAttachmentId: 'attachment-1',
      files: [{ filename: 'retry.mp4', contentType: 'video/mp4', byteSize: 5 }],
    })
    expect(buildAttachmentIntentRequestBody('ticket-1', file)).not.toHaveProperty('replaceAttachmentId')
  })

  it('renders the reporter ticket history', async () => {
    await act(async () => {
      render(await TicketsPage())
    })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Historial de tickets de soporte enviados por ti.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Ticket$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Categoria/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Severidad/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Estado/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Fecha/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /#42 Map bug/i })[0]).toHaveAttribute('href', '/ayuda/tickets/ticket-1')
  })

  it('renders the reporter ticket history empty state', async () => {
    const { listSupportTickets } = jest.requireMock('@/lib/actions/support.actions') as { listSupportTickets: jest.Mock }
    listSupportTickets.mockResolvedValueOnce({ success: true, tickets: [] })

    await act(async () => {
      render(await TicketsPage())
    })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByText('Todavia no has enviado tickets de soporte.')[0]).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /#/ })).not.toBeInTheDocument()
  })

  it('renders reporter-visible ticket details and reply form', async () => {
    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-1' }) }))
    })

    expect(screen.getByText('The group map does not load.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Solicitante/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Conversación/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Adjuntos/i })).toBeInTheDocument()
    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0)
    expect(screen.getByText('map-error.webp')).toBeInTheDocument()
    expect(screen.getAllByText('Responsable').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Soporte Central').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /Vista previa de map-error\.webp/i })).toHaveAttribute('src', '/api/support/attachments/attachment-1/download')
    expect(screen.getByLabelText(/Vista previa de screen-recording\.mp4/i)).toHaveAttribute('src', '/api/support/attachments/attachment-2/download')
    expect(screen.getByRole('link', { name: /Abrir map-error\.webp/i })).toHaveAttribute('href', '/api/support/attachments/attachment-1/download')
    expect(screen.queryByText(/support\/ticket-1\/attachment-1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/X-Amz-Signature/i)).not.toBeInTheDocument()
    expect(screen.getByText('Public reply')).toBeInTheDocument()
    expect(screen.getByText('Support reply')).toBeInTheDocument()
    expect(screen.getAllByText('Soporte Central').length).toBeGreaterThan(0)
    expect(screen.getByText('Soporte')).toBeInTheDocument()
    expect(screen.queryByText('Equipo de soporte')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Respuesta/i)).toHaveAttribute('name', 'body')
    expect(screen.queryByLabelText(/Respuesta del equipo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Nuevo estado/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Actividad$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Estado actualizado/i)).not.toBeInTheDocument()
  })

  it('renders internal note badge only for users with support.view-equivalent capability', async () => {
    const { getSupportTicketDetail } = jest.requireMock('@/lib/actions/support.actions') as { getSupportTicketDetail: jest.Mock }
    getSupportTicketDetail.mockResolvedValueOnce({
      success: true,
      ticket: {
        id: 'ticket-5',
        ticketNumber: 46,
        title: 'Need internal context',
        description: 'Support needs private context before answering.',
        status: 'received',
        category: 'bug',
        severity: 'normal',
        reporterUsuarioId: 'reporter-5',
        assigneeUsuarioId: 'staff-2',
        reporter: { id: 'reporter-5', nombre: 'Lucía', apellido: 'García', photoUrl: null },
        assignee: { id: 'staff-2', nombre: 'Soporte', apellido: 'Senior', photoUrl: 'https://cdn.example/staff-2.webp' },
        createdAt: '2026-06-10T03:00:00Z',
        updatedAt: '2026-06-10T03:05:00Z',
        evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [
          { id: 'message-1', body: 'Internal update for staff', authorUsuarioId: 'staff-2', isInternal: true, author: { id: 'staff-2', nombre: 'Soporte', apellido: 'Senior', photoUrl: 'https://cdn.example/staff-2.webp' }, createdAt: '2026-06-10T03:01:00Z' },
          { id: 'message-2', body: 'Public follow-up', authorUsuarioId: 'staff-2', isInternal: false, author: { id: 'staff-2', nombre: 'Soporte', apellido: 'Senior', photoUrl: 'https://cdn.example/staff-2.webp' }, createdAt: '2026-06-10T03:02:00Z' },
        ],
        events: [
          { type: 'support.ticket.status_changed', actorUsuarioId: 'staff-2', createdAt: '2026-06-10T03:03:00Z', metadata: { status: 'in_review', source: 'staff', category: 'bug' } },
        ],
        supportCapabilities: ['support.view'],
      },
    })

    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-5' }) }))
    })

    expect(screen.getByText('Need internal context')).toBeInTheDocument()
    expect(screen.getByText('Nota interna')).toBeInTheDocument()
    expect(screen.getByText('Internal update for staff')).toBeInTheDocument()
    expect(screen.getByText('Public follow-up')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Actividad$/i })).toBeInTheDocument()
    expect(screen.getByText('Estado actualizado')).toBeInTheDocument()
    expect(screen.getByText(/Origen staff/i)).toBeInTheDocument()
    expect(screen.queryByText(/Private body/i)).not.toBeInTheDocument()
  })

  it('does not render internal-note badge when message is public-only', async () => {
    const { getSupportTicketDetail } = jest.requireMock('@/lib/actions/support.actions') as { getSupportTicketDetail: jest.Mock }
    getSupportTicketDetail.mockResolvedValueOnce({
      success: true,
      ticket: {
        id: 'ticket-6',
        ticketNumber: 47,
        title: 'Reporter only context',
        description: 'No internal notes here.',
        status: 'received',
        category: 'other',
        severity: 'low',
        reporterUsuarioId: 'reporter-6',
        assigneeUsuarioId: null,
        reporter: { id: 'reporter-6', nombre: 'Mauro', apellido: 'López', photoUrl: null },
        assignee: null,
        createdAt: '2026-06-10T04:00:00Z',
        updatedAt: '2026-06-10T04:05:00Z',
        evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [
          { id: 'message-3', body: 'Public reply only', authorUsuarioId: 'staff-2', isInternal: false, author: { id: 'staff-2', nombre: 'Soporte', apellido: 'Senior', photoUrl: 'https://cdn.example/staff-2.webp' }, createdAt: '2026-06-10T04:01:00Z' },
        ],
        supportCapabilities: [],
      },
    })

    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-6' }) }))
    })

    expect(screen.getByText('Public reply only')).toBeInTheDocument()
    expect(screen.queryByText('Nota interna')).not.toBeInTheDocument()
  })

  it('renders staff reply and lifecycle controls only when staff capabilities are present', async () => {
    const { getSupportTicketDetail } = jest.requireMock('@/lib/actions/support.actions') as { getSupportTicketDetail: jest.Mock }
    getSupportTicketDetail.mockResolvedValueOnce({
      success: true,
      ticket: {
        id: 'ticket-2',
        ticketNumber: 43,
        title: 'Cannot submit attendance',
        description: 'The attendance form fails.',
        status: 'in_review',
        category: 'bug',
        severity: 'high',
        reporterUsuarioId: 'reporter-2',
        assigneeUsuarioId: 'staff-1',
        reporter: { id: 'reporter-2', nombre: 'Luis', apellido: 'Ramos', photoUrl: null },
        assignee: { id: 'staff-1', nombre: 'Soporte', apellido: 'Central', photoUrl: null },
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:05:00Z',
        evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.reply', 'support.manage'],
      },
    })

    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-2' }) }))
    })

    expect(screen.getByLabelText(/Respuesta de soporte/i)).toHaveAttribute('name', 'body')
    expect(screen.getByRole('button', { name: /Enviar respuesta al solicitante/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nuevo estado/i)).toHaveValue('in_review')
    expect(screen.getByRole('button', { name: /Actualizar estado/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable/i)).not.toBeInTheDocument()
  })

  it('renders staff reply and lifecycle controls for pure support managers on ticket detail', async () => {
    const { getSupportTicketDetail } = jest.requireMock('@/lib/actions/support.actions') as { getSupportTicketDetail: jest.Mock }
    getSupportTicketDetail.mockResolvedValueOnce({
      success: true,
      ticket: {
        id: 'ticket-3',
        ticketNumber: 44,
        title: 'Cannot access admin queue',
        description: 'The admin queue is blocked.',
        status: 'in_progress',
        category: 'access',
        severity: 'normal',
        reporterUsuarioId: 'reporter-3',
        assigneeUsuarioId: null,
        reporter: { id: 'reporter-3', nombre: 'Marta', apellido: 'Núñez', photoUrl: null },
        assignee: null,
        createdAt: '2026-06-10T01:00:00Z',
        updatedAt: '2026-06-10T01:05:00Z',
        evidence: { currentRoute: '/ayuda/admin', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.manage'],
      },
    })

    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-3' }) }))
    })

    expect(screen.getByLabelText(/Respuesta de soporte/i)).toHaveAttribute('name', 'body')
    expect(screen.getByRole('button', { name: /Enviar respuesta al solicitante/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nuevo estado/i)).toHaveValue('in_progress')
    expect(screen.getByRole('button', { name: /Actualizar estado/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable/i)).not.toBeInTheDocument()
  })

  it('keeps ticket detail staff reply and lifecycle controls hidden for view-only staff', async () => {
    const { getSupportTicketDetail } = jest.requireMock('@/lib/actions/support.actions') as { getSupportTicketDetail: jest.Mock }
    getSupportTicketDetail.mockResolvedValueOnce({
      success: true,
      ticket: {
        id: 'ticket-4',
        ticketNumber: 45,
        title: 'View-only ticket',
        description: 'The staff member can only inspect this ticket.',
        status: 'received',
        category: 'other',
        severity: 'normal',
        reporterUsuarioId: 'reporter-4',
        assigneeUsuarioId: null,
        reporter: { id: 'reporter-4', nombre: 'Diego', apellido: 'Soto', photoUrl: null },
        assignee: null,
        createdAt: '2026-06-10T02:00:00Z',
        updatedAt: '2026-06-10T02:05:00Z',
        evidence: { currentRoute: '/ayuda/admin', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.view'],
      },
    })

    await act(async () => {
      render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-4' }) }))
    })

    expect(screen.queryByLabelText(/Respuesta de soporte/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar respuesta al solicitante/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Nuevo estado/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable/i)).not.toBeInTheDocument()
  })

  it('renders the staff queue with search and filter controls', async () => {
    await act(async () => {
      render(await SupportAdminPage({ searchParams: Promise.resolve({ search: 'attendance', status: 'in_progress', category: 'bug' }) }))
    })

    expect(listStaffSupportTickets).toHaveBeenCalledWith({ search: 'attendance', status: 'in_progress', category: 'bug', campusId: undefined, assigneeId: undefined })
    expect(screen.getByRole('searchbox', { name: /Buscar tickets/i })).toHaveValue('attendance')
    expect(screen.getByLabelText(/^Estado$/i)).toHaveValue('in_progress')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Cola de tickets de soporte autorizados para el equipo.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Ticket$/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Acciones/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /#43 Cannot submit attendance/i })[0]).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
    expect(screen.getAllByText('En progreso')).toHaveLength(3)
  })

  it('hides staff queue assignment and status transition controls for view-only staff', async () => {
    await act(async () => {
      render(await SupportAdminPage({ searchParams: Promise.resolve({}) }))
    })

    expect(screen.queryByLabelText(/Nuevo estado para #43/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actualizar #43/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable para #43/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Asignar #43/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Responder #43/i })[0]).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
  })

  it('renders staff queue assignment and status transition controls for support managers', async () => {
    listStaffSupportTickets.mockResolvedValueOnce({ ...staffQueueResult, supportCapabilities: ['support.view', 'support.manage'] })

    await act(async () => {
      render(await SupportAdminPage({ searchParams: Promise.resolve({}) }))
    })

    expect(screen.getAllByLabelText(/Nuevo estado para #43/i)[0]).toHaveValue('in_progress')
    expect(screen.getAllByRole('button', { name: /Actualizar #43/i })[0]).toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable para #43/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Asignar #43/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Responder #43/i })[0]).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
  })

  it('explains the required access for denied support capability configuration', async () => {
    setSupportNavigationEnv({ enabled: 'true' })
    const supabase = createSupportCapabilitiesPageSupabase(true)
    createSupabaseServerClient.mockResolvedValue(supabase)
    getUserWithRoles.mockResolvedValue({
      user: { id: 'auth-1' },
      roles: ['miembro'],
      platformSession: buildSupportPlatformSession([{ key: 'support.manage', experience: 'support', scopeType: 'experience', source: 'legacy' }]),
    })

    await act(async () => {
      render(await SupportCapabilitiesPage())
    })

    expect(screen.getByRole('heading', { name: /Acceso requerido/i })).toBeInTheDocument()
    expect(screen.getByText(/requiere un rol de administracion alto y la capacidad support.manage/i)).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalledWith('/dashboard')
  })

  it('renders support capability configuration for higher-role support managers', async () => {
    setSupportNavigationEnv({ enabled: 'true' })
    const supabase = createSupportCapabilitiesPageSupabase(true)
    createSupabaseServerClient.mockResolvedValue(supabase)
    getUserWithRoles.mockResolvedValue({
      user: { id: 'auth-1' },
      roles: ['director-general'],
      platformSession: buildSupportPlatformSession([{ key: 'support.manage', experience: 'support', scopeType: 'experience', source: 'legacy' }]),
    })

    await act(async () => {
      render(await SupportCapabilitiesPage())
    })

    expect(screen.getByRole('heading', { name: /Capacidades permitidas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Otorgar capacidad/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revocar capacidad/i })).toBeInTheDocument()
  })
})

describe('support capability configuration page platform route guard', () => {
  const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    restoreSupportNavigationEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalEnabled)
    restoreSupportNavigationEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalKillSwitch)
  })

  it.each([
    ['feature flag is off', {}, null],
    ['kill switch is active', { enabled: 'true', killSwitch: 'true' }, null],
    ['platform session is missing', { enabled: 'true' }, null],
    ['platform session has no capabilities', { enabled: 'true' }, buildSupportPlatformSession([])],
    ['platform session lacks the required capability', { enabled: 'true' }, buildSupportPlatformSession([{ key: 'support.view', experience: 'support', scopeType: 'experience', source: 'legacy' }])],
  ] satisfies Array<[string, { enabled?: 'true'; killSwitch?: 'true' }, PlatformSession | null]>)('redirects to /dashboard when the %s', async (_label, env, platformSession) => {
    setSupportNavigationEnv(env)
    createSupabaseServerClient.mockResolvedValue(createSupportCapabilitiesPageSupabase(true))
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['director-general'], platformSession })

    await expect(SupportCapabilitiesPage()).rejects.toThrow(/NEXT_REDIRECT:\/dashboard/)
  })

  it('renders the configuration UI when the platform flag is on and the required capability is present', async () => {
    setSupportNavigationEnv({ enabled: 'true' })
    createSupabaseServerClient.mockResolvedValue(createSupportCapabilitiesPageSupabase(true))
    getUserWithRoles.mockResolvedValue({
      user: { id: 'auth-1' },
      roles: ['director-general'],
      platformSession: buildSupportPlatformSession([{ key: 'support.manage', experience: 'support', scopeType: 'experience', source: 'legacy' }]),
    })

    await act(async () => { render(await SupportCapabilitiesPage()) })

    expect(screen.getByRole('heading', { name: /Capacidades permitidas/i })).toBeInTheDocument()
  })
})

function restoreSupportNavigationEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function setSupportNavigationEnv(env: { enabled?: 'true'; killSwitch?: 'true' }) {
  restoreSupportNavigationEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', env.enabled)
  restoreSupportNavigationEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', env.killSwitch)
}

function buildSupportPlatformSession(capabilities: PlatformSession['capabilities']): PlatformSession {
  return { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: ['director-general'], contexts: [], capabilities }
}

function createSupportCapabilitiesPageSupabase(hasSupportManage: boolean) {
  return {
    from: jest.fn((table) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'usuario-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'support_user_capabilities') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({ data: hasSupportManage ? { capability: 'support.manage' } : null, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}
