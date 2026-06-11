import { render, screen } from '@testing-library/react'

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
      createdAt: '2026-06-09T00:00:00Z',
      updatedAt: '2026-06-09T00:00:00Z',
      evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
      attachments: [{ id: 'attachment-1', filename: 'map-error.webp', kind: 'screenshot', contentType: 'image/webp', byteSize: 2048, status: 'uploaded' }],
      messages: [{ id: 'message-1', body: 'Public reply', createdAt: '2026-06-09T00:01:00Z' }],
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
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/lib/actions/support-capabilities.actions', () => ({ grantSupportCapability: jest.fn(), revokeSupportCapability: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path), usePathname: () => '/ayuda' }))

describe('reporter support pages', () => {
  beforeEach(() => {
    listStaffSupportTickets.mockClear()
    listStaffSupportTickets.mockResolvedValue(staffQueueResult)
    createSupabaseServerClient.mockReset()
    getUserWithRoles.mockReset()
    redirect.mockClear()
  })

  it('renders the /ayuda home with report and history links', async () => {
    render(await AyudaPage())

    expect(screen.getByRole('link', { name: /Reportar un problema/i })).toHaveAttribute('href', '/ayuda/reportar')
    expect(screen.getByRole('link', { name: /Ver mis tickets/i })).toHaveAttribute('href', '/ayuda/tickets')
  })

  it('renders the report form with only reporter-facing fields', async () => {
    render(await ReportarPage())

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
    render(await TicketsPage())

    expect(screen.getByRole('link', { name: /#42 Map bug/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-1')
  })

  it('renders reporter-visible ticket details and reply form', async () => {
    render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-1' }) }))

    expect(screen.getByText('The group map does not load.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar map-error\.webp/i })).toHaveAttribute('href', '/api/support/attachments/attachment-1/download')
    expect(screen.queryByText(/support\/ticket-1\/attachment-1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/X-Amz-Signature/i)).not.toBeInTheDocument()
    expect(screen.getByText('Public reply')).toBeInTheDocument()
    expect(screen.getByLabelText(/Respuesta/i)).toHaveAttribute('name', 'body')
    expect(screen.queryByLabelText(/Respuesta del equipo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Nuevo estado/i)).not.toBeInTheDocument()
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
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:05:00Z',
        evidence: { currentRoute: '/dashboard', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.reply', 'support.manage'],
      },
    })

    render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-2' }) }))

    expect(screen.getByLabelText(/Respuesta del equipo/i)).toHaveAttribute('name', 'body')
    expect(screen.getByRole('button', { name: /Enviar respuesta del equipo/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nuevo estado/i)).toHaveValue('in_review')
    expect(screen.getByRole('button', { name: /Actualizar estado/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Responsable/i)).toHaveAttribute('name', 'assigneeUsuarioId')
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
        createdAt: '2026-06-10T01:00:00Z',
        updatedAt: '2026-06-10T01:05:00Z',
        evidence: { currentRoute: '/ayuda/admin', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.manage'],
      },
    })

    render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-3' }) }))

    expect(screen.getByLabelText(/Respuesta del equipo/i)).toHaveAttribute('name', 'body')
    expect(screen.getByRole('button', { name: /Enviar respuesta del equipo/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nuevo estado/i)).toHaveValue('in_progress')
    expect(screen.getByRole('button', { name: /Actualizar estado/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Responsable/i)).toHaveAttribute('name', 'assigneeUsuarioId')
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
        createdAt: '2026-06-10T02:00:00Z',
        updatedAt: '2026-06-10T02:05:00Z',
        evidence: { currentRoute: '/ayuda/admin', browserName: 'Chrome', osName: 'macOS', viewport: '1440x900', appBuildVersion: null, sentryEventId: null, diagnosticsConsent: true },
        attachments: [],
        messages: [],
        supportCapabilities: ['support.view'],
      },
    })

    render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-4' }) }))

    expect(screen.queryByLabelText(/Respuesta del equipo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar respuesta del equipo/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Nuevo estado/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable/i)).not.toBeInTheDocument()
  })

  it('renders the staff queue with search and filter controls', async () => {
    render(await SupportAdminPage({ searchParams: Promise.resolve({ search: 'attendance', status: 'in_progress', category: 'bug' }) }))

    expect(listStaffSupportTickets).toHaveBeenCalledWith({ search: 'attendance', status: 'in_progress', category: 'bug', campusId: undefined, assigneeId: undefined })
    expect(screen.getByRole('searchbox', { name: /Buscar tickets/i })).toHaveValue('attendance')
    expect(screen.getByLabelText(/^Estado$/i)).toHaveValue('in_progress')
    expect(screen.getByRole('link', { name: /#43 Cannot submit attendance/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
    expect(screen.getAllByText('En progreso')).toHaveLength(2)
  })

  it('hides staff queue assignment and status transition controls for view-only staff', async () => {
    render(await SupportAdminPage({ searchParams: Promise.resolve({}) }))

    expect(screen.queryByLabelText(/Nuevo estado para #43/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actualizar estado de #43/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Responsable para #43/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Asignar #43/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Responder #43/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
  })

  it('renders staff queue assignment and status transition controls for support managers', async () => {
    listStaffSupportTickets.mockResolvedValueOnce({ ...staffQueueResult, supportCapabilities: ['support.view', 'support.manage'] })

    render(await SupportAdminPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByLabelText(/Nuevo estado para #43/i)).toHaveValue('in_progress')
    expect(screen.getByRole('button', { name: /Actualizar estado de #43/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Responsable para #43/i)).toHaveValue('assignee-1')
    expect(screen.getByRole('button', { name: /Asignar #43/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Responder #43/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
  })

  it('redirects pure support.manage staff away from support capability configuration', async () => {
    const supabase = createSupportCapabilitiesPageSupabase(true)
    createSupabaseServerClient.mockResolvedValue(supabase)
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['miembro'] })

    await expect(SupportCapabilitiesPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('renders support capability configuration for higher-role support managers', async () => {
    const supabase = createSupportCapabilitiesPageSupabase(true)
    createSupabaseServerClient.mockResolvedValue(supabase)
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['director-general'] })

    render(await SupportCapabilitiesPage())

    expect(screen.getByRole('heading', { name: /Capacidades permitidas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Otorgar capacidad/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revocar capacidad/i })).toBeInTheDocument()
  })
})

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
