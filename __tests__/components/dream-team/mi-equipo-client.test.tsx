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
 *   - a Grupos de Vida leader row (`servidor.origen === 'grupos_vida'`)
 *     renders read-only: name, humanized rol, and the 'Grupos de Vida'
 *     badge, counts as Activo, and never offers a stage-advance control —
 *     even with write capability — showing muted "Se gestiona en Grupos de
 *     Vida" text instead; an ordinary Dream Team row keeps its control
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import { MiEquipoClient, type MiEquipoServicioRow } from '@/app/(auth)/dream-team/mi-equipo/mi-equipo-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'

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

function liderGdv(overrides: Partial<DreamTeamLiderGdv> = {}): DreamTeamLiderGdv {
  return {
    personaId: personaId('p-gdv-1'),
    equipoId: 'equipo-gdv',
    rol: 'lider',
    grupos: 1,
    desde: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function filaDreamTeam(servicioOverrides: Partial<DreamTeamServicio>, resto: Omit<MiEquipoServicioRow, 'servidor'>): MiEquipoServicioRow {
  return { servidor: { origen: 'dream_team', servicio: servicio(servicioOverrides) }, ...resto }
}

function filaGdv(liderOverrides: Partial<DreamTeamLiderGdv>, resto: Omit<MiEquipoServicioRow, 'servidor'>): MiEquipoServicioRow {
  return { servidor: { origen: 'grupos_vida', lider: liderGdv(liderOverrides) }, ...resto }
}

const arbolConUnNodo: readonly NodoArbol[] = [
  { equipo: { id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true }, hijos: [], nivel: 0 },
]

describe('MiEquipoClient', () => {
  // Reproduces the preview screenshot: a parent with nobody directly under it
  // but people in its descendants showed "0 personas · Sin servidores".
  it('counts the whole branch on a parent and never says "Sin servidores" when descendants serve', () => {
    const arbol: readonly NodoArbol[] = [
      {
        equipo: { id: 'experiencia', label: 'Dirección de Experiencia', experiencia: 'experiencia', activo: true },
        nivel: 0,
        hijos: [
          { equipo: { id: 'camaras', label: 'Cámaras', experiencia: 'dps', activo: true, parentEquipoId: 'experiencia' }, hijos: [], nivel: 1 },
        ],
      },
    ]
    const filas: readonly MiEquipoServicioRow[] = [
      filaDreamTeam({ id: 's-1', equipoId: 'camaras' }, { personaNombre: 'Ana Pérez', rolLabel: 'voluntario' }),
      filaDreamTeam({ id: 's-2', equipoId: 'camaras', personaId: personaId('p-2') }, { personaNombre: 'Luis Gómez', rolLabel: 'voluntario' }),
    ]

    render(
      <MiEquipoClient arbol={arbol} rolesPorEquipo={{}} serviciosPorEquipo={{ camaras: filas }} puedeEditar={false} />,
    )

    // parent: branch total, labelled as such
    expect(screen.getByText('2 en la rama')).toBeInTheDocument()
    // leaf: its own people
    expect(screen.getByText('2 personas')).toBeInTheDocument()
    // nobody in this branch is missing, so the empty line must not appear
    expect(screen.queryByText('Sin servidores')).not.toBeInTheDocument()
  })

  it('renders the branch with persona, humanized rol and estado per servicio', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
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
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
      filaDreamTeam({ id: 's-2' }, { personaNombre: 'Luis Gómez', rolLabel: 'voluntario' }),
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
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
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
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
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
      filaDreamTeam({ id: 's-1', estado: 'retirado' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
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

  it('renders a Grupos de Vida leader read-only — badge, counted as Activo, no stage-advance control even with write capability — while a Dream Team row keeps its control', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', rolLabel: 'coordinador' }),
      filaGdv({}, { personaNombre: 'Marta Ruiz', rolLabel: 'Líder de grupo' }),
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={true}
      />,
    )

    expect(screen.getByText('Marta Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Líder de grupo')).toBeInTheDocument()
    expect(screen.getByText('Grupos de Vida')).toBeInTheDocument()
    expect(screen.getByText('Se gestiona en Grupos de Vida')).toBeInTheDocument()

    // Only Ana (Dream Team) gets a stage-advance control.
    expect(screen.getAllByRole('button', { name: 'Cambiar etapa' }).length).toBe(1)

    // Marta counts as Activo alongside Ana.
    expect(screen.getByText('Activo: 2')).toBeInTheDocument()
  })

  it('shows a muted group count for a Grupos de Vida leader of more than one group, and omits it for exactly one', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      filaGdv({ grupos: 2 }, { personaNombre: 'Marta Ruiz', rolLabel: 'Líder de grupo' }),
    ]
    render(
      <MiEquipoClient
        arbol={arbolConUnNodo}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'equipo-dps': filas }}
        puedeEditar={false}
      />,
    )
    expect(screen.getByText('· 2 grupos')).toBeInTheDocument()
  })
})
