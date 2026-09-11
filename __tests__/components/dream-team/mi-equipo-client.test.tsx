/**
 * `<MiEquipoClient>` — island for /dream-team/mi-equipo (area director view).
 *
 * Covers:
 *   - renders the reachable branch using the shared node row, with a
 *     per-node person count and humanized rol/estado for each servicio
 *   - an empty node shows the muted "Sin servidores" line instead of an
 *     entire card
 *   - renders EstadoVacio explaining a possible missing area assignment
 *     when the branch is empty
 *   - hides the stage-advance control without write capability
 *   - shows the stage-advance control with write capability for a
 *     non-terminal servicio, and never for a terminal (retirado) one
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

// Same convention as __tests__/app/dashboard-page.test.tsx: ContenedorDashboard
// lazy-loads its header behind Suspense — swap for a synchronous test double.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
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
  it('renders the branch with persona, humanized rol and estado per servicio', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'coordinador' },
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={false}
      />,
    )

    expect(screen.getAllByText('DPS').length).toBeGreaterThan(0)
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
    expect(screen.queryByText('coordinador')).not.toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('shows a person count per node', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'coordinador' },
      { servicio: servicio({ id: 's-2' }), personaNombre: 'Luis Gómez', rolLabel: 'voluntario' },
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={false}
      />,
    )

    expect(screen.getByText('2 personas')).toBeInTheDocument()
  })

  it('shows the muted "Sin servidores" line for a node with nobody serving, instead of a whole card', () => {
    render(
      <MiEquipoClient arbol={arbolConUnNodo} rolesPorEquipo={{}} serviciosPorEquipo={{}} puedeEditar={false} />,
    )

    expect(screen.getByText('Sin servidores')).toBeInTheDocument()
    expect(screen.getByText('0 personas')).toBeInTheDocument()
  })

  it('renders EstadoVacio explaining a possible missing area assignment when the branch is empty', () => {
    render(<MiEquipoClient arbol={[]} rolesPorEquipo={{}} serviciosPorEquipo={{}} puedeEditar={false} />)
    expect(screen.getByText(/no alcanzás ningún equipo/i)).toBeInTheDocument()
  })

  it('hides the stage-advance control without write capability', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'coordinador' },
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })

  it('shows the stage-advance control with write capability for a non-terminal servicio', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', rolLabel: 'coordinador' },
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={true}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cambiar etapa' })).toBeInTheDocument()
  })

  it('never offers a stage-advance control for a terminal (retirado) servicio, even with write capability', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      { servicio: servicio({ id: 's-1', estado: 'retirado' }), personaNombre: 'Ana Pérez', rolLabel: 'coordinador' },
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={true}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })
})
