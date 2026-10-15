/**
 * W13 — Tests for OneOnOneCard component.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { OneOnOneCard, varianteEstadoUnoAUno } from '@/components/pastoral/OneOnOneCard'

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

  it.each([
    ['scheduled', 'Programado', 'info'],
    ['in_progress', 'En progreso', 'warning'],
    ['completed', 'Completado', 'success'],
    ['cancelled', 'Cancelado', 'error'],
  ])('renders the %s state as "%s" with the %s status color', (estado, etiqueta, variante) => {
    render(<OneOnOneCard {...defaultProps} estado={estado} />)
    expect(screen.getByText(etiqueta)).toBeInTheDocument()
    expect(varianteEstadoUnoAUno(estado)).toBe(variante)
  })

  it('keeps an unknown state as its raw value with the neutral color', () => {
    render(<OneOnOneCard {...defaultProps} estado="otro" />)
    expect(screen.getByText('otro')).toBeInTheDocument()
    expect(varianteEstadoUnoAUno('otro')).toBe('default')
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
    const link = screen.getByRole('link', { name: 'Ver sesión 1:1 con Juan Pérez' })
    expect(link).toHaveAttribute('href', '/lider/uno-auno/123e4567')
    // 44px touch target
    expect(link).toHaveClass('size-11')
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
