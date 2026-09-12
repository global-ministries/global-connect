/**
 * `<NodoFila>` — shared org-tree row, used by both estructura-client.tsx and
 * mi-equipo-client.tsx (see components/dream-team/nodo-fila.tsx).
 *
 * Covers the behaviour this feature adds on top of the pre-existing row
 * (label, experiencia badge, "Inactiva" badge, role badges, chevron,
 * accesorio — already exercised end-to-end through the two screens' own
 * tests):
 *   - a dream_team-origin node shows its experiencia badge, never the
 *     "Grupos de Vida" origin marker
 *   - a grupos_vida-origin node shows the "Grupos de Vida" origin marker
 *     instead of an experiencia badge
 *   - responsables render as "Nombre — Rol", humanized per origin (never a
 *     raw rol key), and nothing renders when there are none
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { NodoFila } from '@/components/dream-team/nodo-fila'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId } from '@/lib/platform/dream-team/types'

function nodoDreamTeam(overrides: Partial<Extract<NodoEquipoArbol, { origen: 'dream_team' }>> = {}): NodoEquipoArbol {
  return {
    origen: 'dream_team',
    id: 'dps',
    label: 'DPS',
    activo: true,
    experiencia: 'dps',
    responsables: [],
    ...overrides,
  }
}

function nodoGdv(overrides: Partial<Extract<NodoEquipoArbol, { origen: 'grupos_vida' }>> = {}): NodoEquipoArbol {
  return {
    origen: 'grupos_vida',
    tipo: 'grupo',
    id: 'grupo-1',
    label: 'Barquisimeto Matrimonios 1',
    activo: true,
    responsables: [],
    ...overrides,
  }
}

function noop(): void {}

describe('NodoFila', () => {
  it('renders the label and its experiencia badge for a dream_team node', () => {
    render(
      <NodoFila
        equipo={nodoDreamTeam({ experiencia: 'talleres_crecimiento' })}
        roles={[]}
        nivel={0}
        tieneHijos={false}
        expandido={false}
        onToggleExpandido={noop}
      />,
    )

    expect(screen.getByText('DPS')).toBeInTheDocument()
    expect(screen.getByText('Talleres de Crecimiento')).toBeInTheDocument()
    expect(screen.queryByText('Grupos de Vida')).not.toBeInTheDocument()
  })

  it('renders the "Grupos de Vida" origin marker instead of an experiencia badge for a grupos_vida node', () => {
    render(
      <NodoFila
        equipo={nodoGdv({ label: 'Matrimonios' })}
        roles={[]}
        nivel={0}
        tieneHijos={false}
        expandido={false}
        onToggleExpandido={noop}
      />,
    )

    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    expect(screen.getByText('Grupos de Vida')).toBeInTheDocument()
  })

  it('renders nothing extra when a node has no responsables', () => {
    const { container } = render(
      <NodoFila equipo={nodoDreamTeam()} roles={[]} nivel={0} tieneHijos={false} expandido={false} onToggleExpandido={noop} />,
    )
    expect(container.textContent).not.toContain('—')
  })

  it("renders a dream_team node's responsables humanized (never the raw rol key)", () => {
    render(
      <NodoFila
        equipo={nodoDreamTeam({
          responsables: [{ personaId: personaId('p-1'), nombre: 'Carla Ríos', rol: 'director' }],
        })}
        roles={[]}
        nivel={0}
        tieneHijos={false}
        expandido={false}
        onToggleExpandido={noop}
      />,
    )

    expect(screen.getByText('Carla Ríos — Director')).toBeInTheDocument()
    expect(screen.queryByText('director')).not.toBeInTheDocument()
  })

  it("renders a grupos_vida node's responsables humanized through the GdV structure label map", () => {
    render(
      <NodoFila
        equipo={nodoGdv({
          responsables: [
            { personaId: personaId('p-lider'), nombre: 'Marta Ruiz', rol: 'lider' },
            { personaId: personaId('p-colider'), nombre: 'Pedro Díaz', rol: 'colider' },
          ],
        })}
        roles={[]}
        nivel={0}
        tieneHijos={false}
        expandido={false}
        onToggleExpandido={noop}
      />,
    )

    expect(screen.getByText('Marta Ruiz — Líder')).toBeInTheDocument()
    expect(screen.getByText('Pedro Díaz — Colíder')).toBeInTheDocument()
  })

  it('keeps the pre-existing baseline behaviour: chevron toggle, Inactiva badge, role badges, accesorio', () => {
    const onToggle = jest.fn()
    render(
      <NodoFila
        equipo={nodoDreamTeam({ activo: false })}
        roles={[{ id: 'rol-1', equipoId: 'dps', label: 'coordinador', activo: true }]}
        nivel={0}
        tieneHijos={true}
        expandido={true}
        onToggleExpandido={onToggle}
        accesorio={<span>acción</span>}
      />,
    )

    expect(screen.getByText('Inactiva')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
    expect(screen.getByText('acción')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Colapsar DPS' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
