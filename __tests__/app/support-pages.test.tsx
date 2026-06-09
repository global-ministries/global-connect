import { render, screen } from '@testing-library/react'

import AyudaPage from '@/app/(auth)/ayuda/page'
import ReportarPage from '@/app/(auth)/ayuda/reportar/page'
import TicketsPage from '@/app/(auth)/ayuda/tickets/page'
import TicketDetailPage from '@/app/(auth)/ayuda/tickets/[id]/page'

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
  listSupportTickets: jest.fn().mockResolvedValue({ success: true, tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }] }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ usuario: null, roles: ['miembro'], loading: false }) }))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))

describe('reporter support pages', () => {
  it('renders the /ayuda home with report and history links', async () => {
    render(await AyudaPage())

    expect(screen.getByRole('link', { name: /Report a problem/i })).toHaveAttribute('href', '/ayuda/reportar')
    expect(screen.getByRole('link', { name: /View my tickets/i })).toHaveAttribute('href', '/ayuda/tickets')
  })

  it('renders the report form with safe evidence fields', async () => {
    render(await ReportarPage())

    expect(screen.getByLabelText(/Title/i)).toHaveAttribute('name', 'title')
    expect(screen.getByLabelText(/Allow safe diagnostics/i)).toHaveAttribute('name', 'diagnosticsConsent')
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
    expect(screen.getByLabelText(/Reply/i)).toHaveAttribute('name', 'body')
  })
})
