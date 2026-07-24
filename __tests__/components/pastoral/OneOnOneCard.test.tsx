/**
 * W13 — Tests for OneOnOneCard component.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}))

describe('OneOnOneCard', () => {
  const defaultProps = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    estado: 'scheduled',
    scheduledAtIso: '2025-07-01T10:00:00.000Z',
    assistedPersonaName: 'Juan Pérez',
    href: '/lider/uno-auno/123e4567',
    pasosValidadosCount: 2,
  }

  it('renders card with assisted person name', () => {
    render(<OneOnOneCard {...defaultProps} />)
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })

  it('renders scheduled badge', () => {
    render(<OneOnOneCard {...defaultProps} />)
    const badge = screen.getByTestId('badge')
    expect(badge).toHaveAttribute('data-variant', 'outline')
    expect(badge).toHaveTextContent('Programado')
  })

  it('renders completed badge when estado is completed', () => {
    render(<OneOnOneCard {...defaultProps} estado="completed" />)
    const badge = screen.getByTestId('badge')
    expect(badge).toHaveAttribute('data-variant', 'default')
    expect(badge).toHaveTextContent('Completado')
  })

  it('renders cancelled badge when estado is cancelled', () => {
    render(<OneOnOneCard {...defaultProps} estado="cancelled" />)
    const badge = screen.getByTestId('badge')
    expect(badge).toHaveAttribute('data-variant', 'destructive')
    expect(badge).toHaveTextContent('Cancelado')
  })

  it('renders steps count badge', () => {
    render(<OneOnOneCard {...defaultProps} pasosValidadosCount={3} />)
    expect(screen.getByText('3 pasos')).toBeInTheDocument()
  })

  it('does not render steps badge when count is 0', () => {
    render(<OneOnOneCard {...defaultProps} pasosValidadosCount={0} />)
    expect(screen.queryByText(/paso/)).not.toBeInTheDocument()
  })

  it('renders link to detail page', () => {
    render(<OneOnOneCard {...defaultProps} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/lider/uno-auno/123e4567')
  })

  it('shows mentor name when showMentor is true', () => {
    render(<OneOnOneCard {...defaultProps} showMentor mentorPersonaName="María García" />)
    expect(screen.getByText(/María García/)).toBeInTheDocument()
  })

  it('renders without scheduled date', () => {
    render(<OneOnOneCard {...defaultProps} scheduledAtIso={null} />)
    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
  })
})
