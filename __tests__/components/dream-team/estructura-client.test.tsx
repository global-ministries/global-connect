import React from 'react'
import { render, screen } from '@testing-library/react'

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

function nodo(overrides: Partial<NodoArbol['equipo']> & Pick<NodoArbol['equipo'], 'id' | 'label'>, hijos: NodoArbol[] = [], nivel = 0): NodoArbol {
  return {
    equipo: { experiencia: 'dps', activo: true, ...overrides },
    hijos,
    nivel,
  }
}

const rolActivo: DreamTeamRol = { id: 'rol-1', equipoId: 'dps', label: 'Coordinador', activo: true }
const rolInactivo: DreamTeamRol = { id: 'rol-2', equipoId: 'dps', label: 'Voluntario', activo: false }

describe('EstructuraClient', () => {
  it('renders the tree with nested children and their roles', () => {
    const hijo = nodo({ id: 'dps-escenario', label: 'DPS Escenario' }, [], 1)
    const arbol = [nodo({ id: 'dps', label: 'DPS' }, [hijo])]

    render(
      <EstructuraClient
        arbol={arbol}
        rolesPorEquipo={{ dps: [rolActivo] }}
        puedeEditar={false}
      />,
    )

    expect(screen.getByText('DPS')).toBeInTheDocument()
    expect(screen.getByText('DPS Escenario')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
  })

  it('hides edit controls when puedeEditar is false', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS' })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{ dps: [rolActivo] }} puedeEditar={false} />)

    expect(screen.queryByRole('button', { name: 'Renombrar equipo DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desactivar equipo DPS|Activar equipo DPS/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar sub-equipo a DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar rol a DPS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renombrar rol Coordinador' })).not.toBeInTheDocument()
  })

  it('shows edit controls when puedeEditar is true', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS' })]

    render(<EstructuraClient arbol={arbol} rolesPorEquipo={{ dps: [rolActivo] }} puedeEditar={true} />)

    expect(screen.getByRole('button', { name: 'Renombrar equipo DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desactivar equipo DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar sub-equipo a DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar rol a DPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renombrar rol Coordinador' })).toBeInTheDocument()
  })

  it('shows an inactive indicator for a deactivated equipo and a deactivated rol', () => {
    const arbol = [nodo({ id: 'dps', label: 'DPS', activo: false })]

    render(
      <EstructuraClient
        arbol={arbol}
        rolesPorEquipo={{ dps: [rolInactivo] }}
        puedeEditar={false}
      />,
    )

    expect(screen.getByText('Inactiva')).toBeInTheDocument()
    expect(screen.getByText('Voluntario (inactivo)')).toBeInTheDocument()
  })

  it('renders an EmptyState explaining scope limits when the tree is empty', () => {
    render(<EstructuraClient arbol={[]} rolesPorEquipo={{}} puedeEditar={false} />)

    expect(screen.getByText(/no tenga acceso de lectura|no tenés acceso de lectura|acceso de lectura/i)).toBeInTheDocument()
  })
})
