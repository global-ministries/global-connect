import { render, screen } from '@testing-library/react'

import AyudaPage from '@/app/(auth)/ayuda/page'
import SupportAdminPage from '@/app/(auth)/ayuda/admin/page'
import ReportarPage from '@/app/(auth)/ayuda/reportar/page'
import TicketsPage from '@/app/(auth)/ayuda/tickets/page'
import TicketDetailPage from '@/app/(auth)/ayuda/tickets/[id]/page'

const listStaffSupportTickets = jest.fn().mockResolvedValue({ success: true, tickets: [{ id: 'ticket-2', ticketNumber: 43, title: 'Cannot submit attendance', status: 'in_progress', category: 'bug', severity: 'high', assigneeUsuarioId: 'assignee-1', campusId: 'campus-1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:05:00Z' }] })

jest.mock('@/lib/actions/support.actions', () => ({
  createSupportTicket: jest.fn(),
  createSupportTicketMessage: jest.fn(),
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
      messages: [{ id: 'message-1', body: 'Public reply', createdAt: '2026-06-09T00:01:00Z' }],
    },
  }),
  listStaffSupportTickets: (filters: Record<string, string | undefined>) => listStaffSupportTickets(filters),
  listSupportTickets: jest.fn().mockResolvedValue({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ usuario: null, roles: ['miembro'], loading: false }) }))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))

describe('reporter support pages', () => {
  beforeEach(() => {
    listStaffSupportTickets.mockClear()
  })

  it('renders the /ayuda home with report and history links', async () => {
    render(await AyudaPage())

    expect(screen.getByRole('link', { name: /Reportar un problema/i })).toHaveAttribute('href', '/ayuda/reportar')
    expect(screen.getByRole('link', { name: /Ver mis tickets/i })).toHaveAttribute('href', '/ayuda/tickets')
  })

  it('renders the report form with safe evidence fields', async () => {
    render(await ReportarPage())

    expect(screen.getByLabelText(/Titulo/i)).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText(/Permitir diagnosticos seguros/i)).toHaveAttribute('name', 'diagnosticsConsent')
    expect(document.querySelector('[name="cookies"]')).not.toBeInTheDocument()
  })

  it('renders the reporter ticket history', async () => {
    render(await TicketsPage())

    expect(screen.getByRole('link', { name: /#42 Map bug/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-1')
  })

  it('renders reporter-visible ticket details and reply form', async () => {
    render(await TicketDetailPage({ params: Promise.resolve({ id: 'ticket-1' }) }))

    expect(screen.getByText('The group map does not load.')).toBeInTheDocument()
    expect(screen.getByText('Public reply')).toBeInTheDocument()
    expect(screen.getByLabelText(/Respuesta/i)).toHaveAttribute('name', 'body')
  })

  it('renders the staff queue with search and filter controls', async () => {
    render(await SupportAdminPage({ searchParams: Promise.resolve({ search: 'attendance', status: 'in_progress', category: 'bug' }) }))

    expect(listStaffSupportTickets).toHaveBeenCalledWith({ search: 'attendance', status: 'in_progress', category: 'bug', campusId: undefined, assigneeId: undefined })
    expect(screen.getByRole('searchbox', { name: /Buscar tickets/i })).toHaveValue('attendance')
    expect(screen.getByLabelText(/Estado/i)).toHaveValue('in_progress')
    expect(screen.getByRole('link', { name: /#43 Cannot submit attendance/i })).toHaveAttribute('href', '/ayuda/tickets/ticket-2')
    expect(screen.getAllByText('En progreso')).toHaveLength(2)
  })
})
