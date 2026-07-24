/**
 * W13 — Tests for CrisisAlertBanner component.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
}))

describe('CrisisAlertBanner', () => {
  const defaultAlert = {
    oneOnOneId: '123',
    categoria: 'duelo',
    keyword: 'fallecido',
    detectedAtIso: '2025-01-01T00:00:00Z',
    assistedPersonaId: 'persona-1',
    assistedPersonaName: 'Ana García',
  }

  it('renders null when no alerts', () => {
    const { container } = render(<CrisisAlertBanner alerts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders alert with category label', () => {
    render(<CrisisAlertBanner alerts={[defaultAlert]} />)
    expect(screen.getByText('Duelo')).toBeInTheDocument()
  })

  it('renders alert with assisted person name', () => {
    render(<CrisisAlertBanner alerts={[defaultAlert]} />)
    expect(screen.getByText(/Ana García/)).toBeInTheDocument()
  })

  it('renders keyword without sensitive content', () => {
    render(<CrisisAlertBanner alerts={[defaultAlert]} />)
    expect(screen.getByText(/"fallecido"/)).toBeInTheDocument()
  })

  it('renders additional alerts count', () => {
    render(<CrisisAlertBanner alerts={[defaultAlert, { ...defaultAlert, oneOnOneId: '456' }]} />)
    expect(screen.getByText('+1 alerta adicional')).toBeInTheDocument()
  })

  it('renders ver alertas button link', () => {
    render(<CrisisAlertBanner alerts={[defaultAlert]} />)
    const link = screen.getByRole('link', { name: /ver alertas/i })
    expect(link).toHaveAttribute('href', '/pastor/crisis')
  })

  it('renders ideacion_suicida as destructive', () => {
    render(<CrisisAlertBanner alerts={[{ ...defaultAlert, categoria: 'ideacion_suicida' }]} />)
    expect(screen.getByText('Ideación Suicida')).toBeInTheDocument()
  })

  it('renders crisis_matrimonial as destructive', () => {
    render(<CrisisAlertBanner alerts={[{ ...defaultAlert, categoria: 'crisis_matrimonial' }]} />)
    expect(screen.getByText('Crisis Matrimonial')).toBeInTheDocument()
  })
})
