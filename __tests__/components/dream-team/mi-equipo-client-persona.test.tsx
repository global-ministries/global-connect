/**
 * `<MiEquipoClient>` lists a person once (S12): the list, the "pendientes"
 * strip and the counts of the header, cards and subtitle follow people, while
 * the etapa pills keep counting servicios (as Servidores).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { listarDirecciones, vistaDeDireccion, type PersonaEntrada, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId, type DreamTeamEstado } from '@/lib/platform/dream-team/types'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

const arbol = [nodo('dir', 'Estudiantes', [nodo('coro', 'Coro', [], 1), nodo('banda', 'Banda', [], 1)])]

function servicio(quien: string, nombre: string, equipo: string, estado: DreamTeamEstado = 'activo'): PersonaEntrada {
  return {
    clave: `${quien}-${equipo}`,
    personaId: personaId(`persona-${quien}`),
    nombre,
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    estado,
    origen: 'dream_team',
    servicioId: `servicio-${quien}-${equipo}`,
    version: 1,
  }
}

const personas: PersonasPorEquipo = {
  coro: [servicio('gabriel', 'Gabriel Salas', 'coro', 'en_orientacion'), servicio('ana', 'Ana Ruiz', 'coro')],
  banda: [servicio('gabriel', 'Gabriel Salas', 'banda', 'en_orientacion')],
}

function renderizar() {
  render(
    <MiEquipoClient
      direcciones={listarDirecciones(arbol, personas)}
      vista={vistaDeDireccion(arbol, personas, 'dir')}
      direccionId="dir"
      puedeEditar
      equiposAsignables={[]}
      rolesPorEquipo={{}}
    />,
  )
}

describe('MiEquipoClient — one row per person', () => {
  it('lists Gabriel once with both servicios, each with its own menu', () => {
    renderizar()

    const filas = within(screen.getByRole('list', { name: 'Personas del equipo' })).getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Acciones para Gabriel Salas en Banda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acciones para Gabriel Salas en Coro' })).toBeInTheDocument()
  })

  it('counts people in the subtitle, and the servicios when someone serves more than once', () => {
    renderizar()

    expect(screen.getByText('2 personas · 3 servicios')).toBeInTheDocument()
  })

  it('names a pending person once in the strip, with every team where they wait', () => {
    renderizar()

    const franja = screen.getByRole('region', { name: 'Pendientes' })
    expect(franja).toHaveTextContent('1 persona espera que la actives')
    expect(franja).toHaveTextContent('Gabriel Salas · Banda, Coro')
  })
})
