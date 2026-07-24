/**
 * W13 — Tests for PastoralTimeline component.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { PastoralTimeline } from '@/components/pastoral/PastoralTimeline'

describe('PastoralTimeline', () => {
  const items = [
    {
      id: '1',
      type: 'step_validated' as const,
      title: 'Paso: primera_conexion',
      isoDate: '2025-01-01T00:00:00Z',
      isSharedMilestone: true,
    },
    {
      id: '2',
      type: 'one_on_one' as const,
      title: 'Nota agregada',
      subtitle: 'Buen progreso...',
      isoDate: '2025-01-15T00:00:00Z',
    },
  ]

  it('renders empty message when no items', () => {
    render(<PastoralTimeline items={[]} />)
    expect(screen.getByText(/sin actividad/i)).toBeInTheDocument()
  })

  it('renders timeline items', () => {
    render(<PastoralTimeline items={items} />)
    expect(screen.getByText('Paso: primera_conexion')).toBeInTheDocument()
    expect(screen.getByText('Nota agregada')).toBeInTheDocument()
  })

  it('renders subtitle when present', () => {
    render(<PastoralTimeline items={items} />)
    expect(screen.getByText('Buen progreso...')).toBeInTheDocument()
  })

  it('renders date for each item', () => {
    render(<PastoralTimeline items={items} />)
    expect(screen.getByText(/enero/i)).toBeInTheDocument()
  })

  it('renders triada_created type', () => {
    render(<PastoralTimeline items={[
      { id: '3', type: 'triada_created' as const, title: 'Tríada creada', isoDate: '2025-02-01T00:00:00Z' }
    ]} />)
    expect(screen.getByText('Tríada creada')).toBeInTheDocument()
  })

  it('renders triada_disbanded type', () => {
    render(<PastoralTimeline items={[
      { id: '4', type: 'triada_disbanded' as const, title: 'Tríada disuelta', isoDate: '2025-03-01T00:00:00Z' }
    ]} />)
    expect(screen.getByText('Tríada disuelta')).toBeBeInTheDocument()
  })
})
