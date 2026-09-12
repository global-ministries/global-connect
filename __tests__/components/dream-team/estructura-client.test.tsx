/**
 * `<EstructuraClient>` — island for /admin/dream-team/estructura (the tree).
 *
 * Covers:
 *   - renders the tree with nested children, human labels for experiencia
 *     and rol (never a raw catalog/rol key)
 *   - hides edit controls (and the chevron stays the only interactive
 *     control) without puedeEditar
 *   - exactly two icon actions (Editar equipo, Agregar sub-equipo) per node
 *     with puedeEditar
 *   - an inactive equipo renders an "Inactiva" badge
 *   - collapsing a node with the chevron hides its children; expanding
 *     again shows them
 *   - renders EstadoVacio when the tree is empty
 *   - the edit dialog opens pre-filled with the current name
 *   - a virtual Grupos de Vida node (see
 *     lib/platform/dream-team/estructura-arbol.ts) renders its origin
 *     marker and responsables, and offers NONE of the edit actions even
 *     with puedeEditar — it isn't a row this screen owns
 *   - every Grupos de Vida segmento starts collapsed by default (its grupos
 *     stay hidden until opened), while a Dream Team branch keeps expanding
 *     by default exactly as before this feature
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { EstructuraClient } from '@/app/(auth)/admin/dream-team/estructura/estructura-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({
  crearEquipo: jest.fn(),
  renombrarEquipo: jest.fn(),
  cambiarActivoEquipo: jest.fn(),
  crearRol: jest.fn(),
  renombrarRol: jest.fn(),
  cambiarActivoRol: jest.fn(),
}))

const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: mockToastSuccess, error: mockToastError, info: jest.fn() }),
}))

// ContenedorDashboard's real implementation lazy-loads DesktopHeader (which
// renders `accionPrincipal`) behind a Suspense boundary — async in a way
// that doesn't resolve synchronously under jsdom. Same convention as
// __tests__/app/dashboard-page.test.tsx: keep every other sistema-diseno
// export real, swap only ContenedorDashboard for a synchronous test double.
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

type ArbolConEstructura = NodoArbol<NodoEquipoArbol>

function nodo(
  overrides: Partial<Extract<NodoEquipoArbol, { origen: 'dream_team' }>> & Pick<NodoEquipoArbol, 'id' | 'label'>,
  hijos: ArbolConEstructura[] = [],
  nivel = 0,
): ArbolConEstructura {
  return {
    equipo: { origen: 'dream_team', experiencia: 'dps', activo: true, responsables: [], ...overrides },
    hijos,
    nivel,
  }
}

function nodoGdv(
  overrides: Partial<Extract<NodoEquipoArbol, { origen: 'grupos_vida' }>> & Pick<NodoEquipoArbol, 'id' | 'label'>,
  hijos: ArbolConEstructura[] = [],
  nivel = 0,
): ArbolConEstructura {
  return {
    equipo: { origen: 'grupos_vida', tipo: 'segmento', activo: true, responsables: [], ...overrides },
    hijos,
    nivel,
  }
}

const rolActivo: DreamTeamRol = { id: 'rol-1', equipoId: 'dps', label: 'coordinador', activo: true }
const rolInactivo: DreamTeamRol = { id: 'rol-2', equipoId: 'dps', label: 'voluntario', activo: false }

describe('EstructuraClient', () => {
  it('renders the tree with nested children and human labels for experiencia and rol', () => {
    const hijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario', experiencia: 'talleres_crecimiento' }, [], 1)
    const arbol = [nodo({ id: 'dps', label: 'Equipo DPS' }, [hijo])]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{ dps: [rolActivo] }} puedeEditar={false} />)

    expect(screen.getByText('Equipo DPS')).toBeInTheDocument()
    expect(screen.getByText('DPS Escenario')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
    expect(screen.getByText('Talleres de Crecimiento')).toBeInTheDocument()
  })

  it('never renders a raw catalog or rol key', () => {
    const arbol = [nodo({ id: 'atraccion-equipo', label: 'Equipo de Atracción', experiencia: 'atraccion' })]

    render(
      <EstructuraClient
        arbol={arbol}
        rolesPorEquipo={{ 'atraccion-equipo': [rolActivo, rolInactivo] }}
        puedeEditar={false}
      />,
    )

    expect(screen.queryByText('atraccion')).not.toBeInTheDocument()
    expect(screen.queryByText('talleres_crecimiento')).not.toBeInTheDocument()
    expect(screen.queryByText('coordinador')).not.toBeInTheDocument()
    expect(screen.queryByText('voluntario')).not.toBeInTheDocument()
    expect(screen.getByText('Equipo de Atracción')).toBeInTheDocument()
    expect(screen.getByText('Atracción')).toBeInTheDocument()
  })

  it('hides edit controls when puedeEditar is false', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS' })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{ dps: [rolActivo] }} puedeEditar={false} />)

    expect(screen.queryByRole('button', { name: 'Editar equipo DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar sub-equipo a DPS' })).not.toBeInTheDocument()
  })

  it('shows exactly two icon actions per node when puedeEditar is true', () => {
    const hijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario' }, [], 1)
    const arbol = [nodo({ id: 'dps', label: 'DPS' }, [hijo])]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    expect(screen.getByRole('button', { name: 'Editar equipo DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar sub-equipo a DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar equipo DPS Escenario' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar sub-equipo a DPS Escenario' })).toBeInTheDocument()

    // Exactly two action buttons for the "DPS" node — anchored so it never
    // also matches the "DPS Escenario" child's own actions or DPS's chevron
    // (aria-label "Expandir DPS"/"Colapsar DPS").
    const accionesDps = screen.getAllByRole('button', { name: /^(Editar equipo|Agregar sub-equipo a) DPS$/ })
    expect(accionesDps.length).toBe(2)
  })

  it('shows an "Inactiva" badge for a deactivated equipo', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS', activo: false })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getByText('Inactiva')).toBeInTheDocument()
  })

  it('collapsing a node with the chevron hides its children, expanding shows them again', () => {
    const hijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario' }, [], 1)
    const arbol = [nodo({ id: 'dps', label: 'DPS' }, [hijo])]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getByText('DPS Escenario')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Colapsar DPS' }))
    expect(screen.queryByText('DPS Escenario')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir DPS' }))
    expect(screen.getByText('DPS Escenario')).toBeInTheDocument()
  })

  // The label swap alone ("Colapsar"/"Expandir") does not tell a screen reader
  // the disclosure's current state; aria-expanded does.
  it('exposes the disclosure state through aria-expanded', () => {
    const hijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario' }, [], 1)
    const arbol = [nodo({ id: 'dps', label: 'DPS' }, [hijo])]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    const abierto = screen.getByRole('button', { name: 'Colapsar DPS' })
    expect(abierto).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(abierto)
    expect(screen.getByRole('button', { name: 'Expandir DPS' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders EstadoVacio explaining scope limits when the tree is empty', () => {
    render(<EstructuraClient arbol={[]} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getByText(/acceso de lectura/i)).toBeInTheDocument()
  })

  it('opens the edit dialog pre-filled with the current name', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS' })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar equipo DPS' }))

    expect(screen.getByLabelText('Nombre del equipo')).toHaveValue('DPS')
  })

  it('opens the add-subteam dialog naming the parent equipo', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS' })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar sub-equipo a DPS' }))

    expect(screen.getByRole('heading', { name: 'Agregar sub-equipo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del sub-equipo')).toBeInTheDocument()
  })

  // ── Grupos de Vida virtual branch ──────────────────────────────────────

  it('renders a virtual Grupos de Vida node with its origin marker, responsables, and no edit actions even with puedeEditar', () => {
    const segmento = nodoGdv({
      id: 'segmento-1',
      label: 'Matrimonios',
      responsables: [
        { personaId: personaId('p-dg'), nombre: 'Ana Pérez', rol: 'director_general' },
        { personaId: personaId('p-de'), nombre: 'Luis Gómez', rol: 'director_etapa' },
      ],
    })
    const raiz = nodo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida' }, [segmento])

    render(<EstructuraClient arbol={[raiz]} rolesPorEquipo={{}} puedeEditar={true} />)

    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    expect(screen.getByText('Grupos de Vida')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez — Director general')).toBeInTheDocument()
    expect(screen.getByText('Luis Gómez — Director de etapa')).toBeInTheDocument()

    // The real Dream Team root still gets its edit actions...
    expect(screen.getByRole('button', { name: 'Editar equipo Dirección de Grupos de Vida' })).toBeInTheDocument()
    // ...but the virtual segmento never does, even though puedeEditar is true.
    expect(screen.queryByRole('button', { name: 'Editar equipo Matrimonios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar sub-equipo a Matrimonios' })).not.toBeInTheDocument()
  })

  it('starts every Grupos de Vida segmento collapsed by default, while a Dream Team branch keeps expanding by default', () => {
    const grupo = nodoGdv({ id: 'grupo-1', label: 'Grupo 1', tipo: 'grupo' }, [], 2)
    const segmento = nodoGdv({ id: 'segmento-1', label: 'Matrimonios' }, [grupo], 1)
    const gdvRaiz = nodo({ id: 'gdv-root', label: 'Dirección de Grupos de Vida' }, [segmento])

    const dtHijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario' }, [], 1)
    const dtRaiz = nodo({ id: 'dps', label: 'DPS' }, [dtHijo])

    render(<EstructuraClient arbol={[dtRaiz, gdvRaiz]} rolesPorEquipo={{}} puedeEditar={false} />)

    // The segmento itself is visible (its parent, the direction node, is
    // expanded by default)...
    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    // ...but its grupo is not: the segmento starts collapsed.
    expect(screen.queryByText('Grupo 1')).not.toBeInTheDocument()

    // A Dream Team branch is unaffected — still expanded by default.
    expect(screen.getByText('DPS Escenario')).toBeInTheDocument()

    // Opening the segmento reveals its grupo.
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Matrimonios' }))
    expect(screen.getByText('Grupo 1')).toBeInTheDocument()
  })
})
