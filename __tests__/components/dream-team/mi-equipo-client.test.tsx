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
 *   - a virtual Grupos de Vida node's branch total includes its own
 *     servidores (the visible-equipo check covers virtual nodes too)
 *   - an equipo de dirección (`tipo: 'directores'`) renders with the badge
 *     naming what it is
 *   - a node's responsables line is suppressed WHEN it has person rows of
 *     its own (those rows already name the same people with their rol
 *     badges), and still renders when it has none — otherwise the
 *     information would disappear
 *   - every Grupos de Vida segmento AND equipo de dirección starts collapsed
 *     by default
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { MiEquipoClient, type MiEquipoServicioRow } from '@/app/(auth)/dream-team/mi-equipo/mi-equipo-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
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

const arbolConUnNodo: readonly NodoArbol<NodoEquipoArbol>[] = [
  {
    equipo: { origen: 'dream_team', id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true, responsables: [] },
    hijos: [],
    nivel: 0,
  },
]

/**
 * ONE virtual grupo node carrying a responsable, reused by the duplication
 * tests below so "with rows" and "without rows" are demonstrably the same
 * node — only `serviciosPorEquipo` differs between the two.
 */
const arbolGrupoConLideres: NodoArbol<NodoEquipoArbol> = {
  equipo: {
    origen: 'grupos_vida',
    tipo: 'grupo',
    id: 'grupo-1',
    label: 'Barquisimeto Matrimonios 1',
    activo: true,
    responsables: [{ personaId: personaId('p-gdv-1'), nombre: 'Marta Ruiz', rol: 'lider' }],
  },
  hijos: [],
  nivel: 0,
}

