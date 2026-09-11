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
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { EstructuraClient } from '@/app/(auth)/admin/dream-team/estructura/estructura-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

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

function nodo(
  overrides: Partial<NodoArbol['equipo']> & Pick<NodoArbol['equipo'], 'id' | 'label'>,
  hijos: NodoArbol[] = [],
  nivel = 0,
): NodoArbol {
  return {
    equipo: { experiencia: 'dps', activo: true, ...overrides },
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
})
