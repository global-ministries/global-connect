/**
 * `<ServidoresClient>` — island for /admin/dream-team/servidores (the pool).
 *
 * Covers:
 *   - renders the list: persona, equipo, rol, estado
 *   - filters the list by estado
 *   - hides the assigner + stage-advance controls without write capability
 *   - offers a stage-advance control only for a non-terminal servicio
 *     (retirado has no valid transitions, per TRANSICIONES_VALIDAS)
 *
 * The component renders a desktop table AND mobile cards simultaneously
 * (see components/talleres/tabla-inscripciones.tsx) — jsdom does not apply
 * the `hidden sm:block` / `sm:hidden` breakpoints, so every row's content
 * appears twice. Assertions use getAllBy* accordingly (same convention as
 * __tests__/components/talleres/tabla-inscripciones.test.tsx).
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { ServidoresClient, type ServidorRow } from '@/app/(auth)/admin/dream-team/servidores/servidores-client'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
  useSearchParams: () => new URLSearchParams(),
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

const arbol: readonly NodoArbol[] = [
  { equipo: { id: 'equipo-dps', label: 'DPS', experiencia: 'dps', activo: true }, hijos: [], nivel: 0 },
]

describe('ServidoresClient', () => {
  it('renders the list with persona, equipo, rol and estado', () => {
    const rows: ServidorRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DPS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cámara').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
  })

  it('filters the list by estado', () => {
    const rows: ServidorRow[] = [
      { servicio: servicio({ id: 's-1', estado: 'activo' }), personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
      { servicio: servicio({ id: 's-2', estado: 'postulado' }), personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.change(screen.getByLabelText('Filtrar por etapa'), { target: { value: 'postulado' } })

    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(screen.getAllByText('Luis Gómez').length).toBeGreaterThan(0)
  })

  it('filters the list by persona nombre text', () => {
    const rows: ServidorRow[] = [
      { servicio: servicio({ id: 's-1' }), personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
      { servicio: servicio({ id: 's-2' }), personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'ana' } })

    expect(screen.getAllByText('Ana Pérez').length).toBeGreaterThan(0)
    expect(screen.queryByText('Luis Gómez')).not.toBeInTheDocument()
  })

  it('hides the assigner and stage-advance controls without write capability', () => {
    const rows: ServidorRow[] = [
      { servicio: servicio({ id: 's-1', estado: 'activo' }), personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.queryByRole('button', { name: 'Asignar servicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })

  it('shows the assigner with write capability', () => {
    const rows: ServidorRow[] = []
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    expect(screen.getByRole('button', { name: 'Asignar servicio' })).toBeInTheDocument()
  })

  it('offers a stage-advance control only for a non-terminal servicio', () => {
    const rows: ServidorRow[] = [
      { servicio: servicio({ id: 's-1', estado: 'activo' }), personaNombre: 'Ana Pérez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
      { servicio: servicio({ id: 's-2', estado: 'retirado' }), personaNombre: 'Luis Gómez', equipoLabel: 'DPS', rolLabel: 'Cámara' },
    ]
    render(<ServidoresClient rows={rows} arbol={arbol} rolesPorEquipo={{}} puedeEditar={true} />)

    // Rendered twice (desktop table + mobile cards) for the single eligible
    // (non-terminal) row, and never for the retirado one.
    const cambiarButtons = screen.queryAllByRole('button', { name: 'Cambiar etapa' })
    expect(cambiarButtons.length).toBe(2)
  })
})
