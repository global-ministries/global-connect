/**
 * `<ServidoresClient>` — island for /admin/dream-team/servidores (the pool).
 *
 * Covers:
 *   - renders the list: persona, equipo, rol (humanized), estado
 *   - filters the list by estado and by persona nombre text
 *   - the primary "Asignar servicio" action (header + mobile FAB) renders
 *     only with write capability
 *   - the Filtros Sheet opens and exposes the etapa filter
 *   - the Equipo column shows the node label plus its visible ancestor path
 *   - offers a stage-advance control only for a non-terminal servicio
 *     (retirado has no valid transitions, per TRANSICIONES_VALIDAS)
 *   - a Grupos de Vida leader row (`servidor.origen === 'grupos_vida'`)
 *     renders read-only: name, humanized rol, and the 'Grupos de Vida'
 *     badge, counts as Activo, and never offers a stage-advance control —
 *     even with write capability — showing muted "Se gestiona en Grupos de
 *     Vida" text instead; an ordinary Dream Team row keeps its control
 *   - the "Equipo" select offered by the assigner never lists a virtual
 *     Grupos de Vida node — a new servicio can only ever target a real equipo
 *
 * The component renders a desktop table AND mobile cards simultaneously —
 * jsdom does not apply the `hidden md:table-cell` / `md:hidden` breakpoints,
 * so every row's content appears twice. Assertions use getAllBy*
 * accordingly (same convention as __tests__/components/talleres/tabla-inscripciones.test.tsx).
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { ServidoresClient, type ServidorRow } from '@/app/(auth)/admin/dream-team/servidores/servidores-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
  useSearchParams: () => new URLSearchParams(),
}))

// Same convention as __tests__/app/dashboard-page.test.tsx: ContenedorDashboard
// lazy-loads its header behind Suspense (async, doesn't resolve synchronously
// under jsdom) — swap it for a synchronous test double, keep everything else real.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({
    children,
    titulo,
    accionPrincipal,
  }: {
    children: React.ReactNode
    titulo?: string
    accionPrincipal?: React.ReactNode
  }) => (
    <section>
      <h1>{titulo}</h1>
      {accionPrincipal}
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

function filaDreamTeam(servicioOverrides: Partial<DreamTeamServicio>, resto: Omit<ServidorRow, 'servidor'>): ServidorRow {
  return { servidor: { origen: 'dream_team', servicio: servicio(servicioOverrides) }, ...resto }
}

function filaGdv(liderOverrides: Partial<DreamTeamLiderGdv>, resto: Omit<ServidorRow, 'servidor'>): ServidorRow {
  return { servidor: { origen: 'grupos_vida', lider: liderGdv(liderOverrides) }, ...resto }
}

const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
  {
    equipo: { origen: 'dream_team', id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true, responsables: [] },
    hijos: [],
    nivel: 0,
  },
]

// Three levels deep: DPS > Producción Técnica > Cámaras — for the ancestor
// path assertion ("DPS · Producción Técnica" for the "Cámaras" leaf).
const arbolAnidado: readonly NodoArbol<NodoEquipoArbol>[] = [
  {
    equipo: { origen: 'dream_team', id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true, responsables: [] },
    nivel: 0,
    hijos: [
      {
        equipo: {
          origen: 'dream_team',
          id: 'equipo-produccion',
          label: 'Producción Técnica',
          experiencia: 'dps',
          activo: true,
          responsables: [],
        },
        nivel: 1,
        hijos: [
          {
            equipo: {
              origen: 'dream_team',
              id: 'equipo-camaras',
              label: 'Cámaras',
              experiencia: 'dps',
              activo: true,
              responsables: [],
            },
            nivel: 2,
            hijos: [],
          },
        ],
      },
    ],
  },
]

describe('ServidoresClient', () => {
  it('renders the list with persona, equipo, humanized rol and estado', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DPS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Coordinador').length).toBeGreaterThan(0)
    expect(screen.queryByText('coordinador')).not.toBeInTheDocument()
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
  })

  it('filters the list by estado', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', estado: 'activo' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
      filaDreamTeam({ id: 's-2', estado: 'postulado' }, { personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    fireEvent.change(screen.getByLabelText('Filtrar por etapa'), { target: { value: 'postulado' } })

    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(screen.getAllByText('Luis Gómez').length).toBeGreaterThan(0)
  })

  it('filters the list by persona nombre text', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
      filaDreamTeam({ id: 's-2' }, { personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'ana' } })

    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0)
    expect(screen.queryByText('Luis Gómez')).not.toBeInTheDocument()
  })

  it('hides the "Asignar servicio" action and stage-advance controls without write capability', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', estado: 'activo' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.queryAllByRole('button', { name: 'Asignar servicio' }).length).toBe(0)
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })

  it('shows the "Asignar servicio" action (header + mobile FAB) with write capability', () => {
    const rows: ServidorRow[] = []
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    // Header accionPrincipal + mobile BotonFlotante — both accessible as
    // "Asignar servicio", each opening the same assigner dialog.
    expect(screen.getAllByRole('button', { name: 'Asignar servicio' }).length).toBeGreaterThanOrEqual(1)
  })

  it('opens the assigner dialog from the primary action', () => {
    render(<ServidoresClient rows={[]} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Asignar servicio' })[0])

    expect(screen.getByRole('heading', { name: 'Asignar servicio' })).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar persona')).toBeInTheDocument()
  })

  it('opens the Filtros sheet with the etapa select', () => {
    render(<ServidoresClient rows={[]} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

    expect(screen.getByLabelText('Filtrar por etapa')).toBeInTheDocument()
  })

  it('shows the visible ancestor path under the equipo label in the Equipo column', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', equipoId: 'equipo-camaras' }, { personaNombre: 'Ana Pérez', equipoLabel: 'Cámaras', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbolAnidado} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getAllByText('Cámaras').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DPS · Producción Técnica').length).toBeGreaterThan(0)
  })

  it('offers a stage-advance control only for a non-terminal servicio', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', estado: 'activo' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
      filaDreamTeam({ id: 's-2', estado: 'retirado' }, { personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    // Rendered twice (desktop table + mobile cards) for the single eligible
    // (non-terminal) row, and never for the retirado one.
    const cambiarButtons = screen.queryAllByRole('button', { name: 'Cambiar etapa' })
    expect(cambiarButtons.length).toBe(2)
  })

  it('renders EstadoVacio when no servicio matches the applied filter', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', estado: 'activo' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'nadie-coincide' } })

    expect(screen.getByText('No hay servicios registrados')).toBeInTheDocument()
  })

  it('renders a Grupos de Vida leader read-only — badge, counted as Activo, no stage-advance control even with write capability — while a Dream Team row keeps its control', () => {
    const rows: ServidorRow[] = [
      filaDreamTeam({ id: 's-1', estado: 'activo' }, { personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'coordinador' }),
      filaGdv({}, { personaNombre: 'Marta Ruiz', equipoLabel: 'Grupos de Vida', rolLabel: 'Líder de grupo' }),
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    expect(screen.getAllByText('Marta Ruiz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Líder de grupo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Grupos de Vida').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Se gestiona en Grupos de Vida').length).toBeGreaterThan(0)

    // Only Ana (Dream Team, non-terminal) gets a stage-advance control — desktop + mobile.
    expect(screen.queryAllByRole('button', { name: 'Cambiar etapa' }).length).toBe(2)

    // Marta counts as Activo alongside Ana in the header totals.
    expect(screen.getAllByText('Activo: 2').length).toBeGreaterThan(0)
  })

  it('never lists a virtual Grupos de Vida node in the assigner\'s "Equipo" select — only real equipos can receive a new servicio', () => {
    // Every virtual tipo, including the equipo de dirección level: a
    // 'directores' node is a grouping Grupos de Vida draws, not a
    // dream_team_equipos row, so it must be as unreachable by the assigner
    // as the segmento and the grupo already are.
    const equipoDirectores: NodoArbol<NodoEquipoArbol> = {
      equipo: {
        origen: 'grupos_vida',
        tipo: 'directores',
        id: 'equipo-1',
        label: 'Morela Ocampo y Santiago Villegas',
        activo: true,
        responsables: [],
      },
      hijos: [
        {
          equipo: { origen: 'grupos_vida', tipo: 'grupo', id: 'grupo-1', label: 'Cabudare Matrimonios 1', activo: true, responsables: [] },
          hijos: [],
          nivel: 2,
        },
      ],
      nivel: 1,
    }
    const arbolConGdv: readonly NodoArbol<NodoEquipoArbol>[] = [
      ...arbol,
      {
        equipo: { origen: 'grupos_vida', tipo: 'segmento', id: 'segmento-1', label: 'Matrimonios', activo: true, responsables: [] },
        hijos: [equipoDirectores],
        nivel: 0,
      },
    ]

    render(<ServidoresClient rows={[]} arbol={arbolConGdv} rolesPorEquipo={{}} puedeEditar={true} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Asignar servicio' })[0])

    const select = screen.getByLabelText('Equipo') as HTMLSelectElement
    const opciones = Array.from(select.options).map((o) => o.text)
    expect(opciones).toContain('DPS')
    expect(opciones).not.toContain('Matrimonios')
    expect(opciones).not.toContain('Morela Ocampo y Santiago Villegas')
    expect(opciones).not.toContain('Cabudare Matrimonios 1')
  })
})