describe('MiEquipoClient', () => {
  // Reproduces the preview screenshot: a parent with nobody directly under it
  // but people in its descendants showed "0 personas · Sin servidores".
  it('counts the whole branch on a parent and never says "Sin servidores" when descendants serve', () => {
    const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
      {
        equipo: {
          origen: 'dream_team',
          id: 'experiencia',
          label: 'Dirección de Experiencia',
          experiencia: 'experiencia',
          activo: true,
          responsables: [],
        },
        nivel: 0,
        hijos: [
          {
            equipo: {
              origen: 'dream_team',
              id: 'camaras',
              label: 'Cámaras',
              experiencia: 'dps',
              activo: true,
              parentEquipoId: 'experiencia',
              responsables: [],
            },
            hijos: [],
            nivel: 1,
          },
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

  // ── Grupos de Vida virtual branch ──────────────────────────────────────

  it('renders a virtual Grupos de Vida grupo node — origin marker, and its own servidor rows counted in the branch total', () => {
    const arbol = [arbolGrupoConLideres]
    const filas: readonly MiEquipoServicioRow[] = [filaGdv({}, { personaNombre: 'Marta Ruiz', rolLabel: 'Líder de grupo' })]

    render(
      <MiEquipoClient arbol={arbol} rolesPorEquipo={{}} serviciosPorEquipo={{ 'grupo-1': filas }} puedeEditar={false} />,
    )

    expect(screen.getByText('Barquisimeto Matrimonios 1')).toBeInTheDocument()
    expect(screen.getAllByText('Grupos de Vida').length).toBeGreaterThan(0)
    // The visible-equipo check includes the virtual grupo id: its own
    // servidor is counted, not silently dropped as "outside the tree".
    expect(screen.getByText('1 persona')).toBeInTheDocument()
  })

  it('renders an equipo de dirección with the badge naming what it is', () => {
    const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
      {
        equipo: {
          origen: 'grupos_vida',
          tipo: 'directores',
          id: 'equipo-1',
          label: 'Morela Ocampo y Santiago Villegas',
          activo: true,
          responsables: [],
        },
        hijos: [],
        nivel: 0,
      },
    ]

    render(<MiEquipoClient arbol={arbol} rolesPorEquipo={{}} serviciosPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getByText('Morela Ocampo y Santiago Villegas')).toBeInTheDocument()
    expect(screen.getByText('Equipo de dirección')).toBeInTheDocument()
  })

  // ── No duplicated people: responsables line vs. the node's own rows ────

  /**
   * Reproduces the preview complaint verbatim: a Grupos de Vida grupo node
   * showed "Domingo Escobar — Líder · Sol Escobar — Líder" on the row and
   * then listed the same two people as person rows right below it, with
   * their rol badges. The rows are the richer rendering (estado badge,
   * origin badge), so the line above them is the one that goes.
   */
  it('suppresses the responsables line on a node that has person rows of its own', () => {
    const filas: readonly MiEquipoServicioRow[] = [
      filaGdv({ personaId: personaId('p-gdv-1') }, { personaNombre: 'Marta Ruiz', rolLabel: 'Líder de grupo' }),
    ]

    render(
      <MiEquipoClient
        arbol={[arbolGrupoConLideres]}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'grupo-1': filas }}
        puedeEditar={false}
      />,
    )

    // The person row still names her, with her rol badge.
    expect(screen.getByText('Marta Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Líder de grupo')).toBeInTheDocument()
    // ...and the row's responsables line no longer repeats it.
    expect(screen.queryByText('Marta Ruiz — Líder')).not.toBeInTheDocument()
  })

  /**
   * The SAME node with no rows keeps its line: a segmento with its director
   * general, or a Dream Team node with no servicios, would otherwise lose
   * the only mention of who is responsible for it.
   */
  it('keeps the responsables line on the same node when it has no person rows', () => {
    render(
      <MiEquipoClient arbol={[arbolGrupoConLideres]} rolesPorEquipo={{}} serviciosPorEquipo={{}} puedeEditar={false} />,
    )

    expect(screen.getByText('Marta Ruiz — Líder')).toBeInTheDocument()
  })

  it('keeps the responsables line on a parent whose people all live in its descendants', () => {
    const grupo: NodoArbol<NodoEquipoArbol> = {
      equipo: { origen: 'grupos_vida', tipo: 'grupo', id: 'grupo-1', label: 'Grupo 1', activo: true, responsables: [] },
      hijos: [],
      nivel: 1,
    }
    const segmento: NodoArbol<NodoEquipoArbol> = {
      equipo: {
        origen: 'grupos_vida',
        tipo: 'segmento',
        id: 'segmento-1',
        label: 'Matrimonios',
        activo: true,
        responsables: [{ personaId: personaId('p-dg'), nombre: 'Ana Pérez', rol: 'director_general' }],
      },
      hijos: [grupo],
      nivel: 0,
    }
    const filas: readonly MiEquipoServicioRow[] = [filaGdv({}, { personaNombre: 'Marta Ruiz', rolLabel: 'Líder de grupo' })]

    render(
      <MiEquipoClient
        arbol={[segmento]}
        rolesPorEquipo={{}}
        serviciosPorEquipo={{ 'grupo-1': filas }}
        puedeEditar={false}
      />,
    )

    // The segmento has a branch total of 1 but zero rows of its own, so
    // nothing below it duplicates its director general.
    expect(screen.getByText('Ana Pérez — Director general')).toBeInTheDocument()
  })

  it('starts every Grupos de Vida segmento AND equipo de dirección collapsed by default, while a Dream Team branch keeps expanding by default', () => {
    const grupo: NodoArbol<NodoEquipoArbol> = {
      equipo: { origen: 'grupos_vida', tipo: 'grupo', id: 'grupo-1', label: 'Grupo 1', activo: true, responsables: [] },
      hijos: [],
      nivel: 3,
    }
    const equipoDirectores: NodoArbol<NodoEquipoArbol> = {
      equipo: {
        origen: 'grupos_vida',
        tipo: 'directores',
        id: 'equipo-1',
        label: 'Morela Ocampo y Santiago Villegas',
        activo: true,
        responsables: [],
      },
      hijos: [grupo],
      nivel: 2,
    }
    const segmento: NodoArbol<NodoEquipoArbol> = {
      equipo: { origen: 'grupos_vida', tipo: 'segmento', id: 'segmento-1', label: 'Matrimonios', activo: true, responsables: [] },
      hijos: [equipoDirectores],
      nivel: 1,
    }
    const gdvRaiz: NodoArbol<NodoEquipoArbol> = {
      equipo: { origen: 'dream_team', id: 'gdv-root', label: 'Dirección de Grupos de Vida', experiencia: 'dps', activo: true, responsables: [] },
      hijos: [segmento],
      nivel: 0,
    }

    render(
      <MiEquipoClient arbol={[gdvRaiz, arbolConUnNodo[0]]} rolesPorEquipo={{}} serviciosPorEquipo={{}} puedeEditar={false} />,
    )

    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    expect(screen.queryByText('Morela Ocampo y Santiago Villegas')).not.toBeInTheDocument()
    expect(screen.queryByText('Grupo 1')).not.toBeInTheDocument()

    // Opening the segmento reveals its teams, not their grupos.
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Matrimonios' }))
    expect(screen.getByText('Morela Ocampo y Santiago Villegas')).toBeInTheDocument()
    expect(screen.queryByText('Grupo 1')).not.toBeInTheDocument()

    // Opening the team then reveals the grupos it supervises.
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Morela Ocampo y Santiago Villegas' }))
    expect(screen.getByText('Grupo 1')).toBeInTheDocument()
  })
})
