/**
 * `<MiEquipoClient>` — island for /dream-team/mi-equipo (area director view).
 *
 * Covers:
 *   - renders the reachable branch with persona, rol and estado per node
 *   - renders an EmptyState explaining a possible missing area assignment
 *     when the branch is empty
 *   - hides the stage-advance control without write capability
 *   - shows the stage-advance control with write capability for a
 *     non-terminal servicio
 *
 * Unlike the servidores pool table, this island renders each node once (no
 * desktop/mobile duplication), so plain getByText/getByRole assertions
 * apply directly.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import { MiEquipoClient, type MiEquipoServicioRow } from '@/app/(auth)/dream-team/mi-equipo/mi-equipo-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
}))

function servicio(overrides: Partial<DreamTeamServicio> = {}): DreamTeamServicio {
  return {
    id: 's-1',
    personaId: personaId('p-1'),
    equipoId: 'equipo-dps',
    rolId: 'rol-cam',
    estado: 'activo',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    version: 1,
    ...overrides,
  }
}

const arbolConUnNodo: readonly NodoArbol[] = [
  { equipo: { id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true }, hijos: [], nivel: 0 },
]

describe('MiEquipoClient', () => {
  it('renders the branch with persona, rol and estado per node', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'Cámara' },
    ]
    render(<MiEquipoClient arbol={arbolConUnNodo} serviciosPorEquipo={{ 'equipo-dps': filas }} puedeEditar={false} />)

    expect(screen.getByText('DPS')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Cámara')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('renders an EmptyState explaining a possible missing area assignment when the branch is empty', () => {
    render(<MiEquipoClient arbol={[]} serviciosPorEquipo={{}} puedeEditar={false} />)
    expect(screen.getByText(/no te asignaron|todavía no/i)).toBeInTheDocument()
  })

  it('hides the stage-advance control without write capability', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'Cámara' },
    ]
    render(<MiEquipoClient arbol={arbolConUnNodo} serviciosPorEquipo={{ 'equipo-dps': filas }} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })

  it('shows the stage-advance control with write capability for a non-terminal servicio', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'Cámara' },
    ]
    render(<MiEquipoClient arbol={arbolConUnNodo} serviciosPorEquipo={{ 'equipo-dps': filas }} puedeEditar={true} />)
    expect(screen.getByRole('button', { name: 'Cambiar etapa' })).toBeInTheDocument()
  })

  it('never offers a stage-advance control for a terminal (retirado) servicio, even with write capability', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1', estado: 'retirado' }), personaNombre: 'Ana Pérez', rolLabel: 'Cámara' },
    ]
    render(<MiEquipoClient arbol={arbolConUnNodo} serviciosPorEquipo={{ 'equipo-dps': filas }} puedeEditar={true} />)
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })
})
