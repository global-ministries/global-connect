/**
 * Ayuda adopts PaginaSistema (docs/design-system.md): every page, the report
 * form included, uses the full content width, and the status filters and
 * ticket links keep a 44px touch target.
 */
import type { ReactNode } from 'react'
import { act, render, screen, within } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal }: { titulo?: string; accionPrincipal?: ReactNode }) => (
    <header>
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/lib/actions/support.actions', () => ({
  createSupportTicketFromForm: jest.fn(),
  listSupportTickets: jest.fn().mockResolvedValue({
    success: true,
    tickets: [{ id: 'ticket-1', ticketNumber: 42, title: 'Map bug', status: 'received', category: 'bug', severity: 'normal', createdAt: '2026-06-09T00:00:00Z', updatedAt: '2026-06-09T00:00:00Z' }],
  }),
  listStaffSupportTickets: jest.fn().mockResolvedValue({ success: true, supportCapabilities: ['support.view'], tickets: [] }),
  updateSupportTicketStatus: jest.fn(),
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ error: jest.fn(), info: jest.fn(), success: jest.fn() }) }))

import AyudaPage from '@/app/(auth)/ayuda/page'
import ReportarPage from '@/app/(auth)/ayuda/reportar/page'
import TicketsPage from '@/app/(auth)/ayuda/tickets/page'
import SupportAdminPage from '@/app/(auth)/ayuda/admin/page'

function anchoDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')?.getAttribute('data-ancho')
}

describe('Ayuda page widths', () => {
  it('the Ayuda home keeps the full content width', async () => {
    render(await AyudaPage())
    expect(anchoDe(screen.getByRole('link', { name: 'Ver mis tickets' }))).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument()
  })

  it('the report form uses the full width, sections and fields grids, and its submit in the action footer', async () => {
    await act(async () => {
      render(await ReportarPage())
    })
    expect(anchoDe(screen.getByLabelText('Asunto'))).toBe('default')
    const secciones = document.querySelector('[data-slot="secciones"]')
    expect(secciones).not.toBeNull()
    for (const campo of [screen.getByLabelText('Asunto'), screen.getByLabelText('Descripcion'), screen.getByLabelText('Categoria')]) {
      expect(campo.closest('[data-slot="campos"]')).not.toBeNull()
    }
    expect(secciones).toContainElement(screen.getByLabelText('Adjuntos'))
    expect(secciones).toContainElement(screen.getByTestId('support-attachment-status'))
    expect(screen.getByLabelText('Categoria')).toHaveValue('bug')
    expect(screen.getByRole('button', { name: 'Enviar ticket' }).closest('[data-slot="pie-acciones"]')).not.toBeNull()
  })

  it('my tickets keeps the full width, with touch-sized filters and a mobile "Nuevo ticket"', async () => {
    await act(async () => {
      render(await TicketsPage())
    })
    const filtros = screen.getByRole('navigation', { name: 'Filtrar tickets por estado' })
    expect(anchoDe(filtros)).toBe('default')
    const todos = within(filtros).getByRole('link', { name: 'Todos' })
    expect(todos).toHaveAttribute('aria-current', 'page')
    expect(todos).toHaveClass('pointer-coarse:h-11')
    // One link in the desktop header, one in the page for mobile.
    expect(screen.getAllByRole('link', { name: 'Nuevo ticket' })).toHaveLength(2)
    for (const enlace of screen.getAllByRole('link', { name: /Ver detalle/ })) {
      expect(enlace).toHaveClass('min-h-11')
    }
  })

  it('the support queue keeps the full content width', async () => {
    await act(async () => {
      render(await SupportAdminPage({ searchParams: Promise.resolve({}) }))
    })
    expect(anchoDe(screen.getByRole('searchbox', { name: 'Buscar tickets' }))).toBe('default')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cola de soporte' })).toBeInTheDocument()
  })
})
